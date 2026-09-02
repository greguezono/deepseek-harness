/**
 * Wire-safe MCP OAuth types: the branded credential id, safe status union,
 * registry entry view, and the status-changed event declaration.
 * @module @deepseek-ai/dsh-mcp-oauth/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable, profile-chosen id of one OAuth grant; the `<id>` half of `mcp-oauth/<id>`. */
export type McpOAuthCredentialId = Branded<'McpOAuthCredentialId'>

/** Safe authorization state of one binding. `error.message` excludes response bodies and callback data. */
export type McpOAuthStatus =
  | { state: 'sign-in-required' }
  | { state: 'authorizing' }
  | { state: 'authorized' }
  | { state: 'error'; message: string }

/** One live binding as a configuration surface sees it — never a token. */
export interface McpOAuthEntry {
  /** The binding's credential id (`String(credentialId)`), stable across renames of `serverName`. */
  credentialId: string
  /** Joined credential key (`mcp-oauth/<id>`) — the join column against authorization entries. */
  key: string
  /** User-facing label from the MCP entry. */
  label: string
  /** MCP resource URL, safe to display. */
  serverUrl: string
  status: McpOAuthStatus
  /**
   * True when the Web server binds all interfaces: sign-in works only from a
   * browser on the host machine (the redirect is loopback-derived).
   */
  loopbackOnly: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One binding's safe status changed (registration, sign-in progress,
     * grant commit, invalidation, sign-out). Fired only after the durable
     * state it reports is committed.
     * @mode emit
     * @param credentialId - the affected binding's credential id as a string.
     * @param status - the new safe status.
     */
    'mcp-oauth/status-changed'(credentialId: string, status: McpOAuthStatus): void
  }
}
