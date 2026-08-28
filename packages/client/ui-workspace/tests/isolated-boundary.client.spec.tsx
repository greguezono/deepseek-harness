// @vitest-environment jsdom
/** The archived subsection must not take the surrounding tree down with it. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IsolatedBoundary } from '../src/client/IsolatedBoundary.tsx'

const Boom = (): never => { throw new Error('archived block failed') }

describe('IsolatedBoundary', () => {
  beforeEach(() => {
    // React logs the caught render error; the assertions below own the signal.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the fallback and keeps siblings mounted when a child throws', () => {
    render(
      <div>
        <span>live</span>
        <IsolatedBoundary fallback={<span>archived unavailable</span>}><Boom /></IsolatedBoundary>
      </div>,
    )
    expect(screen.getByText('live')).toBeTruthy()
    expect(screen.getByText('archived unavailable')).toBeTruthy()
  })

  it('drops the failed subtree entirely without a fallback', () => {
    render(
      <div>
        <span>live</span>
        <IsolatedBoundary><Boom /></IsolatedBoundary>
      </div>,
    )
    expect(screen.getByText('live')).toBeTruthy()
    expect(screen.queryByText('archived block failed')).toBeNull()
  })

  it('renders its children while they succeed', () => {
    render(<IsolatedBoundary><span>archived rows</span></IsolatedBoundary>)
    expect(screen.getByText('archived rows')).toBeTruthy()
  })
})
