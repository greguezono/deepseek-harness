/**
 * Single-use, expiring state → attempt dispatch map plus the shared GET
 * callback route handler. The route dispatches only by the cryptographically
 * random `state` parameter and never logs query strings, codes, or tokens.
 * @module @deepseek-ai/dsh-mcp-oauth-web/callback
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** One pending callback: how to deliver the code and how to time it out. */
interface Pending {
  resolve: (code: string) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

/** Static success page returned to the browser on a completed callback. */
const AUTHORIZED_HTML = '<!doctype html><html><body><p>Authorized — return to DSH.</p></body></html>'
/** Generic error page; never echoes the state, code, or error description. */
const ERROR_HTML = '<!doctype html><html><body><p>The authorization callback was not expected.</p></body></html>'

/** Default callback wait before the attempt expires. */
const DEFAULT_TTL_MS = 10 * 60 * 1000

/**
 * Shared callback dispatch. One instance lives on the service; every
 * binding's attempt registers its state here and awaits the code.
 */
export class CallbackRegistry {
  private readonly pending = new Map<string, Pending>()

  /**
   * Register one attempt's state and await the authorization code.
   * Resolves when the callback route delivers a code; rejects on signal
   * abort (the attempt was withdrawn) or TTL expiry.
   * @param state - the random state the SDK embedded in the authorization URL.
   * @param signal - aborted when the authorization attempt is withdrawn.
   * @param ttlMs - how long to wait before expiring the callback.
   * @returns the authorization code delivered by the callback route.
   */
  expect(state: string, signal: AbortSignal, ttlMs = DEFAULT_TTL_MS): Promise<string> {
    const { promise, resolve, reject } = Promise.withResolvers<string>()
    const timer = setTimeout(() => {
      if (this.pending.delete(state)) reject(new Error('the OAuth callback timed out'))
    }, ttlMs)
    this.pending.set(state, { resolve, reject, timer })
    signal.addEventListener('abort', () => {
      if (this.pending.delete(state)) {
        clearTimeout(timer)
        reject(signal.reason ?? new Error('the authorization attempt was withdrawn'))
      }
    }, { once: true })
    return promise
  }

  /**
   * The shared route handler. GET only; dispatch by `state`; single-use
   * (a state is consumed on first hit); 400 for unknown, expired, or reused
   * state. The response body never echoes the state, code, or OAuth error
   * description — only a static page.
   * @param req - the inbound HTTP request.
   * @param res - the response the handler owns.
   */
  handler(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'GET') { res.writeHead(405).end(); return }
    const url = new URL(req.url ?? '/', 'http://x')
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    if (state === null) { res.writeHead(400, { 'content-type': 'text/html' }).end(ERROR_HTML); return }
    const entry = this.pending.get(state)
    if (entry === undefined) { res.writeHead(400, { 'content-type': 'text/html' }).end(ERROR_HTML); return }
    this.pending.delete(state)
    clearTimeout(entry.timer)
    if (error !== null) {
      entry.reject(new Error(`the authorization server returned error "${error}"`))
      res.writeHead(400, { 'content-type': 'text/html' }).end(ERROR_HTML)
    } else if (code !== null) {
      entry.resolve(code)
      res.writeHead(200, { 'content-type': 'text/html' }).end(AUTHORIZED_HTML)
    } else {
      entry.reject(new Error('the OAuth callback carried no authorization code'))
      res.writeHead(400, { 'content-type': 'text/html' }).end(ERROR_HTML)
    }
  }
}
