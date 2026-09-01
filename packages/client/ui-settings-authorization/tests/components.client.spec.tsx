// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { AuthorizationSettingsTab } from '../src/client/AuthorizationSettingsTab.tsx'
import type {
  AuthorizationRowData,
  AuthorizationSettingsTabInjected,
  AuthorizationSettingsTabProps,
} from '../src/client/AuthorizationSettingsTab.tsx'
import type { AuthorizationBeginFrame } from '@deepseek-ai/dsh-api-remotes/client'
import { en, type AuthorizationLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: AuthorizationLocaleKey, params?: Record<string, string>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    en[key],
  )) as AuthorizationSettingsTabProps['t']

function row(over: Partial<AuthorizationRowData> & Pick<AuthorizationRowData, 'key' | 'label'>): AuthorizationRowData {
  return {
    methods: [],
    inFlight: false,
    ...over,
  }
}

function oauthRow(credentialId: string, status: AuthorizationRowData['oauth'] extends infer O ? O extends { status: infer S } ? S : never : never, over: Partial<AuthorizationRowData> = {}): AuthorizationRowData {
  return row({
    key: `mcp-oauth/${credentialId}`,
    label: credentialId,
    methods: [{ id: 'oauth', label: 'Sign in' }],
    oauth: {
      credentialId,
      serverUrl: `https://mcp.example.com/${credentialId}`,
      status,
      loopbackOnly: false,
    },
    ...over,
  })
}

type Begin = AuthorizationSettingsTabInjected['begin']

/** Drive a begin stream from a scripted frame list, settling after the outcome. */
function scriptedBegin(frames: readonly AuthorizationBeginFrame[]): Begin {
  return vi.fn(async (_key: string, onFrame: (frame: AuthorizationBeginFrame) => void) => {
    for (const frame of frames) onFrame(frame)
  })
}

/** A begin stub the spec drives manually: it hands back the onFrame callback. */
function manualBegin(): { begin: Begin; deliver: (frame: AuthorizationBeginFrame) => void } {
  let sink: ((frame: AuthorizationBeginFrame) => void) | undefined
  const begin = vi.fn(async (_key: string, onFrame: (frame: AuthorizationBeginFrame) => void) => {
    sink = onFrame
    await new Promise<void>(() => {}) // never resolves on its own; outcome ends it
  })
  return { begin, deliver: (frame) => { sink?.(frame) } }
}

function props(
  face: Pick<AuthorizationSettingsTabInjected, 'list' | 'begin' | 'respond' | 'cancel' | 'signOut'>,
  settledCount = 0,
): AuthorizationSettingsTabProps {
  const settledStore = createSnapshotStore<number>(settledCount)
  return {
    t,
    useSettled: bindSnapshotSelector(settledStore),
    ...face,
  } as unknown as AuthorizationSettingsTabProps
}

function propsWithStore(
  face: Pick<AuthorizationSettingsTabInjected, 'list' | 'begin' | 'respond' | 'cancel' | 'signOut'>,
): AuthorizationSettingsTabProps & { bumpSettled: () => void } {
  const settledStore = createSnapshotStore<number>(0)
  const p = { t, useSettled: bindSnapshotSelector(settledStore), ...face } as unknown as AuthorizationSettingsTabProps
  return Object.assign(p, { bumpSettled: () => { settledStore.set(settledStore.getSnapshot() + 1) } })
}

async function renderReady(
  face: Omit<Pick<AuthorizationSettingsTabInjected, 'list' | 'begin' | 'respond' | 'cancel' | 'signOut'>, 'list'>,
  rows: readonly AuthorizationRowData[],
): Promise<ReturnType<typeof render>> {
  const list = vi.fn<AuthorizationSettingsTabInjected['list']>().mockResolvedValue(rows)
  const view = render(<AuthorizationSettingsTab {...props({ ...face, list })} />)
  await screen.findByRole('list')
  return view
}

