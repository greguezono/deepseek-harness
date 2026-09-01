/**
 * Web provider for `ctx.mcpOAuth`: SDK-driven discovery, dynamic client
 * registration, PKCE sign-in through `ctx.authorization`, one shared exact
 * `/oauth/mcp/callback` route on `ctx.webServer`, and grants persisted as
 * `GrantRecord`s through `ctx.credentials`. Never logs tokens, codes,
 * verifiers, or OAuth response bodies.
 * @module @deepseek-ai/dsh-mcp-oauth-web
 */

import { Service } from '@deepseek-ai/cordis'
import {
  McpOAuthService,
  mcpOAuthCredentialKey,
} from '@deepseek-ai/dsh-mcp-oauth'
import type {
  McpOAuthBinding, McpOAuthCredentialId, McpOAuthEntry, McpOAuthRegistration,
} from '@deepseek-ai/dsh-mcp-oauth'
import { Binding } from './binding.ts'
import { CallbackRegistry } from './callback.ts'

/**
 * The shipped Web `mcpOAuth` provider. One shared callback route lives at
 * plugin scope; each binding registers one `AuthorizationFlow` and is
 * effect-scoped by the caller. Duplicate live credential ids are rejected
 * at `register`.
 */
export class McpOAuthWebService extends McpOAuthService {
  static inject = ['credentials', 'authorization', 'webServer']

  private readonly callbacks = new CallbackRegistry()
  private readonly bindings = new Map<string, Binding>()

  /** Register the shared callback route at plugin scope. */
  async [Service.init](): Promise<void> {
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact',
      path: '/oauth/mcp/callback',
      handler: (req, res) => { this.callbacks.handler(req, res) },
    }), 'mcp-oauth-web: callback route')
    await Promise.resolve()
  }

  /**
   * Register one OAuth MCP binding. Rejects a duplicate live credential id.
   * The returned `dispose()` withdraws the flow and removes the binding from
   * `list()`.
   * @param registration - id, resource URL, scopes, and label.
   * @returns the live binding plus its registration disposer.
   */
  register(registration: McpOAuthRegistration): McpOAuthBinding & { dispose(): void } {
    const id = String(registration.credentialId)
    if (this.bindings.has(id)) {
      throw new Error(`mcp-oauth credential id "${id}" is already registered`)
    }
    const key = mcpOAuthCredentialKey(registration.credentialId)
    const binding = new Binding(
      this.ctx,
      registration.credentialId,
      key,
      registration.serverUrl,
      registration.scopes,
      registration.label,
      this.ctx.credentials,
      this.ctx.webServer,
      this.callbacks,
    )
    this.bindings.set(id, binding)
    const disposeFlow = this.ctx.authorization.registerFlow({
      key,
      label: registration.label,
      methods: [{ id: 'oauth', label: 'Sign in with your browser' }],
      run: session => binding.signIn(session),
    })
    void binding.applyStoredStatus()
    return Object.assign(binding, {
      dispose: (): void => {
        binding.markDisposed()
        disposeFlow()
        this.bindings.delete(id)
      },
    })
  }

  /** @returns every live binding's safe entry, in registration order. */
  list(): readonly McpOAuthEntry[] {
    return [...this.bindings.values()].map(binding => binding.entry())
  }

  /**
   * Delete one binding's local grant; the binding returns to `sign-in-required`.
   * @param credentialId - the binding to sign out.
   * @throws Error when no live binding has that id.
   */
  async signOut(credentialId: McpOAuthCredentialId): Promise<void> {
    const id = String(credentialId)
    const binding = this.bindings.get(id)
    if (binding === undefined) {
      throw new Error(`mcp-oauth credential id "${id}" is not registered`)
    }
    await binding.invalidate()
  }
}

export default McpOAuthWebService
