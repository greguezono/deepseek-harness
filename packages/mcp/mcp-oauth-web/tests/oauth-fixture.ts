/**
 * Loopback OAuth authorization server + protected MCP resource fixture.
 * Shared home for the mcp-oauth-web provider suite and the mcp-client e2e
 * (Task 5). Implements RFC 9728 protected-resource metadata, RFC 8414
 * authorization-server metadata, dynamic client registration, PKCE
 * authorization-code + refresh grants, and one stateless `ping` MCP tool
 * behind bearer auth. Never logs tokens, codes, or verifiers.
 */

import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

/** Running OAuth fixture. */
export interface OAuthFixture {
  /** MCP resource endpoint (401 without a valid bearer). */
  resourceUrl: string
  /** Authorization-server issuer URL (the fixture origin). */
  issuerUrl: string
  /** Drive the "browser": GET the authorize URL, follow the 302, hit the callback, return the code. */
  authorizeAndCapture(url: string): Promise<string>
  /** Currently valid access tokens; clearing one simulates server-side revocation. */
  tokens: Set<string>
  close(): Promise<void>
}

/** One pending authorization: the code_challenge and redirect target keyed by issued code. */
interface PendingAuth {
  codeChallenge: string
  redirectUri: string
}

/** S256 code challenge: base64url(sha256(verifier)). */
function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** Read a URL-encoded form body into a Map. */
async function readForm(req: IncomingMessage): Promise<Map<string, string>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return new Map(raw.split('&').filter(Boolean).map((pair) => {
    const [k = '', v = ''] = pair.split('=')
    return [decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' '))]
  }))
}

/**
 * Start the fixture. The single HTTP server serves both the OAuth endpoints
 * and the protected MCP resource at `/mcp`.
 */
export async function startOAuthFixture(): Promise<OAuthFixture> {
  const tokens = new Set<string>()
  const pending = new Map<string, PendingAuth>()
  const clients = new Map<string, string | undefined>()

  const origin = (req: IncomingMessage): string => `http://${req.headers.host}`

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') === true ? auth.slice(7) : undefined
    if (token === undefined || !tokens.has(token)) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${origin(req)}/.well-known/oauth-protected-resource"` })
      res.end()
      return
    }
    const mcp = new McpServer({ name: 'oauth-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
    mcp.registerTool('ping', { description: 'Replies pong.', inputSchema: {} }, async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }))
    const transport = new StreamableHTTPServerTransport({})
    res.on('close', () => { void transport.close(); void mcp.close() })
    await mcp.connect(transport as Transport)
    await transport.handleRequest(req, res)
  }

  const server = createServer((req, res) => {
    const handler = async (): Promise<void> => {
      const url = new URL(req.url ?? '/', origin(req))
      const pathname = url.pathname

      if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ resource: `${origin(req)}/mcp`, authorization_servers: [origin(req)] }))
        return
      }
      if (pathname === '/.well-known/oauth-authorization-server') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          issuer: origin(req),
          authorization_endpoint: `${origin(req)}/authorize`,
          token_endpoint: `${origin(req)}/token`,
          registration_endpoint: `${origin(req)}/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        }))
        return
      }
      if (pathname === '/register' && req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
        const clientId = randomBytes(8).toString('hex')
        clients.set(clientId, undefined)
        res.writeHead(201, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ...body, client_id: clientId }))
        return
      }
      if (pathname === '/authorize' && req.method === 'GET') {
        const redirectUri = url.searchParams.get('redirect_uri')
        const state = url.searchParams.get('state')
        const codeChallenge = url.searchParams.get('code_challenge')
        if (redirectUri === null || codeChallenge === null) {
          res.writeHead(400).end()
          return
        }
        const code = randomBytes(8).toString('hex')
        pending.set(code, { codeChallenge, redirectUri })
        const redirect = new URL(redirectUri)
        redirect.searchParams.set('code', code)
        if (state !== null) redirect.searchParams.set('state', state)
        res.writeHead(302, { location: redirect.toString() })
        res.end()
        return
      }
      if (pathname === '/token' && req.method === 'POST') {
        const form = await readForm(req)
        const grantType = form.get('grant_type')
        if (grantType === 'authorization_code') {
          const code = form.get('code')
          const verifier = form.get('code_verifier')
          if (code === undefined || verifier === undefined) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'invalid_grant' }))
            return
          }
          const record = pending.get(code)
          if (record === undefined) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'invalid_grant' }))
            return
          }
          pending.delete(code)
          if (s256(verifier) !== record.codeChallenge) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'invalid_grant' }))
            return
          }
          const accessToken = randomBytes(12).toString('hex')
          const refreshToken = randomBytes(12).toString('hex')
          tokens.add(accessToken)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            access_token: accessToken, token_type: 'bearer',
            refresh_token: refreshToken, expires_in: 3600,
          }))
          return
        }
        if (grantType === 'refresh_token') {
          const accessToken = randomBytes(12).toString('hex')
          tokens.add(accessToken)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: 3600 }))
          return
        }
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'unsupported_grant_type' }))
        return
      }
      if (pathname === '/mcp') {
        await handleMcp(req, res)
        return
      }
      res.writeHead(404).end()
    }
    void handler().catch((error: unknown) => {
      if (res.headersSent) res.destroy()
      else res.writeHead(500).end()
      void error
    })
  })

  const listening: PromiseWithResolvers<void> = Promise.withResolvers()
  server.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('OAuth fixture has no TCP address')
  const base = `http://127.0.0.1:${address.port}`

  async function authorizeAndCapture(authUrl: string): Promise<string> {
    const redirected = await fetch(authUrl, { redirect: 'manual' })
    const location = redirected.headers.get('location')
    if (location === null) throw new Error('the authorize endpoint did not redirect')
    const callbackUrl = new URL(location, authUrl)
    const code = callbackUrl.searchParams.get('code')
    await fetch(callbackUrl.toString())
    return code ?? ''
  }

  return {
    resourceUrl: `${base}/mcp`,
    issuerUrl: base,
    authorizeAndCapture,
    tokens,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error === undefined) resolve(); else reject(error) })
    }),
  }
}
