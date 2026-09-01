/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-mcp-oauth-web`.
 * @module @deepseek-ai/dsh-mcp-oauth-web/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-mcp-oauth-web'

/** Cordis companion plugin name. */
export const name = 'mcp-oauth-web-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the `mcp-oauth/status-changed` event/registry relation
 * is owned by the `dsh-mcp-oauth` Service Definition package, which declares
 * the event. A provider-specific grant-existence check would need async
 * `readRecord`, but `fail()` throws synchronously. The binding-liveness check
 * the Service Definition invariant already runs is the sync-safe version.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
