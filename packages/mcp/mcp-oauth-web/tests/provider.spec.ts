import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialKey, CredentialRecord, CredentialRecordInfo,
} from '@deepseek-ai/dsh-credentials'
import { mcpOAuthCredentialId } from '@deepseek-ai/dsh-mcp-oauth'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import McpOAuthWeb from '../src/index.ts'
import type { McpOAuthStatus } from '@deepseek-ai/dsh-mcp-oauth'
import { startOAuthFixture, type OAuthFixture } from './oauth-fixture.ts'

/** In-memory credentials subset: the record half only, emitting `credentials/record-updated`. */
function fakeCredentials(ctx: Context): Record<string, unknown> {
  const records = new Map<CredentialKey, CredentialRecord>()
  return {
    async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> { return records.get(key) },
    async modifyRecord(
      key: CredentialKey,
      mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
    ): Promise<CredentialRecord | undefined> {
      const current = records.get(key)
      const next = await mutate(current)
      if (next === undefined) return current
      records.set(key, next)
      ctx.emit('credentials/record-updated', key)
      return next
    },
    async deleteRecord(key: CredentialKey): Promise<void> {
      if (records.delete(key)) ctx.emit('credentials/record-updated', key)
    },
    async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
      const stored = records.get(key)
      return stored === undefined
        ? { configured: false, writable: true }
        : { configured: true, kind: stored.kind, writable: true }
    },
  }
}

/** Real node:http server exposing the WebRoute contract so the callback route runs over HTTP. */
async function fakeWebServer(): Promise<{ port: number; host: string; register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void; close(): Promise<void> }> {
  const exact = new Map<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>>()
  const server = createServer((req, res) => {
    let pathname: string
    try { pathname = new URL(req.url ?? '/', 'http://x').pathname } catch { res.writeHead(400).end(); return }
    const handler = exact.get(pathname)
    if (handler === undefined) { res.writeHead(404).end(); return }
    Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500).end(); else res.destroy() })
  })
  const listening: PromiseWithResolvers<void> = Promise.withResolvers()
  server.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake web server has no TCP address')
  return {
    port: address.port,
    host: '127.0.0.1',
    register(route) { exact.set(route.path, route.handler); return () => { exact.delete(route.path) } },
    close: () => new Promise<void>((resolve, reject) => server.close((e) => { if (e === undefined) resolve(); else reject(e) })),
  }
}

const KEY = credentialKey('mcp-oauth', 'fixture')

describe('mcp-oauth-web provider', () => {
  let fixture: OAuthFixture
  let ctx: Context
  let webServer: { close(): Promise<void> } | undefined
  afterEach(async () => { await ctx?.fiber.dispose(); await webServer?.close(); await fixture?.close(); webServer = undefined })

  async function mount() {
    fixture = await startOAuthFixture()
    ctx = new Context()
    const server = await fakeWebServer()
    webServer = server
    ctx.provide('credentials', fakeCredentials(ctx) as never)
    ctx.provide('webServer', server as never)
    await ctx.plugin(AuthorizationService)
    await ctx.plugin(McpOAuthWeb)
    return ctx.mcpOAuth.register({
      credentialId: mcpOAuthCredentialId('fixture'),
      serverUrl: new URL(fixture.resourceUrl),
      scopes: ['mcp_all'],
      label: 'Fixture',
    })
  }

  async function authorize(binding: { status(): McpOAuthStatus }): Promise<void> {
    await ctx.authorization.begin({
      key: KEY,
      interaction: {
        notify: (notice) => { if (notice.url !== undefined) void fixture.authorizeAndCapture(notice.url) },
        prompt: async () => { throw new Error('no prompt expected') },
      },
    })
    expect(binding.status()).toEqual({ state: 'authorized' })
  }

  it('starts sign-in-required, authorizes end to end, and connects with the grant', async () => {
    const binding = await mount()
    expect(binding.status()).toEqual({ state: 'sign-in-required' })
    await authorize(binding)
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(binding.createTransport({}))
    const result = await client.callTool({ name: 'ping', arguments: {} })
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }])
    await client.close()
  })

  it('rejects a duplicate live credential id and frees it on dispose', async () => {
    const binding = await mount()
    expect(() => ctx.mcpOAuth.register({
      credentialId: mcpOAuthCredentialId('fixture'),
      serverUrl: new URL(fixture.resourceUrl), scopes: [], label: 'Dup',
    })).toThrow(/already/)
    binding.dispose()
    expect(ctx.mcpOAuth.list()).toEqual([])
  })

  it('callback route rejects unknown/reused state and non-GET without leaking details', async () => {
    await mount()
    const port = (ctx.webServer as { port: number }).port
    const bad = await fetch(`http://127.0.0.1:${port}/oauth/mcp/callback?state=bogus&code=x`)
    expect(bad.status).toBe(400)
    expect(await bad.text()).not.toContain('bogus')
    const post = await fetch(`http://127.0.0.1:${port}/oauth/mcp/callback`, { method: 'POST' })
    expect(post.status).toBe(405)
  })

  it('signOut deletes the grant and returns to sign-in-required', async () => {
    const binding = await mount()
    await authorize(binding)
    await ctx.mcpOAuth.signOut(mcpOAuthCredentialId('fixture'))
    expect(binding.status()).toEqual({ state: 'sign-in-required' })
  })

  it('noteUnauthorized clears tokens and re-authorization succeeds', async () => {
    const binding = await mount()
    await authorize(binding)
    fixture.tokens.clear()
    binding.noteUnauthorized()
    expect(binding.status()).toEqual({ state: 'sign-in-required' })
    await authorize(binding)
  })

  it('emits status transitions in order through onStatusChange and the cordis event', async () => {
    const binding = await mount()
    const seen: McpOAuthStatus['state'][] = []
    binding.onStatusChange(status => seen.push(status.state))
    const events: string[] = []
    ctx.on('mcp-oauth/status-changed', (_id: string, status: McpOAuthStatus) => events.push(status.state))
    await authorize(binding)
    expect(seen).toEqual(['authorizing', 'authorized'])
    expect(events).toEqual(['authorizing', 'authorized'])
  })
})
