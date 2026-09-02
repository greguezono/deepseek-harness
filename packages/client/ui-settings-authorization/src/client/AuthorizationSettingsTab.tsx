import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AuthorizationBeginFrame,
  AuthorizationPromptView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { McpOAuthStatus } from '@deepseek-ai/dsh-mcp-oauth/types'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AuthorizationSettingsTab.module.css'

type OutcomeFrame = Extract<AuthorizationBeginFrame, { kind: 'outcome' }>

/** Authorization method offered by a flow. */
export interface AuthorizationMethodView {
  /** Flow-owned identifier echoed back when a caller picks this method. */
  id: string
  /** User-facing label for a picker. */
  label: string
}

/**
 * One authorization row after the client joins `authorization.list()` with
 * `mcpOAuth.list()` on `key`. OAuth rows carry the binding status; non-OAuth
 * rows (pi-ai logins) carry only the flow's offered methods.
 */
export interface AuthorizationRowData {
  /** Joined credential key (`<scope>/<id>`); the join column against mcpOAuth. */
  key: string
  /** User-facing flow label. */
  label: string
  /** Methods the flow offers for sign-in. */
  methods: readonly AuthorizationMethodView[]
  /** Whether an attempt is already running for this key. */
  inFlight: boolean
  /** Present when this row joins an mcpOAuth binding (OAuth MCP server). */
  oauth?: {
    /** The binding's credential id (`String(credentialId)`). */
    credentialId: string
    /** MCP resource URL, safe to display. */
    serverUrl: string
    /** Safe authorization state of the binding. */
    status: McpOAuthStatus
    /** True when sign-in works only from a browser on the host machine. */
    loopbackOnly: boolean
  }
}

/** One notice frame accumulated for the open sign-in panel. */
interface NoticeRecord {
  /** What is happening, or what the human must do next. */
  message: string
  /** A page the human must open to continue. */
  url: string | undefined
}

/** The active sign-in panel state for one row. */
interface SignInPanel {
  /** Key of the row whose attempt is open. */
  key: string
  /** Notices streamed so far. */
  notices: NoticeRecord[]
  /** The pending prompt awaiting an answer, when set. */
  prompt: { promptId: string; prompt: AuthorizationPromptView } | undefined
  /** Current draft answer for the pending prompt. */
  input: string
  /** Whether the stream has not yet delivered its outcome. */
  streaming: boolean
  /** Outcome line shown after the stream ends; undefined while streaming. */
  outcome: { label: string; detail: string | undefined; failed: boolean } | undefined
  /** Cancellation handle for the running attempt. */
  controller: AbortController
}

type RowList =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rows: readonly AuthorizationRowData[] }

/** Registration-side Remote face used by the tab. */
export interface AuthorizationSettingsTabInjected {
  /** Read the joined authorization + mcpOAuth roster. */
  list: () => Promise<readonly AuthorizationRowData[]>
  /** Drive one attempt, forwarding each frame until the stream ends. */
  begin: (key: string, onFrame: (frame: AuthorizationBeginFrame) => void, signal: AbortSignal) => Promise<void>
  /** Answer or decline the pending prompt of a running attempt. */
  respond: (key: string, promptId: string, answer?: string, declined?: boolean) => Promise<void>
  /** Cancel a running attempt. */
  cancel: (key: string) => Promise<void>
  /** Drop an OAuth binding's grant and return it to sign-in-required. */
  signOut: (credentialId: string) => Promise<void>
  /** Bare counter bumped on every `authorization/settled` event. */
  hooks: { settled: HostObservable<number> }
}

/** Full component props assembled by the Settings slot renderer. */
export type AuthorizationSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.authorization'>
  & InjectFace<AuthorizationSettingsTabInjected>

type Translate = AuthorizationSettingsTabProps['t']

/** Localized status label for one row. */
function statusLabel(row: AuthorizationRowData, t: Translate): string {
  if (row.oauth !== undefined) {
    switch (row.oauth.status.state) {
      case 'sign-in-required': return t('statusSignInRequired')
      case 'authorizing': return t('statusAuthorizing')
      case 'authorized': return t('statusAuthorized')
      case 'error': return t('statusError')
    }
  }
  return row.inFlight ? t('statusAuthorizing') : t('statusSignInRequired')
}

