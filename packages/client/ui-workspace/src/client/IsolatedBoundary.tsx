/**
 * Render isolation for the archived subsection. Archived rows are derived from
 * a registry-global id set that the live tree does not depend on, so a failure
 * there must cost the user only those rows, never the workspace browser.
 */
import { Component, type ReactNode } from 'react'

/** Owner-supplied subtree plus what replaces it once that subtree throws. */
interface IsolatedBoundaryProps {
  children: ReactNode
  /** Rendered in place of a failed subtree. Omitted means render nothing. */
  fallback?: ReactNode
}

/** Latched at the first caught render error; the subtree is not retried. */
interface IsolatedBoundaryState {
  failed: boolean
}

/** Contains a render failure in its own subtree, leaving siblings mounted. */
export class IsolatedBoundary extends Component<IsolatedBoundaryProps, IsolatedBoundaryState> {
  override state: IsolatedBoundaryState = { failed: false }

  /**
   * Switch to the fallback for any error thrown while rendering the children.
   * @returns the failed state React commits before the next render.
   */
  static getDerivedStateFromError(): IsolatedBoundaryState {
    return { failed: true }
  }

  /** @returns the children, or the fallback once they have thrown. */
  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
