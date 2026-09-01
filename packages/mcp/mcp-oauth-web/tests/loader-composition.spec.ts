/**
 * REAL Loader-composition test for the MCP OAuth Web stack: boots the full
 * stack (Loader + Include + WebServer + authorization + mcp-oauth-web +
 * mcp-client with an oauth config block) through a generated `cordis.yml`,
 * drives the OAuth round trip against the shared OAuth fixture, and asserts
 * the wait state, post-authorization tool publication, a tool call with the
 * grant, HMR disposal, and grant reuse across a fresh Loader tree over the
 * same temp home. Real HTTP, real node:http servers, real SDK; only the
 * `tools` registry is stubbed (the capability seam mcp-client consumes).
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import type { McpOAuthEntry } from '@deepseek-ai/dsh-mcp-oauth'
import McpOAuthController from '@deepseek-ai/dsh-mcp-oauth/controller'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { afterEach, describe, expect, it } from 'vitest'
import McpOAuthWeb from '../src/index.ts'
import { startHttpMcpFixture, type HttpMcpFixture } from '../../mcp-client/tests/http-fixture.ts'
import { startOAuthFixture, type OAuthFixture } from './oauth-fixture.ts'

const OAUTH_KEY = credentialKey('mcp-oauth', 'fixture')
const testToolSignal = new AbortController().signal

/** One registered tool definition: the execute/render/finalize surface mcp-client builds. */
interface ToolFixtureDefinition {
  execute: (args: unknown, exec: unknown) => Promise<unknown>
  output: { render: (args: unknown, value: unknown) => unknown[] }
  finalizeContent?: (exec: unknown, result: unknown) => unknown[] | undefined
}

/** Result shape the stub returns from `execute`, matching ToolExecutionSuccess. */
interface ToolFixtureResult {
  isError: boolean
  value: unknown
  content: unknown[]
}

/**
 * Minimal tools registry stub: records registrations, forwards `execute` to
 * the registered definition's `execute` + `output.render` (the real MCP
 * bridge), and unregisters on disposer. The mcp-client plugin injects `tools`
 * and calls only `register`; the test drives `execute` to prove the round trip.
 */
function createToolsFixture(): {
  register(definition: ToolFixtureDefinition & { name: string }): () => void
  get(name: string): ToolFixtureDefinition | undefined
  execute(exec: { callId: unknown; name: string; arguments: unknown; signal: AbortSignal }): Promise<ToolFixtureResult>
} {
  const tools = new Map<string, ToolFixtureDefinition>()
  return {
    register(definition) {
      tools.set(definition.name, definition)
      return () => { tools.delete(definition.name) }
    },
    get(name) {
      return tools.get(name)
    },
    async execute(exec) {
      const definition = tools.get(exec.name)
      if (definition === undefined) throw new Error(`unknown tool "${exec.name}"`)
      const toolExec = {
        callId: exec.callId, rootCallId: exec.callId, name: exec.name,
        arguments: exec.arguments, signal: exec.signal, token: Symbol(),
      }
      const value = await definition.execute(exec.arguments, toolExec)
      const content = definition.output.render(exec.arguments, value)
      const replaced = definition.finalizeContent?.(toolExec, { isError: false, value, content })
      return { isError: false, value, content: replaced ?? content }
    },
  }
}

/** Capture every log message's stringified args for the no-token-leak assertion. */
function captureLogs(ctx: Context): string[] {
  const lines: string[] = []
  ctx.logger.exporter({
    export: (message: { args: unknown[] }) => {
      lines.push(message.args.map(arg => (typeof arg === 'string' ? arg : String(arg))).join(' '))
    },
  })
  return lines
}

/** Wait until `predicate` returns true, polling on a short interval up to `timeoutMs`. */
async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

