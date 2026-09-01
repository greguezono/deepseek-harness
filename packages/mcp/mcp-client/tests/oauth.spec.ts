/**
 * OAuth consumer path tests for the mcp-client plugin: the `oauth` config
 * block, binding acquisition through ctx.mcpOAuth, and the authorization
 * wait-state reconnect semantics. Uses the real SDK against the keyless HTTP
 * fixture with a scripted mcpOAuth stub — no vi.mock of the SDK.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpOAuthBinding, McpOAuthStatus } from '@deepseek-ai/dsh-mcp-oauth'
import { Config as ConfigSchema, apply } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { startHttpMcpFixture, type HttpMcpFixture } from './http-fixture.ts'

const testToolSignal = new AbortController().signal

// ---- Helpers (file-local, identical pattern to apply.spec.ts / reconnect.spec.ts) ----

async function mountRegistry(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  return ctx
}

function sleep(ms: number): Promise<void> {
  const gate: PromiseWithResolvers<void> = Promise.withResolvers()
  setTimeout(gate.resolve, ms)
  return gate.promise
}

function captureLogs(ctx: Context): { warns: string[]; errors: string[]; infos: string[] } {
  const warns: string[] = []
  const errors: string[] = []
  const infos: string[] = []
  ctx.logger.warn = ((message: unknown) => { warns.push(String(message)) }) as typeof ctx.logger.warn
  ctx.logger.error = ((message: unknown) => { errors.push(String(message)) }) as typeof ctx.logger.error
  ctx.logger.info = ((message: unknown) => { infos.push(String(message)) }) as typeof ctx.logger.info
  return { warns, errors, infos }
}

/** Scripted mcpOAuth stub: a status cell, listener set, and transport factory over the keyless fixture. */
function fakeMcpOAuth(initial: McpOAuthStatus, fixtureUrl: string): {
  service: { register(): McpOAuthBinding & { dispose(): void }; list(): readonly unknown[]; signOut(): Promise<void> }
  binding: McpOAuthBinding & { dispose(): void }
  flip(next: McpOAuthStatus): void
} {
  let statusValue: McpOAuthStatus = initial
  const listeners = new Set<(status: McpOAuthStatus) => void>()
  function setStatus(next: McpOAuthStatus): void {
    statusValue = next
    for (const listener of listeners) listener(next)
  }
  const binding: McpOAuthBinding & { dispose(): void } = {
    createTransport(headers: Record<string, string>): Transport {
      // The SDK's StreamableHTTPClientTransport has optional callback
      // properties typed without `| undefined` (exactOptionalPropertyTypes
      // mismatch); the SDK constructed the object, so the cast records only
      // that widening.
      return new StreamableHTTPClientTransport(new URL(fixtureUrl), {
        requestInit: { headers },
      }) as Transport
    },
    status: () => statusValue,
    onStatusChange(listener: (status: McpOAuthStatus) => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    noteUnauthorized: () => { setStatus({ state: 'sign-in-required' }) },
    async invalidate() { setStatus({ state: 'sign-in-required' }) },
    dispose: () => { listeners.clear() },
  }
  const service = {
    register: () => binding,
    list: () => [] as never[],
    signOut: async () => {},
  }
  return { service, binding, flip: setStatus }
}

function oauthHttpConfig(url: string, failOnStartupError = false): Config {
  return {
    transport: 'streamable-http',
    serverName: 'dd',
    url,
    headers: {},
    toolCallTimeoutMs: 60_000,
    failOnStartupError,
    oauth: { credentialId: 'dd', scopes: [], label: '' },
  }
}

// ---- Tests ----

describe('mcp-client oauth path', () => {
  let ctx: Context
  let fixture: HttpMcpFixture

  beforeEach(async () => {
    fixture = await startHttpMcpFixture()
    ctx = await mountRegistry()
  })

  afterEach(async () => {
    await ctx?.fiber.dispose()
    await fixture?.close()
  })

  it('Config accepts an oauth block only for streamable-http and rejects it beside an Authorization header', () => {
    expect(() => new ConfigSchema({
      transport: 'streamable-http', serverName: 'dd', url: 'https://x/mcp',
      headers: { authorization: 'Bearer static' },
      oauth: { credentialId: 'dd' },
    } as never)).toThrow(/oauth.*header/i)
    expect(() => new ConfigSchema({
      transport: 'stdio', serverName: 'dd', command: 'x',
      oauth: { credentialId: 'dd' },
    } as never)).toThrow()
  })

  it('an oauth entry without a mcpOAuth provider waits for the service rather than failing immediately', async () => {
    // During parallel boot, mcp-oauth-web may activate after this entry.
    // The entry waits for the internal/service event instead of throwing.
    const promise = apply(ctx, oauthHttpConfig('https://x/mcp'))
    const settled = await Promise.race([
      promise.then(() => true, () => true),
      sleep(150).then(() => false),
    ])
    expect(settled).toBe(false)
  })

  it('sign-in-required is a wait state: no tools, no reconnect burn, startup succeeds even with failOnStartupError', async () => {
    const fake = fakeMcpOAuth({ state: 'sign-in-required' }, fixture.url)
    ctx.provide('mcpOAuth', fake.service)
    const { warns } = captureLogs(ctx)

    await apply(ctx, oauthHttpConfig(fixture.url, true))

    expect(ctx.tools.get('mcp__dd__ping')).toBeUndefined()
    await sleep(50)
    expect(warns.some(line => line.includes('reconnect'))).toBe(false)
  })

  it('authorization completion starts a fresh generation and publishes tools', async () => {
    const fake = fakeMcpOAuth({ state: 'sign-in-required' }, fixture.url)
    ctx.provide('mcpOAuth', fake.service)

    await apply(ctx, oauthHttpConfig(fixture.url))
    expect(ctx.tools.get('mcp__dd__ping')).toBeUndefined()

    fake.flip({ state: 'authorized' })
    await vi.waitFor(() => { expect(ctx.tools.get('mcp__dd__ping')).toBeDefined() })

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('oauth-1'), name: 'mcp__dd__ping', arguments: {},
    })
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }])
  })

  it('unauthorized during operation returns to wait state and removes tools', async () => {
    const fake = fakeMcpOAuth({ state: 'authorized' }, fixture.url)
    ctx.provide('mcpOAuth', fake.service)
    const { warns } = captureLogs(ctx)

    await apply(ctx, oauthHttpConfig(fixture.url))
    await vi.waitFor(() => { expect(ctx.tools.get('mcp__dd__ping')).toBeDefined() })

    fake.flip({ state: 'sign-in-required' })
    await vi.waitFor(() => { expect(ctx.tools.get('mcp__dd__ping')).toBeUndefined() })

    await sleep(50)
    expect(warns.some(line => line.includes('reconnect'))).toBe(false)
  })
})
