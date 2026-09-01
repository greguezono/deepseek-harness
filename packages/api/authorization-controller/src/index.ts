/**
 * Host Remote owner for the generic authorization surface (`authorization`
 * namespace): safe listing, streamed attempts, prompt answers, and cancel over
 * `ctx.authorization`. Notices and prompts stay scoped to the requesting
 * carrier; secrets never ride a frame — only what a flow chose to show or ask.
 *
 * @module @deepseek-ai/dsh-api-authorization-controller
 */

import { Context } from '@deepseek-ai/cordis'
import type {
  AuthorizationInteraction, AuthorizationPrompt,
} from '@deepseek-ai/dsh-authorization'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AuthorizationBeginFrame, AuthorizationBeginRequest, AuthorizationEntryView, AuthorizationPromptView,
  AuthorizationRespondRequest,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `authorization` Remote namespace. */
    authorizationController: AuthorizationController
  }
}

/** One pending prompt: settle with the human's answer or decline. */
interface PendingPrompt {
  resolve: (answer: string) => void
  decline: () => void
}

/** Project a Host prompt onto its wire view (drops the Host-only `signal`). */
function promptView(prompt: AuthorizationPrompt): AuthorizationPromptView {
  switch (prompt.kind) {
    case 'select':
      return { kind: 'select', message: prompt.message, options: prompt.options }
    case 'secret':
    case 'text':
      return {
        kind: prompt.kind,
        message: prompt.message,
        ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
      }
  }
}

/** The safe failure text a browser may see: the error's message, nothing else. */
function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Host service backing the generated `ctx.remote.authorization` namespace.
 * One live attempt per key (the seam's own rule); prompts are answered by
 * `respond`, addressed by the promptId the stream carried.
 */
export class AuthorizationController extends TypertRemoteService {
  static inject = ['authorization']

  /** Pending prompts per running attempt. */
  private readonly prompts = new Map<CredentialKey, Map<string, PendingPrompt>>()
  private promptSeq = 0

  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
  }

  /** @returns every registered flow as a wire view, in registration order. */
  @Remote('list')
  list(): readonly AuthorizationEntryView[] {
    return this.ctx.authorization.list().map(entry => ({
      key: String(entry.key),
      label: entry.label,
      methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
      inFlight: entry.inFlight,
    }))
  }

  /**
   * Run one attempt and stream its notices, prompts, and final outcome.
   * @param request - the key and optional method.
   * @param signal - carrier cancellation; a dropped connection withdraws the attempt.
   * @returns frames ending with exactly one `outcome`.
   */
  @Remote({ mode: 'stream' })
  async *begin(request: AuthorizationBeginRequest, signal: AbortSignal): AsyncIterable<AuthorizationBeginFrame> {
    const key = this.parseKey(request.key)
    const queue: AuthorizationBeginFrame[] = []
    let wake: (() => void) | undefined
    const push = (frame: AuthorizationBeginFrame): void => {
      queue.push(frame)
      wake?.()
    }
    const pending = new Map<string, PendingPrompt>()
    this.prompts.set(key, pending)
    const interaction: AuthorizationInteraction = {
      notify: notice => push({ kind: 'notice', ...notice }),
      prompt: prompt => new Promise<string>((resolve, reject) => {
        const promptId = `p${String(++this.promptSeq)}`
        pending.set(promptId, {
          resolve: (answer) => { pending.delete(promptId); resolve(answer) },
          decline: () => { pending.delete(promptId); reject(new AuthorizationDeclinedError()) },
        })
        prompt.signal?.addEventListener('abort', () => {
          if (pending.delete(promptId)) {
            push({ kind: 'prompt-withdrawn', promptId })
            reject(prompt.signal?.reason ?? new Error('the prompt was withdrawn by its flow'))
          }
        }, { once: true })
        push({ kind: 'prompt', promptId, prompt: promptView(prompt) })
      }),
    }
    let finished = false
    void this.ctx.authorization
      .begin({ key, ...request.method === undefined ? {} : { method: request.method }, interaction, signal })
      .then(outcome => push({ kind: 'outcome', status: outcome.status }))
      .catch((error: unknown) => push({ kind: 'outcome', status: 'failed', message: safeMessage(error) }))
    try {
      while (!finished) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { wake = resolve })
          wake = undefined
          continue
        }
        const frame = queue.shift() as AuthorizationBeginFrame
        if (frame.kind === 'outcome') finished = true
        yield frame
      }
    } finally {
      this.prompts.delete(key)
    }
  }

  /**
   * Settle one pending prompt with the human's answer or decline.
   * @param request - key, promptId, and exactly one of answer/declined.
   */
  @Remote('respond')
  respond(request: AuthorizationRespondRequest): void {
    const key = this.parseKey(request.key)
    const prompt = this.prompts.get(key)?.get(request.promptId)
    if (prompt === undefined) {
      throw new RemoteError('authorization/no-prompt',
        `no prompt "${request.promptId}" is pending for "${request.key}"`,
        { key: request.key, promptId: request.promptId })
    }
    if (request.declined === true) prompt.decline()
    else prompt.resolve(request.answer ?? '')
  }

  /**
   * Withdraw the attempt running for a key; a no-op when none runs.
   * @param request - the key whose attempt should stop.
   */
  @Remote('cancel')
  cancel(request: { key: string }): void {
    this.ctx.authorization.cancel(this.parseKey(request.key))
  }

  private parseKey(raw: string): CredentialKey {
    try {
      return parseCredentialKey(raw)
    } catch (error) {
      throw new RemoteError('authorization/invalid-key', safeMessage(error), { key: raw }, { cause: error })
    }
  }
}

export default AuthorizationController