/** Localized outcome label for one settled attempt. */
function outcomeLabel(frame: OutcomeFrame, t: Translate): { label: string; failed: boolean } {
  switch (frame.status) {
    case 'authorized': return { label: t('outcomeAuthorized'), failed: false }
    case 'cancelled': return { label: t('outcomeCancelled'), failed: false }
    default: return { label: t('outcomeFailed'), failed: true }
  }
}

/** The prompt input for one pending prompt. */
function PromptInput({
  prompt, input, onInput, t,
}: {
  prompt: AuthorizationPromptView
  input: string
  onInput: (value: string) => void
  t: Translate
}): ReactNode {
  if (prompt.kind === 'select') {
    return (
      <select
        className={css.promptSelect}
        aria-label={prompt.message}
        value={input}
        onChange={(event) => { onInput(event.target.value) }}
      >
        <option value="" disabled>{t('promptPlaceholder')}</option>
        {prompt.options.map(option => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      className={css.promptInput}
      type={prompt.kind === 'secret' ? 'password' : 'text'}
      aria-label={prompt.message}
      placeholder={t('promptPlaceholder')}
      value={input}
      onChange={(event) => { onInput(event.target.value) }}
    />
  )
}

/** The sign-in panel for one open attempt. */
function SignInPanelView({
  panel, onRespond, onDecline, onCancel, onInput, t,
}: {
  panel: SignInPanel
  onRespond: () => void
  onDecline: () => void
  onCancel: () => void
  onInput: (value: string) => void
  t: Translate
}): ReactNode {
  return (
    <div className={css.panel}>
      {panel.notices.map((notice, index) => (
        <p key={index} className={css.notice}>
          <span>{notice.message}</span>
          {notice.url !== undefined ? (
            <a
              className={css.noticeLink}
              href={notice.url}
              target="_blank"
              rel="noreferrer"
              data-authorization-notice-url
            >
              {t('openLink')}
            </a>
          ) : null}
        </p>
      ))}
      {panel.outcome !== undefined ? (
        <p className={panel.outcome.failed ? css.outcomeFailed : css.outcomeOk} role={panel.outcome.failed ? 'alert' : undefined}>
          <span>{panel.outcome.label}</span>
          {panel.outcome.detail !== undefined ? <span>{panel.outcome.detail}</span> : null}
        </p>
      ) : null}
      {panel.prompt !== undefined && panel.outcome === undefined ? (
        <div className={css.prompt}>
          <span className={css.promptMessage}>{panel.prompt.prompt.message}</span>
          <PromptInput
            prompt={panel.prompt.prompt}
            input={panel.input}
            onInput={onInput}
            t={t}
          />
          <div className={css.promptActions}>
            <button type="button" onClick={onRespond}>{t('submit')}</button>
            <button type="button" onClick={onDecline}>{t('decline')}</button>
          </div>
        </div>
      ) : null}
      {panel.streaming && panel.outcome === undefined ? (
        <div className={css.panelActions}>
          <button type="button" onClick={onCancel}>{t('cancel')}</button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Render the Authorization tab: one row per authorization flow, joined with
 * mcpOAuth bindings, with a sign-in surface that streams notices, prompts, and
 * outcomes. All product copy reaches the DOM through the `t` seat.
 * @param props - the four slot shares, including the injected Remote face.
 */
export function AuthorizationSettingsTab({
  t, useSettled, list, begin, respond, cancel, signOut,
}: AuthorizationSettingsTabProps): ReactNode {
  const settled = useSettled(s => s)
  const [retry, setRetry] = useState(0)
  const [rows, setRows] = useState<RowList>({ status: 'loading' })
  const [panel, setPanel] = useState<SignInPanel | undefined>(undefined)
  const panelRef = useRef<SignInPanel | undefined>(undefined)
  panelRef.current = panel

  useEffect(() => {
    let alive = true
    void list()
      .then((value) => { if (alive) setRows({ status: 'ready', rows: value }) })
      .catch(() => { if (alive) setRows({ status: 'error' }) })
    return () => { alive = false }
  }, [list, retry, settled])

  // Abort any running attempt when the tab unmounts.
  useEffect(() => {
    return () => { panelRef.current?.controller.abort() }
  }, [])

  function startSignIn(key: string): void {
    panelRef.current?.controller.abort()
    const controller = new AbortController()
    setPanel({ key, notices: [], input: '', streaming: true, prompt: undefined, outcome: undefined, controller })
    void begin(key, (frame) => {
      if (frame.kind === 'outcome') {
        const outcome = outcomeLabel(frame, t)
        const next = { label: outcome.label, detail: frame.message, failed: outcome.failed }
        setPanel(current => current === undefined || current.key !== key
          ? current
          : { ...current, prompt: undefined, streaming: false, outcome: next })
        return
      }
      if (frame.kind === 'notice') {
        setPanel(current => current === undefined || current.key !== key
          ? current
          : { ...current, notices: [...current.notices, { message: frame.message, url: frame.url }] })
        return
      }
      if (frame.kind === 'prompt') {
        setPanel(current => current === undefined || current.key !== key
          ? current
          : { ...current, prompt: { promptId: frame.promptId, prompt: frame.prompt }, input: '' })
        return
      }
      setPanel(current => current === undefined || current.key !== key || current.prompt?.promptId !== frame.promptId
        ? current
        : { ...current, prompt: undefined })
    }, controller.signal).catch(() => {
      setPanel(current => current === undefined || current.key !== key || current.outcome !== undefined
        ? current
        : { ...current, streaming: false, outcome: { label: t('outcomeFailed'), detail: undefined, failed: true } })
    })
  }

  function answerPrompt(declined: boolean): void {
    const current = panelRef.current
    if (current === undefined || current.prompt === undefined) return
    const { key, prompt, input } = current
    void respond(key, prompt.promptId, declined ? undefined : input, declined ? true : undefined)
    setPanel(p => p === undefined ? p : { ...p, prompt: undefined, input: '' })
  }

  function cancelAttempt(): void {
    const current = panelRef.current
    if (current === undefined) return
    void cancel(current.key)
    current.controller.abort()
    setPanel(undefined)
  }

  if (rows.status === 'loading') {
    return <p className={css.status}>{t('loading')}</p>
  }
  if (rows.status === 'error') {
    return (
      <div className={css.failure}>
        <p role="alert">{t('error')}</p>
        <button type="button" onClick={() => { setRetry(r => r + 1) }}>{t('retry')}</button>
      </div>
    )
  }
  if (rows.rows.length === 0) {
    return <p className={css.status}>{t('empty')}</p>
  }

  return (
    <ul className={css.rows}>
      {rows.rows.map(row => (
        <li key={row.key} className={css.row}>
          <div className={css.rowHead}>
            <span className={css.rowLabel}>{row.label}</span>
            <span className={css.statusPill}>{statusLabel(row, t)}</span>
          </div>
          {row.oauth !== undefined ? (
            <div className={css.rowBody}>
              <dl className={css.facts}>
                <div>
                  <dt>{t('serverLabel')}</dt>
                  <dd><code>{row.oauth.serverUrl}</code></dd>
                </div>
              </dl>
              {row.oauth.loopbackOnly ? <p className={css.loopbackNote}>{t('loopbackOnlyNote')}</p> : null}
            </div>
          ) : (
            <div className={css.rowBody}>
              <dl className={css.facts}>
                <div>
                  <dt>{t('methodsLabel')}</dt>
                  <dd>{row.methods.map(method => <span key={method.id} className={css.methodTag}>{method.label}</span>)}</dd>
                </div>
              </dl>
            </div>
          )}
          {row.oauth !== undefined && row.oauth.status.state === 'error' ? (
            <p className={css.statusMessage} role="alert">{row.oauth.status.message}</p>
          ) : null}
          <div className={css.rowActions}>
            {row.oauth !== undefined && row.oauth.status.state === 'authorized' ? (
              <button type="button" onClick={() => {
                const credentialId = row.oauth?.credentialId
                if (credentialId !== undefined) void signOut(credentialId)
              }}>{t('signOut')}</button>
            ) : null}
            {row.oauth !== undefined && row.oauth.status.state === 'error' ? (
              <button type="button" onClick={() => { startSignIn(row.key) }}>{t('retry')}</button>
            ) : null}
            {(row.oauth !== undefined && row.oauth.status.state === 'sign-in-required') || row.oauth === undefined ? (
              <button type="button" onClick={() => { startSignIn(row.key) }}>{t('signIn')}</button>
            ) : null}
          </div>
          {panel !== undefined && panel.key === row.key ? (
            <SignInPanelView
              panel={panel}
              t={t}
              onInput={(value) => { setPanel(p => p === undefined ? p : { ...p, input: value }) }}
              onRespond={() => { answerPrompt(false) }}
              onDecline={() => { answerPrompt(true) }}
              onCancel={cancelAttempt}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
