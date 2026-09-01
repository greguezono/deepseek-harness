import { Context } from '@deepseek-ai/cordis'
import AuthorizationService, { type AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { CredentialProvider, credentialKey } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry, CredentialRecordInfo,
  CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthorizationController } from '../src/index.ts'
import type { AuthorizationBeginFrame } from '../src/types.ts'

const KEY = credentialKey('fixture', 'demo')

/**
 * Credentials stub. The authorization seam confirms a commit through the
 * `credentials/record-updated` event (what a real provider's `modifyRecord`
 * emits), not by presence alone — so this double stores the record and emits
 * the event on `modifyRecord`. `describeRecord` then reflects the stored state
 * the seam re-reads after the flow resolves. Only the record half is exercised.
 */
class FakeCredentials extends CredentialProvider {
  private readonly records = new Map<CredentialKey, CredentialRecord>()

  override resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(undefined)
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  override set(_ref: CredentialRef, _value: string): Promise<void> {
    return Promise.resolve()
  }

  override unset(_ref: CredentialRef): Promise<void> {
    return Promise.resolve()
  }

  override readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(this.records.get(key))
  }

  override describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const stored = this.records.get(key)
    return Promise.resolve(stored === undefined
      ? { configured: false, writable: true }
      : { configured: true, kind: stored.kind, writable: true })
  }

  override listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([...this.records].map(([key, record]) => ({ key, kind: record.kind })))
  }

  override async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const next = await mutate(this.records.get(key))
    if (next === undefined) return undefined
    this.records.set(key, next)
    this.ctx.emit('credentials/record-updated', key)
    return next
  }

  override deleteRecord(key: CredentialKey): Promise<void> {
    if (this.records.delete(key)) this.ctx.emit('credentials/record-updated', key)
    return Promise.resolve()
  }
}

async function mount(flowRun: (session: AuthorizationSession) => Promise<void>) {
  const ctx = new Context()
  await ctx.plugin(FakeCredentials)
  await ctx.plugin(AuthorizationService)
  const controller = new AuthorizationController(ctx)
  ctx.authorization.registerFlow({
    key: KEY,
    label: 'Fixture',
    methods: [{ id: 'oauth', label: 'Sign in' }],
    async run(session) {
      await flowRun(session)
      await ctx.credentials.modifyRecord(KEY, () =>
        Promise.resolve({ kind: 'grant', payload: { token: 'granted' } } satisfies CredentialRecord))
    },
  })
  return { ctx, controller }
}

async function collect(frames: AsyncIterable<AuthorizationBeginFrame>): Promise<AuthorizationBeginFrame[]> {
  const out: AuthorizationBeginFrame[] = []
  for await (const frame of frames) out.push(frame)
  return out
}

describe('AuthorizationController', () => {
  let dispose: (() => Promise<void>) | undefined
  afterEach(async () => { await dispose?.(); dispose = undefined })

  it('lists registered flows as wire views', async () => {
    const { ctx, controller } = await mount(async () => {})
    dispose = () => ctx.fiber.dispose()
    expect(controller.list()).toEqual([{
      key: String(KEY), label: 'Fixture',
      methods: [{ id: 'oauth', label: 'Sign in' }], inFlight: false,
    }])
  })

  it('streams notice, prompt, answer round-trip, and authorized outcome', async () => {
    const { ctx, controller } = await mount(async (session) => {
      session.notify({ message: 'Open this page', url: 'http://127.0.0.1:1/x' })
      const answer = await session.prompt({ kind: 'text', message: 'Paste the code' })
      expect(answer).toBe('the-code')
    })
    dispose = () => ctx.fiber.dispose()
    const signal = new AbortController().signal
    const frames: AuthorizationBeginFrame[] = []
    for await (const frame of controller.begin({ key: String(KEY) }, signal)) {
      frames.push(frame)
      if (frame.kind === 'prompt') {
        await controller.respond({ key: String(KEY), promptId: frame.promptId, answer: 'the-code' })
      }
    }
    expect(frames[0]).toEqual({ kind: 'notice', message: 'Open this page', url: 'http://127.0.0.1:1/x' })
    expect(frames[1]).toMatchObject({ kind: 'prompt', prompt: { kind: 'text', message: 'Paste the code' } })
    expect(frames.at(-1)).toEqual({ kind: 'outcome', status: 'authorized' })
  })

  it('declining a prompt settles the stream as cancelled', async () => {
    const { ctx, controller } = await mount(async (session) => {
      await session.prompt({ kind: 'text', message: 'Paste the code' })
    })
    dispose = () => ctx.fiber.dispose()
    const frames: AuthorizationBeginFrame[] = []
    for await (const frame of controller.begin({ key: String(KEY) }, new AbortController().signal)) {
      frames.push(frame)
      if (frame.kind === 'prompt') {
        await controller.respond({ key: String(KEY), promptId: frame.promptId, declined: true })
      }
    }
    expect(frames.at(-1)).toEqual({ kind: 'outcome', status: 'cancelled' })
  })

  it('a dropped carrier signal withdraws the attempt', async () => {
    const { ctx, controller } = await mount(async (session) => {
      await new Promise((_resolve, reject) => {
        session.signal.addEventListener('abort', () => { reject(session.signal.reason ?? new Error('withdrawn')) }, { once: true })
      })
    })
    dispose = () => ctx.fiber.dispose()
    const carrier = new AbortController()
    const stream = collect(controller.begin({ key: String(KEY) }, carrier.signal))
    await new Promise(resolve => setTimeout(resolve, 10))
    carrier.abort()
    const frames = await stream
    expect(frames.at(-1)).toEqual({ kind: 'outcome', status: 'cancelled' })
  })

  it('flow failure surfaces a safe failed outcome, not the raw error object', async () => {
    const { ctx, controller } = await mount(async () => {
      throw new Error('exchange failed: HTTP 500')
    })
    dispose = () => ctx.fiber.dispose()
    const frames = await collect(controller.begin({ key: String(KEY) }, new AbortController().signal))
    expect(frames.at(-1)).toEqual({ kind: 'outcome', status: 'failed', message: 'exchange failed: HTTP 500' })
  })

  it('respond for an unknown prompt raises authorization/no-prompt', async () => {
    const { ctx, controller } = await mount(async () => {})
    dispose = () => ctx.fiber.dispose()
    let failure: unknown
    try { controller.respond({ key: String(KEY), promptId: 'nope', answer: 'x' }) } catch (error) { failure = error }
    expect(failure).toMatchObject({ code: 'authorization/no-prompt' })
  })

  it('rejects a malformed key with authorization/invalid-key', async () => {
    const { ctx, controller } = await mount(async () => {})
    dispose = () => ctx.fiber.dispose()
    await expect(collect(controller.begin({ key: 'not a key' }, new AbortController().signal)))
      .rejects.toMatchObject({ code: 'authorization/invalid-key' })
    let cancelFailure: unknown
    try { controller.cancel({ key: 'not a key' }) } catch (error) { cancelFailure = error }
    expect(cancelFailure).toMatchObject({ code: 'authorization/invalid-key' })
  })
})