let root: string | undefined
let context: Context | undefined
let oauthFixture: OAuthFixture | undefined
let httpFixture: HttpMcpFixture | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  await oauthFixture?.close()
  oauthFixture = undefined
  await httpFixture?.close()
  httpFixture = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot a fresh Context + Loader over `configPath`; returns the context and the tools fixture instance. */
async function bootLoader(configPath: string): Promise<{ ctx: Context; tools: ReturnType<typeof createToolsFixture> }> {
  const tools = createToolsFixture()
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root!).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['fixture-dependencies', {
      name: 'fixture-dependencies',
      // Provide `tools` only once the mcpOAuth provider is up, so the OAuth
      // mcp-client entry activates after mcp-oauth-web and finds the seam.
      // In production mcp-oauth-web boots in the base patch before mcp-client
      // entries are added; this single-cordis.yml composition boots the rows
      // in parallel, so the fixture serializes the same ordering.
      async apply(c: Context) {
        await waitFor(() => c.get('mcpOAuth') !== undefined)
        c.provide('tools', tools as never)
      },
    }],
    ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
    ['@deepseek-ai/dsh-authorization', AuthorizationService],
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-mcp-oauth-web', McpOAuthWeb],
    ['@deepseek-ai/dsh-mcp-oauth/controller', McpOAuthController],
    ['@deepseek-ai/dsh-mcp-client', McpClient],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      const module = modules.get(specifier)
      if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return module
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, tools }
}

