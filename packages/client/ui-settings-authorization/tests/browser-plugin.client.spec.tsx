// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { RemoteError, TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { AuthorizationSettingsTab } from '../src/client/AuthorizationSettingsTab.tsx'
import type { AuthorizationSettingsTabInjected } from '../src/client/AuthorizationSettingsTab.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

type ListResult<T> =
  | { readonly ok: true; readonly value: readonly T[] }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

function okList<T>(value: readonly T[]): ListResult<T> { return { ok: true, value } }
function errList(code: string, message: string): ListResult<never> {
  return { ok: false, error: { code, message } }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const authorization = {
    list: vi.fn(async () => okList([
      { key: 'mcp-oauth/datadog', label: 'Datadog', methods: [{ id: 'oauth', label: 'Sign in' }], inFlight: false },
    ])),
    begin: vi.fn(),
    respond: vi.fn(async (): Promise<
      | { ok: true; value: undefined }
      | { ok: false; error: RemoteError }
    > => ({ ok: true, value: undefined })),
    cancel: vi.fn(async () => ({ ok: true, value: undefined })),
  }
  const mcpOAuth = {
    list: vi.fn(async () => okList([
      { credentialId: 'datadog', key: 'mcp-oauth/datadog', label: 'Datadog', serverUrl: 'https://mcp.datadoghq.com/mcp', status: { state: 'sign-in-required' }, loopbackOnly: false },
    ])),
    signOut: vi.fn(async () => ({ ok: true, value: undefined })),
  }
  const remote = new TestRemote(ctx, { authorization, mcpOAuth })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, remote, authorization, mcpOAuth }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-authorization browser plugin', () => {
  it('declares only the services used by the Settings contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.authorization', 'remote.mcpOAuth'])
  })

  it('registers a localized Authorization tab without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.plugins.tab')[0]!
    expect(entry.component).toBe(AuthorizationSettingsTab)
    expect(entry.options).toMatchObject({ id: 'authorization', order: 20 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('授权')
    expect(b.authorization.list).not.toHaveBeenCalled()
    expect(b.mcpOAuth.list).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => AuthorizationSettingsTabInjected)()
    // The joined list unwraps both Remote result envelopes and joins by key.
    const items = await injected.list()
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.key).toBe('mcp-oauth/datadog')
    expect(item.label).toBe('Datadog')
    expect(item.oauth?.credentialId).toBe('datadog')
    expect(item.oauth?.serverUrl).toBe('https://mcp.datadoghq.com/mcp')
    expect(b.authorization.list).toHaveBeenCalledOnce()
    expect(b.mcpOAuth.list).toHaveBeenCalledOnce()

    // A failed authorization read surfaces the Remote error code.
    b.authorization.list.mockResolvedValueOnce(errList('gateway/internal', 'no provider'))
    await expect(injected.list()).rejects.toThrow('authorization.list failed: gateway/internal: no provider')

    // The settled hook is a bare observable with the snapshot/subscribe pair.
    const settled = injected.hooks.settled
    expect(typeof settled.getSnapshot).toBe('function')
    expect(typeof settled.subscribe).toBe('function')
    expect(settled.getSnapshot()).toBe(0)

    await b.ctx.fiber.dispose()
  })

  it('bumps the settled hook when authorization/settled fires', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('settings.plugins.tab')[0]!.inject as unknown as () => AuthorizationSettingsTabInjected)()
    let notified = 0
    const off = injected.hooks.settled.subscribe(() => { notified++ })
    b.remote.emit('authorization/settled', ['mcp-oauth/datadog', 'authorized'])
    expect(notified).toBe(1)
    expect(injected.hooks.settled.getSnapshot()).toBe(1)
    off()
    // The count keeps moving on later settlements; only the listener is gone.
    b.remote.emit('authorization/settled', ['mcp-oauth/datadog', 'authorized'])
    expect(injected.hooks.settled.getSnapshot()).toBe(2)
    expect(notified).toBe(1)
    await b.ctx.fiber.dispose()
  })

  it('routes begin/respond/cancel/signOut through the Remote namespaces and unwraps results', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('settings.plugins.tab')[0]!.inject as unknown as () => AuthorizationSettingsTabInjected)()

    const frames: unknown[] = []
    b.authorization.begin.mockImplementation(async function* (_req: unknown, _signal: AbortSignal) {
      // The generated begin returns an async iterable directly; the injected
      // face iterates it and forwards each frame to onFrame.
      yield { kind: 'outcome', status: 'authorized' } as never
    })
    await injected.begin('mcp-oauth/datadog', (frame) => { frames.push(frame) }, new AbortController().signal)
    expect(b.authorization.begin).toHaveBeenCalledWith({ key: 'mcp-oauth/datadog' }, expect.any(AbortSignal))
    expect(frames.at(-1)).toEqual({ kind: 'outcome', status: 'authorized' })

    await injected.respond('mcp-oauth/datadog', 'p1', 'the-code')
    expect(b.authorization.respond).toHaveBeenCalledWith({ key: 'mcp-oauth/datadog', promptId: 'p1', answer: 'the-code' })

    await injected.cancel('mcp-oauth/datadog')
    expect(b.authorization.cancel).toHaveBeenCalledWith({ key: 'mcp-oauth/datadog' })

    await injected.signOut('datadog')
    expect(b.mcpOAuth.signOut).toHaveBeenCalledWith({ credentialId: 'datadog' })

    // A failed respond surfaces the Remote error, not a raw rejection.
    b.authorization.respond.mockResolvedValueOnce({
      ok: false, error: new RemoteError('authorization/no-prompt', 'gone', { key: 'mcp-oauth/datadog', promptId: 'p1' }),
    })
    await expect(injected.respond('mcp-oauth/datadog', 'p1')).rejects.toThrow('authorization/no-prompt')
    await b.ctx.fiber.dispose()
  })

  it('removes the tab contribution when the declarer fiber disposes', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })
})
