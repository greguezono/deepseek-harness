/**
 * Wire-safe authorization Remote types.
 * @module @deepseek-ai/dsh-api-authorization-controller/types
 */

import type { AuthorizationPromptOption, AuthorizationSettlement } from '@deepseek-ai/dsh-authorization/types'

/** One registered flow as the browser sees it; `key` is the joined `<scope>/<id>` string. */
export interface AuthorizationEntryView {
  key: string
  label: string
  methods: readonly { id: string; label: string }[]
  inFlight: boolean
}

/** Start one attempt for a key, optionally naming a method. */
export interface AuthorizationBeginRequest {
  key: string
  method?: string
}

/** A prompt as rendered by a surface; the flow's own AbortSignal stays on the Host. */
export type AuthorizationPromptView =
  | { kind: 'text'; message: string; placeholder?: string }
  | { kind: 'secret'; message: string; placeholder?: string }
  | { kind: 'select'; message: string; options: readonly AuthorizationPromptOption[] }

/** One frame of a running attempt. The stream ends with exactly one `outcome`. */
export type AuthorizationBeginFrame =
  | { kind: 'notice'; message: string; url?: string; code?: string }
  | { kind: 'prompt'; promptId: string; prompt: AuthorizationPromptView }
  | { kind: 'prompt-withdrawn'; promptId: string }
  | { kind: 'outcome'; status: AuthorizationSettlement; message?: string }

/** Answer (or decline) one pending prompt of the attempt running for `key`. */
export interface AuthorizationRespondRequest {
  key: string
  promptId: string
  answer?: string
  declined?: boolean
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The supplied key is not a `<scope>/<id>` credential key. */
    'authorization/invalid-key': { readonly key: string }
    /** No prompt with that id is pending for the key's running attempt. */
    'authorization/no-prompt': { readonly key: string; readonly promptId: string }
  }
}
