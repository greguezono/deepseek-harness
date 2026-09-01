/**
 * Durable per-session state for the model-selection policy, owned by the subagent runtime.
 *
 * @module @deepseek-ai/dsh-subagent/model-selection-state
 */

import { z as zod } from 'zod'
import type { Session } from '@deepseek-ai/dsh-session'
import type SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { assertAllowedModelRoutes, type AllowedModelRoute, type ModelSelectionPolicy } from './model-selection.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records this session's child route-selection policy: the default route
     * and the exact allowlist. Appended before the first child creation;
     * absence means model selection is disabled. Log-only: it carries no
     * `surfaceOp` and never enters model history.
     */
    'subagent/model-selection-policy': {
      /** Default route applied when a child caller omits provider and model. */
      defaultModel: AllowedModelRoute
      /** Exact routes this Session may select explicitly for a child. */
      allowedModels: AllowedModelRoute[]
    }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Captured policy (default + allowlist), or null when model selection is disabled. */
    subagentModelSelectionPolicy: ModelSelectionPolicy | null
  }
}

const routeSchema = zod.object({
  provider: zod.string().min(1),
  model: zod.string().min(1),
}).strict()

const policyStateSchema: zod.ZodType<ModelSelectionPolicy | null> = zod.object({
  defaultModel: routeSchema,
  routes: zod.array(routeSchema).min(1),
}).nullable()

/** Host-only projection of the durable model-selection policy. */
export const subagentModelSelectionProjectionDefinition = {
  key: 'subagentModelSelectionPolicy',
  // Bumped from 1: the state gained `defaultModel`. An older checkpoint row
  // would replay into a value the schema rejects, so it must refold instead.
  stateVersion: 2,
  stateSchema: policyStateSchema,
  init: () => null,
  apply: (policy, event) => {
    if (policy !== null || event.type !== 'subagent/model-selection-policy') return policy
    const data = event.data as { defaultModel?: AllowedModelRoute; allowedModels: AllowedModelRoute[] }
    // An old-format event without defaultModel degrades to no policy rather
    // than throwing inside a projection fold.
    if (data.defaultModel === undefined) return policy
    assertAllowedModelRoutes(data.allowedModels)
    if (data.allowedModels.length === 0) {
      throw new Error('subagent/model-selection-policy requires at least one route')
    }
    return { defaultModel: { ...data.defaultModel }, routes: data.allowedModels.map(r => ({ ...r })) }
  },
} satisfies ProjectionDefinition<'subagentModelSelectionPolicy', ModelSelectionPolicy | null>

/**
 * Read the policy captured for a session, or undefined when disabled.
 * @param projections - registry that owns the policy projection.
 * @param session - session whose durable decision is read.
 * @returns a detached policy, or undefined when model selection is disabled.
 */
export function subagentModelSelectionPolicy(
  projections: Pick<SessionProjectionRegistry, 'stateOf'>,
  session: Session,
): ModelSelectionPolicy | undefined {
  const state = projections.stateOf(session, 'subagentModelSelectionPolicy')
  if (state === undefined || state === null) return undefined
  return {
    defaultModel: { ...state.defaultModel },
    routes: state.routes.map(r => ({ ...r })),
  }
}

/**
 * Append the policy once, before any child creation can reach a model request.
 * @param projections - registry that owns the policy projection.
 * @param session - session receiving the policy.
 * @param policy - default route and allowlist authorized for this session.
 */
export function recordSubagentModelSelection(
  projections: Pick<SessionProjectionRegistry, 'stateOf'>,
  session: Session,
  policy: ModelSelectionPolicy,
): void {
  if (subagentModelSelectionPolicy(projections, session) !== undefined) return
  session.append('subagent/model-selection-policy', {
    defaultModel: { ...policy.defaultModel },
    allowedModels: policy.routes.map(r => ({ ...r })),
  })
}
