/**
 * Service Definition for the MCP OAuth capability seam (`ctx.mcpOAuth`):
 * OAuth-aware MCP consumers register one binding per grant and receive
 * transport support plus safe status; a provider owns the whole OAuth
 * protocol. This package contains no Web, UI, storage, or Datadog behavior.
 *
 * @module @deepseek-ai/dsh-mcp-oauth
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialKey, isCredentialKeySegment } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpOAuthCredentialId, McpOAuthEntry, McpOAuthStatus } from './types.ts'

export type { McpOAuthCredentialId, McpOAuthEntry, McpOAuthStatus } from './types.ts'
export { McpOAuthController } from './controller.ts'

/** The credential-record scope every provider writes under. */
export const MCP_OAUTH_SCOPE = 'mcp-oauth'

/**
 * Brand one raw config string as a {@link McpOAuthCredentialId}.
 * @param value - candidate id; a lowercase hyphenated identifier.
 * @returns the branded id.
 * @throws TypeError when the value cannot be a credential-key segment.
 */
export function mcpOAuthCredentialId(value: string): McpOAuthCredentialId {
  if (!isCredentialKeySegment(value)) {
    throw new TypeError(`mcp-oauth credentialId "${value}" must be a lowercase hyphenated identifier`)
  }
  return brandString<McpOAuthCredentialId>(value)
}

/**
 * The credential key one id's grant is stored under.
 * @param id - the branded credential id.
 * @returns `credentialKey('mcp-oauth', id)`.
 */
export function mcpOAuthCredentialKey(id: McpOAuthCredentialId): CredentialKey {
  return credentialKey(MCP_OAUTH_SCOPE, String(id))
}

/** What one OAuth MCP consumer registers. */
export interface McpOAuthRegistration {
  credentialId: McpOAuthCredentialId
  /** The MCP resource URL; a grant never silently serves a different resource. */
  serverUrl: URL
  /** Scopes to request; empty omits the scope parameter. */
  scopes: readonly string[]
  /** User-facing label for status surfaces and the authorization flow. */
  label: string
}

/**
 * One live binding. Exposes transport support and safe state only — never
 * tokens, authorization codes, PKCE verifiers, or raw credential records.
 */
export interface McpOAuthBinding {
  /**
   * Create one OAuth-enabled Streamable HTTP transport for a fresh MCP
   * client generation.
   * @param headers - the entry's non-Authorization static headers.
   * @returns a transport whose requests carry and refresh the grant.
   */
  createTransport(headers: Record<string, string>): Transport
  /** @returns the binding's current safe status. */
  status(): McpOAuthStatus
  /**
   * Observe safe status changes; the consumer restarts its connection on
   * `authorized` and removes tools on `sign-in-required`.
   * @param listener - called with each new status after commit.
   * @returns disposer removing the listener.
   */
  onStatusChange(listener: (status: McpOAuthStatus) => void): () => void
  /**
   * Tell the provider the server refused the current grant (an
   * `UnauthorizedError` outside the provider's own refresh path), so status
   * returns to `sign-in-required` and stale tokens are cleared.
   */
  noteUnauthorized(): void
  /** Delete the local grant and return to `sign-in-required`. */
  invalidate(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpOAuth: McpOAuthService
  }
}

/**
 * Abstract MCP OAuth service. A provider owns discovery, registration, PKCE,
 * callback handling, token exchange/refresh, grant persistence, and the
 * per-binding authorization flow; it rejects duplicate live credential ids at
 * `register` and removes the binding's status contribution on disposal.
 */
export abstract class McpOAuthService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'mcpOAuth')
  }

  /**
   * Register one OAuth MCP binding. Effect-scoped by the caller: disposing
   * the returned binding's registration withdraws its flow and status.
   * @param registration - id, resource URL, scopes, and label.
   * @returns the live binding.
   * @throws Error when the credential id is already live.
   */
  abstract register(registration: McpOAuthRegistration): McpOAuthBinding & { dispose(): void }

  /** @returns every live binding's safe entry, in registration order. */
  abstract list(): readonly McpOAuthEntry[]

  /**
   * Delete one binding's local grant; the binding returns to `sign-in-required`.
   * @param credentialId - the binding to sign out.
   * @throws Error when no live binding has that id.
   */
  abstract signOut(credentialId: McpOAuthCredentialId): Promise<void>
}

export default McpOAuthService
