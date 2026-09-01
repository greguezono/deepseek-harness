/**
 * Central child LLM route selection types and validation, owned by the subagent runtime.
 *
 * @module @deepseek-ai/dsh-subagent/model-selection
 */

/** One exact child LLM route authorized by a user setting. */
export interface AllowedModelRoute {
  /** Registered LLM provider id. */
  readonly provider: string
  /** Provider-owned exact model id. */
  readonly model: string
}

/** Route-selection authority captured for one Session. */
export interface ModelSelectionPolicy {
  /** Default route applied when the caller omits provider and model. */
  readonly defaultModel: AllowedModelRoute
  /** Exact provider/model routes authorized for explicit selection. */
  readonly routes: readonly AllowedModelRoute[]
}

/**
 * Stable identity for one provider/model pair.
 * @param route - exact provider/model route.
 * @returns opaque key for equality checks.
 */
export function modelRouteKey(route: AllowedModelRoute): string {
  return `${route.provider}\0${route.model}`
}

/**
 * Reject malformed or duplicate route entries at a durable or configuration boundary.
 * @param routes - candidate exact routes to validate.
 */
export function assertAllowedModelRoutes(routes: unknown): asserts routes is readonly AllowedModelRoute[] {
  if (!Array.isArray(routes)) {
    throw new Error('subagent model selection requires an array of routes')
  }
  const seen = new Set<string>()
  const candidates: readonly unknown[] = routes
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)
      || !('provider' in candidate) || typeof candidate.provider !== 'string'
      || !('model' in candidate) || typeof candidate.model !== 'string'
      || candidate.provider.length === 0 || candidate.model.length === 0) {
      throw new Error('subagent model selection requires non-empty provider and model ids')
    }
    const route = { provider: candidate.provider, model: candidate.model }
    const key = modelRouteKey(route)
    if (seen.has(key)) {
      throw new Error(`subagent model selection repeats route "${route.provider}/${route.model}"`)
    }
    seen.add(key)
  }
}

/**
 * Validate a complete enabled policy: non-empty allowlist, default present, default in allowlist.
 * @param policy - the candidate default route and allowlist to validate.
 */
export function assertModelSelectionPolicy(policy: {
  defaultModel: AllowedModelRoute | undefined
  allowedModels: readonly AllowedModelRoute[]
}): void {
  assertAllowedModelRoutes(policy.allowedModels)
  if (policy.allowedModels.length === 0) {
    throw new Error('enabled subagent model selection requires at least one allowed model')
  }
  const defaultModel = policy.defaultModel
  if (defaultModel === undefined) {
    throw new Error('enabled subagent model selection requires a default model')
  }
  const inList = policy.allowedModels.some(
    route => route.provider === defaultModel.provider && route.model === defaultModel.model,
  )
  if (!inList) {
    throw new Error('subagent model selection default must appear in the allowed list')
  }
}
