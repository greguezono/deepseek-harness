/** Central child LLM route resolution for every subagent start. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { parentAgentOptionsForDelegation } from './child-agent.ts'
import { subagentModelSelectionPolicy } from './model-selection-state.ts'

/**
 * Resolve and preflight the child route when the parent Session carries a model-selection policy.
 * @param ctx - Runtime context that owns the projection and optional LLM services.
 * @param parent - Delegating parent whose Session carries the durable policy.
 * @param requested - Per-child Agent options.
 * @param signal - Caller cancellation for the adapter preflight.
 * @returns the requested options unchanged when selection is disabled, otherwise the authorized route options.
 */
export async function resolveChildRoute(
  ctx: Context,
  parent: Agent,
  requested: AgentOptions | undefined,
  signal: AbortSignal,
): Promise<AgentOptions | undefined> {
  const projections = ctx.get('sessionProjections')
  // Provider unit tests use minimal Agent doubles without a Session event log.
  // Such doubles cannot carry a durable model-selection policy.
  const hasSessionLog = Array.isArray((parent.session as { events?: unknown }).events)
  const policy = projections === undefined || !hasSessionLog
    ? undefined
    : subagentModelSelectionPolicy(projections, parent.session)
  if (policy === undefined) return requested

  const hasProvider = requested?.provider !== undefined
  const hasModel = requested?.model !== undefined
  if (hasProvider !== hasModel) {
    throw new Error('child LLM `provider` and `model` must be supplied together')
  }

  const parentOptions = parentAgentOptionsForDelegation(parent)
  const provider = requested?.provider ?? policy.defaultModel.provider
  const model = requested?.model ?? policy.defaultModel.model
  if (!policy.routes.some(route => route.provider === provider && route.model === model)) {
    throw new Error(`child LLM route "${provider}/${model}" is not allowed for this Session`)
  }

  const llm = ctx.get('llm')
  if (llm === undefined) {
    throw new Error('cannot resolve the selected child LLM route because the `llm` service is unavailable')
  }

  const routeRequested = requested?.provider !== undefined || requested?.model !== undefined
  const routeChanged = provider !== parentOptions.provider || model !== parentOptions.model
  const reasoningEffort = requested?.reasoningEffort
    ?? (routeRequested || routeChanged ? undefined : parentOptions.reasoningEffort)
  const resolved = await llm.resolveCallConfig({
    provider,
    model,
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
  }, signal)
  signal.throwIfAborted()

  return {
    ...requested,
    provider: resolved.provider,
    model: resolved.model,
    ...(reasoningEffort === undefined && requested?.reasoningEffort === undefined
      ? {}
      : resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }),
  }
}
