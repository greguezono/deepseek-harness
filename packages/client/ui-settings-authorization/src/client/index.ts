/** Authorization settings tab, browser half — sign-in surface for OAuth MCP servers and credential flows. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the 'mcpOAuth' TypertRemoteNamespaceMap merge, mounted for
// the wire in Task 8. Without it `ctx.remote.mcpOAuth` is untyped here.
import type {} from '@deepseek-ai/dsh-mcp-oauth/remote'
import type { AuthorizationEntryView } from '@deepseek-ai/dsh-api-remotes/client'
import type { McpOAuthEntry } from '@deepseek-ai/dsh-mcp-oauth/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { AuthorizationSettingsTab, type AuthorizationRowData, type AuthorizationSettingsTabInjected } from './AuthorizationSettingsTab.tsx'
import { en, zh, type AuthorizationLocaleKey } from './locales.ts'

export type { AuthorizationRowData, AuthorizationSettingsTabInjected, AuthorizationSettingsTabProps } from './AuthorizationSettingsTab.tsx'
export type { AuthorizationLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Authorization settings tab copy. */
    'settings.authorization': AuthorizationLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.authorization'

/** Services required by the Settings registration and the generated Remote faces. */
export const inject = ['slots', 'locale', 'remote', 'remote.authorization', 'remote.mcpOAuth']

/** Contribute the Authorization tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-authorization: dictionaries')

  const t = ctx.locale.bind(NS)

  const list: AuthorizationSettingsTabInjected['list'] = async () => {
    const [authResult, oauthResult] = await Promise.all([
      ctx.remote.authorization.list(),
      ctx.remote.mcpOAuth.list(),
    ])
    if (!authResult.ok) {
      throw new Error(`authorization.list failed: ${authResult.error.code}: ${authResult.error.message}`)
    }
    if (!oauthResult.ok) {
      throw new Error(`mcpOAuth.list failed: ${oauthResult.error.code}: ${oauthResult.error.message}`)
    }
    const oauthByKey = new Map(oauthResult.value.map((entry: McpOAuthEntry) => [entry.key, entry]))
    return authResult.value.map((entry: AuthorizationEntryView): AuthorizationRowData => {
      const oauth = oauthByKey.get(entry.key)
      if (oauth === undefined) {
        return { key: entry.key, label: entry.label, methods: entry.methods, inFlight: entry.inFlight }
      }
      return {
        key: entry.key,
        label: entry.label,
        methods: entry.methods,
        inFlight: entry.inFlight,
        oauth: {
          credentialId: oauth.credentialId,
          serverUrl: oauth.serverUrl,
          status: oauth.status,
          loopbackOnly: oauth.loopbackOnly,
        },
      }
    })
  }

  const begin: AuthorizationSettingsTabInjected['begin'] = async (key, onFrame, signal) => {
    for await (const frame of ctx.remote.authorization.begin({ key }, signal)) {
      onFrame(frame)
    }
  }

  const respond: AuthorizationSettingsTabInjected['respond'] = async (key, promptId, answer, declined) => {
    const request: { key: string; promptId: string; answer?: string; declined?: boolean } = { key, promptId }
    if (answer !== undefined) request.answer = answer
    if (declined !== undefined) request.declined = declined
    const result = await ctx.remote.authorization.respond(request)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  }

  const cancel: AuthorizationSettingsTabInjected['cancel'] = async (key) => {
    const result = await ctx.remote.authorization.cancel({ key })
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  }

  const signOut: AuthorizationSettingsTabInjected['signOut'] = async (credentialId) => {
    const result = await ctx.remote.mcpOAuth.signOut({ credentialId })
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  }

  // Bare counter observable bumped on every settled attempt; the renderer binds
  // it to `useSettled`, so a settlement (this tab or another) refreshes the list.
  let settledCount = 0
  const settledListeners = new Set<() => void>()
  const settled: HostObservable<number> = {
    getSnapshot: () => settledCount,
    subscribe: (fn) => {
      settledListeners.add(fn)
      return () => { settledListeners.delete(fn) }
    },
  }
  ctx.effect(() => ctx.remote.$on('authorization/settled', () => {
    settledCount++
    for (const fn of settledListeners) fn()
  }), 'ui-settings-authorization: settled')

  const injected = (): AuthorizationSettingsTabInjected => ({ list, begin, respond, cancel, signOut, hooks: { settled } })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'authorization',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, AuthorizationSettingsTab))
}