describe('AuthorizationSettingsTab', () => {
  it('renders rows with localized status for every OAuth state', async () => {
    const respond = vi.fn<AuthorizationSettingsTabInjected['respond']>().mockResolvedValue(undefined)
    const rows = [
      oauthRow('datadog', { state: 'sign-in-required' }),
      oauthRow('pending', { state: 'authorizing' }, { inFlight: true }),
      oauthRow('ready', { state: 'authorized' }),
      oauthRow('broken', { state: 'error', message: 'discovery refused' }),
    ]
    await renderReady({ begin: scriptedBegin([]), respond, cancel: vi.fn(), signOut: vi.fn() }, rows)

    expect(screen.getByText('datadog')).toBeTruthy()
    expect(screen.getByText(en.statusSignInRequired)).toBeTruthy()
    expect(screen.getByText(en.statusAuthorizing)).toBeTruthy()
    expect(screen.getByText(en.statusAuthorized)).toBeTruthy()
    expect(screen.getByText(en.statusError)).toBeTruthy()
    expect(screen.getByText('discovery refused')).toBeTruthy()
    // sign-in-required and error rows expose a retry/sign-in affordance.
    expect(screen.getByRole('button', { name: en.signIn })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.retry })).toBeTruthy()
  })

  it('renders non-OAuth rows with methods and a sign-in button', async () => {
    await renderReady(
      { begin: scriptedBegin([]), respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn() },
      [row({ key: 'pi-ai/me', label: 'pi-ai', methods: [{ id: 'browser', label: 'Browser' }] })],
    )
    expect(screen.getByText('pi-ai')).toBeTruthy()
    expect(screen.getByText('Browser')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.signIn })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.signOut })).toBeNull()
  })

  it('sign-in streams a notice with an exact link, then closes on an authorized outcome', async () => {
    const { begin, deliver } = manualBegin()
    const list = vi.fn<AuthorizationSettingsTabInjected['list']>()
      .mockResolvedValue([oauthRow('datadog', { state: 'sign-in-required' })])
    const view = render(
      <AuthorizationSettingsTab
        {...propsWithStore({ begin, respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn(), list })}
      />,
    )
    await screen.findByRole('list')

    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(begin).toHaveBeenCalledOnce() })
    deliver({ kind: 'notice', message: 'Open this page to approve access', url: 'https://auth.example.com/consent' })
    await waitFor(() => {
      const link = view.container.querySelector('a[data-authorization-notice-url]')
      expect(link?.getAttribute('href')).toBe('https://auth.example.com/consent')
    })
    expect(screen.getByText('Open this page to approve access')).toBeTruthy()
    expect(screen.getByRole('link', { name: en.openLink }).getAttribute('target')).toBe('_blank')

    // Cancel is visible while the stream is open.
    expect(screen.getByRole('button', { name: en.cancel })).toBeTruthy()
    // The authorized outcome closes the panel; the settled bump refreshes the list.
    deliver({ kind: 'outcome', status: 'authorized' })
    await waitFor(() => { expect(screen.queryByRole('button', { name: en.cancel })).toBeNull() })
    expect(list).toHaveBeenCalledOnce()
  })

  it('cancel during authorizing calls cancel(key)', async () => {
    const { begin, deliver } = manualBegin()
    const cancel = vi.fn<AuthorizationSettingsTabInjected['cancel']>().mockResolvedValue(undefined)
    render(<AuthorizationSettingsTab {...propsWithStore({ begin, respond: vi.fn(), cancel, signOut: vi.fn(), list: vi.fn().mockResolvedValue([oauthRow('datadog', { state: 'sign-in-required' })]) })} />)
    await screen.findByRole('list')
    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(begin).toHaveBeenCalledOnce() })
    deliver({ kind: 'notice', message: 'Opening browser…' })
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    await waitFor(() => { expect(cancel).toHaveBeenCalledWith('mcp-oauth/datadog') })
  })

  it('renders a text prompt, submits a typed answer, then a secret prompt and declines', async () => {
    const { begin, deliver } = manualBegin()
    const respond = vi.fn<AuthorizationSettingsTabInjected['respond']>().mockResolvedValue(undefined)
    render(<AuthorizationSettingsTab {...propsWithStore({ begin, respond, cancel: vi.fn(), signOut: vi.fn(), list: vi.fn().mockResolvedValue([oauthRow('datadog', { state: 'sign-in-required' })]) })} />)
    await screen.findByRole('list')
    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(begin).toHaveBeenCalledOnce() })

    deliver({ kind: 'prompt', promptId: 'p1', prompt: { kind: 'text', message: 'Paste the code' } })
    await waitFor(() => { expect(screen.getByText('Paste the code')).toBeTruthy() })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'the-code' } })
    fireEvent.click(screen.getByRole('button', { name: en.submit }))
    await waitFor(() => { expect(respond).toHaveBeenCalledWith('mcp-oauth/datadog', 'p1', 'the-code', undefined) })

    // A secret prompt masks the input; decline settles the attempt as cancelled.
    deliver({ kind: 'prompt', promptId: 'p2', prompt: { kind: 'secret', message: 'Enter your password' } })
    await waitFor(() => { expect(screen.getByLabelText('Enter your password')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.decline }))
    await waitFor(() => { expect(respond).toHaveBeenLastCalledWith('mcp-oauth/datadog', 'p2', undefined, true) })
  })

  it('renders a select prompt and submits the chosen option id', async () => {
    const { begin, deliver } = manualBegin()
    const respond = vi.fn<AuthorizationSettingsTabInjected['respond']>().mockResolvedValue(undefined)
    render(<AuthorizationSettingsTab {...propsWithStore({ begin, respond, cancel: vi.fn(), signOut: vi.fn(), list: vi.fn().mockResolvedValue([oauthRow('datadog', { state: 'sign-in-required' })]) })} />)
    await screen.findByRole('list')
    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(begin).toHaveBeenCalledOnce() })
    deliver({ kind: 'prompt', promptId: 'p1', prompt: { kind: 'select', message: 'Choose an account', options: [{ id: 'a', label: 'Account A' }, { id: 'b', label: 'Account B' }] } })
    await waitFor(() => { expect(screen.getByRole('option', { name: 'Account A' })).toBeTruthy() })
    fireEvent.change(screen.getByLabelText('Choose an account'), { target: { value: 'b' } })
    fireEvent.click(screen.getByRole('button', { name: en.submit }))
    await waitFor(() => { expect(respond).toHaveBeenLastCalledWith('mcp-oauth/datadog', 'p1', 'b', undefined) })
  })

  it('shows a failed outcome with the safe message verbatim and clears the panel', async () => {
    const { begin, deliver } = manualBegin()
    render(<AuthorizationSettingsTab {...propsWithStore({ begin, respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn(), list: vi.fn().mockResolvedValue([oauthRow('datadog', { state: 'sign-in-required' })]) })} />)
    await screen.findByRole('list')
    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(begin).toHaveBeenCalledOnce() })
    deliver({ kind: 'outcome', status: 'failed', message: 'exchange failed: HTTP 500' })
    await waitFor(() => { expect(screen.getByText(en.outcomeFailed)).toBeTruthy() })
    expect(screen.getByText('exchange failed: HTTP 500')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.cancel })).toBeNull()
  })

  it('signs an authorized OAuth row out through signOut(credentialId)', async () => {
    const signOut = vi.fn<AuthorizationSettingsTabInjected['signOut']>().mockResolvedValue(undefined)
    await renderReady({ begin: scriptedBegin([]), respond: vi.fn(), cancel: vi.fn(), signOut }, [oauthRow('datadog', { state: 'authorized' })])
    fireEvent.click(screen.getByRole('button', { name: en.signOut }))
    await waitFor(() => { expect(signOut).toHaveBeenCalledWith('datadog') })
  })

  it('shows the loopback-only note when the host binds all interfaces', async () => {
    await renderReady(
      { begin: scriptedBegin([]), respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn() },
      [oauthRow('datadog', { state: 'sign-in-required' }, { oauth: { credentialId: 'datadog', serverUrl: 'https://mcp.datadoghq.com/mcp', status: { state: 'sign-in-required' }, loopbackOnly: true } })],
    )
    expect(screen.getByText(en.loopbackOnlyNote)).toBeTruthy()
  })

  it('refreshes the list when the settled hook bumps', async () => {
    const list = vi.fn<AuthorizationSettingsTabInjected['list']>().mockResolvedValue([])
    const p = propsWithStore({ begin: scriptedBegin([]), respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn(), list })
    render(<AuthorizationSettingsTab {...p} />)
    await waitFor(() => { expect(list).toHaveBeenCalledOnce() })
    p.bumpSettled()
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
  })

  it('shows loading, then a generic error on a failed read, and retries', async () => {
    const list = vi.fn<AuthorizationSettingsTabInjected['list']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce([])
    render(<AuthorizationSettingsTab {...props({ begin: scriptedBegin([]), respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn(), list })} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('aborts the begin signal on unmount', async () => {
    let captured: AbortSignal | undefined
    const begin: Begin = vi.fn(async (_key: string, _onFrame: (frame: AuthorizationBeginFrame) => void, signal: AbortSignal) => {
      captured = signal
      await new Promise<void>(() => {})
    })
    const view = render(
      <AuthorizationSettingsTab
        {...propsWithStore({ begin, respond: vi.fn(), cancel: vi.fn(), signOut: vi.fn(), list: vi.fn().mockResolvedValue([oauthRow('datadog', { state: 'sign-in-required' })]) })}
      />,
    )
    await screen.findByRole('list')
    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(captured).toBeDefined() })
    expect(captured!.aborted).toBe(false)
    view.unmount()
    expect(captured!.aborted).toBe(true)
  })
})
