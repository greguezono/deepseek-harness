/**
 * One live OAuth MCP binding: owns the safe status cell, the listener set,
 * the SDK {@link OAuthClientProvider} implementation, and the attempt-scoped
 * verifier/state. Sign-in runs only inside the registered
 * {@link AuthorizationFlow} via {@link Binding.signIn}. Tokens, codes, and
 * verifiers never leave this class except into the credential record store.
 * @module @deepseek-ai/dsh-mcp-oauth-web/binding
 */

import { Context } from '@deepseek-ai/cordis'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type {
  McpOAuthBinding, McpOAuthCredentialId, McpOAuthEntry, McpOAuthStatus,
} from '@deepseek-ai/dsh-mcp-oauth'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { randomBytes } from 'node:crypto'
import { CallbackRegistry } from './callback.ts'
import {
  parseGrantPayload, serializeGrantPayload,
  type GrantBindingFacts, type GrantPayload,
} from './grant.ts'

/** One in-flight authorization attempt: the signal, the surface, and per-attempt PKCE state. */
interface Attempt {
  signal: AbortSignal
  session: AuthorizationSession
  state: string
  codeVerifier: string
  codePromise: Promise<string> | undefined
}

/** The safe failure text a status surface may see: the error's message, nothing else. */
function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * SDK-facing {@link OAuthClientProvider} bound to one grant record and one
 * live attempt. Maps SDK calls onto grant-record operations:
 * `clientInformation`/`saveClientInformation` and `tokens`/`saveTokens` read
 * and write the grant through `modifyRecord`; `codeVerifier`/`saveCodeVerifier`
 * and `state` hold per-attempt state; `redirectUrl` is loopback-derived;
 * `redirectToAuthorization` hands the URL to the running session's notify.
 */
