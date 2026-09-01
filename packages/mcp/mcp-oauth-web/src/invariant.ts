/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-mcp-oauth-web`.
 * @module @deepseek-ai/dsh-mcp-oauth-web/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-mcp-oauth-web'

/** Cordis companion plugin name. */
export const name = 'mcp-oauth-web-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Assert the status/registry relation the provider emits: a
 * `mcp-oauth/status-changed` event names a credential id that a live binding
 * owns. The plan's ideal check — `describeRecord` confirms a stored grant
 * exists for `authorized` — is async, and `fail()` throws synchronously, so a
 * sync listener cannot await it. The binding-liveness check is the
 * sync-safe downgrade; grant-record existence stays the credentials seam's
 * own commit-confirmation concern.
 */
const install: InvariantInstaller = (ctx: Context, fail: InvariantFailure) => {
  ctx.on('mcp-oauth/status-changed', (credentialId) => {
    const service = ctx.get('mcpOAuth')
    if (service === undefined) {
      fail(`mcp-oauth/status-changed for "${credentialId}" emitted without a live mcpOAuth service`)
      return
    }
    if (!service.list().some(entry => entry.credentialId === credentialId)) {
      fail(`mcp-oauth/status-changed for "${credentialId}" names no live binding — status outlived its registration`)
    }
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
