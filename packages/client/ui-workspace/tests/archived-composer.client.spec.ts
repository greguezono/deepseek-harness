// @vitest-environment jsdom
/** ui-workspace composer takeover: an archived session opens read-only. */
import { Context } from '@deepseek-ai/cordis'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SlotRegistry, type SessionId, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createElement } from 'react'
import { apply, inject } from '../src/client/index.ts'
import { ArchivedReadOnlyComposer } from '../src/client/ArchivedReadOnlyComposer.tsx'
import { zh, type WorkspaceKey } from '../src/client/locales.ts'

const sid = (id: string) => id as SessionId

/** Boot the plugin over a workspaces snapshot carrying one archived id. */
async function bench(getSnapshot: () => WorkspaceListState) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'conversation.composer': { kind: 'chain', scope: 'session' } },
  } as never, () => null)
  ctx.provide('workspaces', {
    list: { getSnapshot, subscribe: () => () => {} },
  } as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('connection', {
    hostDescription: { getSnapshot: () => undefined, subscribe: () => () => {} },
  } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin({ inject: [...inject], apply }).await()
  const entry = slots.entries('conversation.composer')
    .find(candidate => candidate.component === ArchivedReadOnlyComposer)!
  return { ctx, entry, select: entry.select as (owner: ComposerChainProps) => true | null }
}

const owner = (sessionId: SessionId | undefined): ComposerChainProps => ({
  interactions: [],
  session: sessionId === undefined ? undefined : ({ sessionId } as never),
})

const listState = (archivedSessionIds: readonly SessionId[]): WorkspaceListState => ({
  items: [], archivedSessionIds, state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: undefined,
})

describe('archived read-only composer', () => {
  it('claims the composer only for a session in the archive set', async () => {
    const b = await bench(() => listState([sid('gone')]))
    expect(b.select(owner(sid('gone')))).toBe(true)
    expect(b.select(owner(sid('live')))).toBeNull()
    expect(b.select(owner(undefined))).toBeNull()
  })

  it('fails open to the live composer when the archive lookup throws', async () => {
    const b = await bench(() => { throw new Error('archive snapshot unavailable') })
    expect(b.select(owner(sid('gone')))).toBeNull()
  })

  it('states that an archived session is readable but not sendable', () => {
    render(createElement(ArchivedReadOnlyComposer, { t: (key: WorkspaceKey) => zh[key] }))
    expect(screen.getByText('已归档会话')).toBeTruthy()
    expect(screen.getByText('可以查看消息，但不能发送。')).toBeTruthy()
  })

  it('drops the registration on teardown', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: { 'conversation.composer': { kind: 'chain', scope: 'session' } },
    } as never, () => null)
    ctx.provide('workspaces', {
      list: { getSnapshot: () => listState([]), subscribe: () => () => {} },
    } as never)
    ctx.provide('sessions', {} as never)
    ctx.provide('connection', {
      hostDescription: { getSnapshot: () => undefined, subscribe: () => () => {} },
    } as never)
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('conversation.composer')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('conversation.composer')).toHaveLength(0)
  })
})