describe('real Loader composition — OAuth round trip through the Web stack', () => {
  it('boots, authorizes, calls a tool, disposes via HMR, and reuses the grant on restart', { timeout: 120_000 }, async () => {
    // --- fixtures + temp home ---
    oauthFixture = await startOAuthFixture()
    httpFixture = await startHttpMcpFixture()
    root = await mkdtemp(join(tmpdir(), 'dsh-mcp-oauth-web-loader-'))
    const configPath = join(root, 'cordis.yml')
    const home = root

    const writeConfig = (): Promise<void> => writeFile(configPath, [
      '- name: fixture-dependencies',
      '- name: \'@deepseek-ai/dsh-credentials-local\'',
      '  config:',
      '    dshHome: ' + JSON.stringify(home),
      '    watch: false',
      '- name: \'@deepseek-ai/dsh-authorization\'',
      '- name: \'@deepseek-ai/dsh-host-webserver\'',
      '  config:',
      "    host: '127.0.0.1'",
      '    port: 0',
      '- name: \'@deepseek-ai/dsh-mcp-oauth-web\'',
      '- name: \'@deepseek-ai/dsh-mcp-oauth/controller\'',
      '- id: mcp-fixture',
      '  name: \'@deepseek-ai/dsh-mcp-client\'',
      '  config:',
      '    transport: streamable-http',
      '    serverName: fixture',
      '    url: ' + JSON.stringify(oauthFixture!.resourceUrl),
      '    oauth:',
      '      credentialId: fixture',
      '      scopes: [mcp_all]',
      '      label: Fixture',
      '- id: mcp-unrelated',
      '  name: \'@deepseek-ai/dsh-mcp-client\'',
      '  config:',
      '    transport: streamable-http',
      '    serverName: unrelated',
      '    url: ' + JSON.stringify(httpFixture!.url),
      '',
    ].join('\n'))

    await writeConfig()
    const booted = await bootLoader(configPath)
    context = booted.ctx
    const tools = booted.tools
    const logs = captureLogs(context)

    // Assertion 1: zero failed entries; OAuth entry in wait state with no tools;
    // the unrelated entry's ping tool IS registered.
    expect([...context.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
    expect(tools.get('mcp__fixture__ping')).toBeUndefined()
    await waitFor(() => tools.get('mcp__unrelated__ping') !== undefined)

    // Assertion 2: the authorization seam and mcpOAuth surface expose the binding.
    const authEntries = context.authorization.list()
    expect(authEntries.some(entry => String(entry.key) === String(OAUTH_KEY))).toBe(true)
    const oauthEntries: readonly McpOAuthEntry[] = context.mcpOAuth.list()
    expect(oauthEntries).toHaveLength(1)
    const oauthEntry = oauthEntries[0]
    if (oauthEntry === undefined) throw new Error('expected one mcpOAuth binding')
    expect(oauthEntry.status.state).toBe('sign-in-required')

    // Assertion 3: drive the OAuth round trip end to end through ctx.authorization.
    const outcome = await context.authorization.begin({
      key: OAUTH_KEY,
      interaction: {
        notify: (notice) => { if (notice.url !== undefined) void oauthFixture!.authorizeAndCapture(notice.url) },
        prompt: async () => { throw new Error('no prompt expected') },
      },
    })
    expect(outcome.status).toBe('authorized')

    // Assertion 4: the OAuth client connects and its tool appears; calling it
    // succeeds; the unrelated entry stayed active the whole time.
    await waitFor(() => tools.get('mcp__fixture__ping') !== undefined)
    const result = await tools.execute({ callId: 'c1', name: 'mcp__fixture__ping', arguments: {}, signal: testToolSignal })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }])
    expect(tools.get('mcp__unrelated__ping')).toBeDefined()

    // Assertion 5: a grant record exists at mcp-oauth/fixture in the temp store;
    // no captured log line contains a live fixture access token.
    const docPath = join(home, '.credentials.yaml')
    const doc = await readFile(docPath, 'utf8')
    expect(doc).toContain(String(OAUTH_KEY))
    for (const token of oauthFixture!.tokens) {
      for (const line of logs) {
        expect(line).not.toContain(token)
      }
    }

    // Assertion 6: HMR disposal of the OAuth mcp-client entry withdraws its
    // binding, flow, and tools — the unrelated entry is untouched. Disposing
    // the entry's fiber is the HMR unload primitive (`loader.remove` calls it
    // internally); it runs the mcp-client effect disposers that withdraw the
    // binding from `ctx.mcpOAuth`, the flow from `ctx.authorization`, and the
    // tools from the registry.
    const fixtureEntry = [...context.loader.entries()].find(
      entry => entry.options.name === '@deepseek-ai/dsh-mcp-client'
        && (entry.options.config as { serverName?: string } | undefined)?.serverName === 'fixture',
    )
    expect(fixtureEntry).toBeDefined()
    await fixtureEntry!._dispose()
    await waitFor(() => context!.mcpOAuth.list().length === 0)
    expect(context.authorization.list().some(entry => String(entry.key) === String(OAUTH_KEY))).toBe(false)
    expect(tools.get('mcp__fixture__ping')).toBeUndefined()
    expect(tools.get('mcp__unrelated__ping')).toBeDefined()

    // Assertion 7: restart simulation — a fresh Loader tree over the same temp
    // home connects straight to `authorized` using the persisted grant, with no
    // new authorization.
    await context.fiber.dispose()
    context = undefined
    const restarted = await bootLoader(configPath)
    context = restarted.ctx
    const restartedTools = restarted.tools
    const restartedOauth = context.mcpOAuth.list()
    expect(restartedOauth).toHaveLength(1)
    const restartedEntry = restartedOauth[0]
    if (restartedEntry === undefined) throw new Error('expected one mcpOAuth binding after restart')
    expect(restartedEntry.status.state).toBe('authorized')
    await waitFor(() => restartedTools.get('mcp__fixture__ping') !== undefined)
    const restartedResult = await restartedTools.execute({ callId: 'c2', name: 'mcp__fixture__ping', arguments: {}, signal: testToolSignal })
    expect(restartedResult.content).toEqual([{ type: 'text', text: 'pong' }])

    // The mcpOAuth Remote namespace is discoverable: the controller (Task 3's
    // `mcpOAuthController`) is mounted on the host context.
    expect(context.mcpOAuthController).toBeDefined()
  })
})