class BindingClientProvider implements OAuthClientProvider {
  constructor(private readonly binding: Binding) {}

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.binding.webServer.port}/oauth/mcp/callback`
  }

  get clientMetadata(): OAuthClientMetadata {
    const redirect = this.redirectUrl
    const scope = this.binding.scopes.length > 0 ? this.binding.scopes.join(' ') : undefined
    return {
      redirect_uris: [redirect],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: this.binding.label,
      ...scope === undefined ? {} : { scope },
    }
  }

  state(): string {
    const value = randomBytes(32).toString('base64url')
    this.binding.rememberState(value)
    return value
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return (await this.binding.readGrant())?.clientInformation
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await this.binding.saveClientInformation(info)
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.binding.readGrant())?.tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.binding.saveTokens(tokens)
  }

  redirectToAuthorization(url: URL): void {
    this.binding.publishAuthUrl(url)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.binding.saveCodeVerifier(codeVerifier)
  }

  async codeVerifier(): Promise<string> {
    return this.binding.codeVerifier()
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    await this.binding.invalidateScope(scope)
  }
}

/**
 * One registered OAuth MCP binding. Exposes safe transport support and state
 * only — never tokens, codes, or verifiers. Status transitions are
 * commit-then-emit: `saveTokens` commits via `modifyRecord` before flipping
 * to `authorized`; `invalidate`/`signOut` commit via `deleteRecord` before
 * flipping to `sign-in-required`.
 */
export class Binding implements McpOAuthBinding {
  private readonly provider = new BindingClientProvider(this)
  private statusValue: McpOAuthStatus = { state: 'sign-in-required' }
  private readonly listeners = new Set<(status: McpOAuthStatus) => void>()
  private attempt: Attempt | undefined
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly credentialId: McpOAuthCredentialId,
    private readonly key: CredentialKey,
    private readonly serverUrl: URL,
    readonly scopes: readonly string[],
    readonly label: string,
    private readonly credentials: CredentialProvider,
    readonly webServer: WebServer,
    private readonly callbacks: CallbackRegistry,
  ) {}

  /** The registration facts a stored grant must match to be usable. */
  private get facts(): GrantBindingFacts {
    return { serverUrl: this.serverUrl.toString(), scopes: this.scopes }
  }

  /**
   * Create one OAuth-enabled Streamable HTTP transport for a fresh MCP
   * client generation. The SDK attaches and refreshes tokens through the
   * binding's provider.
   * @param headers - the entry's non-Authorization static headers.
   */
  createTransport(headers: Record<string, string>): Transport {
    // The SDK's StreamableHTTPClientTransport has optional callback properties
    // typed without `| undefined` (exactOptionalPropertyTypes mismatch with
    // the Transport interface); the SDK constructed the object, so the cast
    // records only that widening.
    return new StreamableHTTPClientTransport(this.serverUrl, {
      requestInit: { headers },
      authProvider: this.provider,
    }) as Transport
  }

  /** @returns the binding's current safe status. */
  status(): McpOAuthStatus {
    return this.statusValue
  }

  /**
   * Observe safe status changes after each committed transition.
   * @param listener - called with each new status.
   * @returns disposer removing the listener.
   */
  onStatusChange(listener: (status: McpOAuthStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * The server refused the grant outside the provider's own refresh path.
   * Synchronously returns to `sign-in-required` and clears stale tokens in
   * the background so the next sign-in starts fresh.
   */
  noteUnauthorized(): void {
    this.setStatus({ state: 'sign-in-required' })
    void this.modifyGrant((payload) => {
      if (payload === undefined) return undefined
      const next = { ...payload }
      delete next.tokens
      return next
    })
  }

  /** Delete the local grant and return to `sign-in-required`. */
  async invalidate(): Promise<void> {
    await this.credentials.deleteRecord(this.key)
    this.setStatus({ state: 'sign-in-required' })
  }

  /** One binding's safe entry for `list()`. */
  entry(): McpOAuthEntry {
    return {
      credentialId: String(this.credentialId),
      key: String(this.key),
      label: this.label,
      serverUrl: this.serverUrl.toString(),
      status: this.statusValue,
      loopbackOnly: this.webServer.host !== '127.0.0.1',
    }
  }

  /** Suppress further status emissions after the service removes this binding. */
  markDisposed(): void {
    this.disposed = true
  }

  /**
   * Run one authorization attempt inside the registered flow. Calls SDK
   * `auth()` to discover, register, and redirect; on `REDIRECT` awaits the
   * callback-delivered code, then exchanges it. Tokens commit through
   * `modifyRecord` before this resolves (the seam confirms the commit).
   * @param session - the chosen method, the cancellation signal, and the notify callback.
   */
  async signIn(session: AuthorizationSession): Promise<void> {
    const controller = new AbortController()
    const forward = (): void => { controller.abort(session.signal.reason) }
    session.signal.addEventListener('abort', forward, { once: true })
    const attempt: Attempt = { signal: controller.signal, session, state: '', codeVerifier: '', codePromise: undefined }
    this.attempt = attempt
    this.setStatus({ state: 'authorizing' })
    try {
      const serverUrl = this.serverUrl.toString()
      const scope = this.scopes.length > 0 ? this.scopes.join(' ') : undefined
      const first = await auth(this.provider, scope === undefined ? { serverUrl } : { serverUrl, scope })
      if (first === 'REDIRECT') {
        if (attempt.codePromise === undefined) throw new Error('the authorization URL was not published')
        const code = await attempt.codePromise
        await auth(this.provider, { serverUrl, authorizationCode: code })
      }
    } catch (error) {
      if (controller.signal.aborted) {
        this.setStatus({ state: 'sign-in-required' })
      } else {
        this.setStatus({ state: 'error', message: safeMessage(error) })
      }
      throw error
    } finally {
      session.signal.removeEventListener('abort', forward)
      this.attempt = undefined
    }
  }

  /** Remember the state the SDK generated for this attempt. */
  rememberState(state: string): void {
    if (this.attempt !== undefined) this.attempt.state = state
  }

  /**
   * Publish the authorization URL: register the state in the callback
   * registry and notify the human. Outside an attempt (transport-initiated
   * auth with no human to drive the browser) the binding returns to
   * `sign-in-required` instead.
   */
  publishAuthUrl(url: URL): void {
    if (this.attempt === undefined) {
      this.setStatus({ state: 'sign-in-required' })
      return
    }
    const state = url.searchParams.get('state')
    if (state === null) throw new Error('the authorization URL carries no state parameter')
    this.attempt.state = state
    this.attempt.codePromise = this.callbacks.expect(state, this.attempt.signal)
    this.attempt.session.notify({ message: 'Open this page to sign in', url: String(url) })
  }

  /** Persist the PKCE verifier and the pending block before the URL is published. */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    if (this.attempt === undefined) throw new Error('no authorization attempt is running')
    this.attempt.codeVerifier = codeVerifier
    const redirectUri = this.provider.redirectUrl
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await this.modifyGrant(payload => ({
      serverUrl: this.serverUrl.toString(),
      scopes: this.scopes,
      ...(payload?.clientInformation !== undefined ? { clientInformation: payload.clientInformation } : {}),
      ...(payload?.tokens !== undefined ? { tokens: payload.tokens } : {}),
      pending: { state: this.attempt?.state ?? '', codeVerifier, redirectUri, expiresAt },
    }))
  }

  /** @returns the PKCE verifier for the running attempt. */
  async codeVerifier(): Promise<string> {
    if (this.attempt === undefined) throw new Error('no authorization attempt is running')
    return this.attempt.codeVerifier
  }

  /** Merge registered client information into the grant record. */
  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await this.modifyGrant(payload => ({
      serverUrl: this.serverUrl.toString(),
      scopes: this.scopes,
      ...(payload?.tokens !== undefined ? { tokens: payload.tokens } : {}),
      ...(payload?.pending !== undefined ? { pending: payload.pending } : {}),
      clientInformation: info,
    }))
  }

  /** Commit tokens, then flip to `authorized` (commit-then-emit). */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.modifyGrant(payload => ({
      serverUrl: this.serverUrl.toString(),
      scopes: this.scopes,
      ...(payload?.clientInformation !== undefined ? { clientInformation: payload.clientInformation } : {}),
      tokens,
    }))
    this.setStatus({ state: 'authorized' })
  }

  /** Clear credentials per the SDK's invalidation scope. */
  async invalidateScope(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'all') {
      await this.credentials.deleteRecord(this.key)
      return
    }
    if (scope === 'tokens') {
      await this.modifyGrant((payload) => {
        if (payload === undefined) return undefined
        const next = { ...payload }
        delete next.tokens
        return next
      })
      return
    }
    if (scope === 'client') {
      await this.modifyGrant((payload) => {
        if (payload === undefined) return undefined
        const next = { ...payload }
        delete next.clientInformation
        return next
      })
    }
  }

  /** Read and validate the stored grant; a stale payload reads as absent. */
  async readGrant(): Promise<GrantPayload | undefined> {
    const record = await this.credentials.readRecord(this.key)
    if (record === undefined || record.kind !== 'grant') return undefined
    return parseGrantPayload(record.payload, this.facts)
  }

  /** On registration, flip to `authorized` when a stored grant already has tokens. */
  async applyStoredStatus(): Promise<void> {
    const grant = await this.readGrant()
    if (grant?.tokens !== undefined) this.setStatus({ state: 'authorized' })
  }

  /** Serialized read-modify-write over the grant record. */
  private async modifyGrant(update: (payload: GrantPayload | undefined) => GrantPayload | undefined): Promise<void> {
    await this.credentials.modifyRecord(this.key, async (current: CredentialRecord | undefined) => {
      const existing = current !== undefined && current.kind === 'grant'
        ? parseGrantPayload(current.payload, this.facts)
        : undefined
      const next = update(existing)
      if (next === undefined) return current
      return { kind: 'grant' as const, payload: serializeGrantPayload(next) }
    })
  }

  /** Commit-then-emit: set the status, fire the cordis event, notify listeners. */
  private setStatus(next: McpOAuthStatus): void {
    if (this.disposed) return
    this.statusValue = next
    this.ctx.emit('mcp-oauth/status-changed', String(this.credentialId), next)
    for (const listener of this.listeners) {
      try { listener(next) } catch { /* a consumer listener failure must not break the transition */ }
    }
  }
}
