/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-mcp-oauth`.
 * @module @deepseek-ai/dsh-mcp-oauth/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-mcp-oauth'

/** Cordis companion plugin name. */
export const name = 'mcp-oauth-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Assert the status/registry relation: a `mcp-oauth/status-changed` event
 * names a credential id that a live binding owns. Without a mounted
 * `mcpOAuth` provider the event has no owner and is itself the defect.
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
