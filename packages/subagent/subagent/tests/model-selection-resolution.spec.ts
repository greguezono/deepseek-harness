import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import LlmRuntime, {
  LlmAdapter,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { resolveChildRoute } from '../src/model-selection-resolution.ts'
import {
  recordSubagentModelSelection,
  subagentModelSelectionProjectionDefinition,
} from '../src/model-selection-state.ts'
import type { AllowedModelRoute } from '../src/model-selection.ts'

const DEFAULT: AllowedModelRoute = { provider: 'litellm', model: 'default-model' }
const OTHER: AllowedModelRoute = { provider: 'litellm', model: 'other-model' }

class RouteAdapter extends LlmAdapter {
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: provider }
  }

  override listModels(): Promise<LlmModelInfo[]> {
    return Promise.resolve([
      { id: DEFAULT.model, name: DEFAULT.model },
      { id: OTHER.model, name: OTHER.model },
    ])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('stream must not run during route resolution')
  }
}

const adapter = new RouteAdapter()

function fakeAgent(options: AgentOptions = {}): Agent {
  const id = SessionId('parent-1')
  return { id, options, session: Session.create(id) } as unknown as Agent
}

async function setup(withPolicy: boolean) {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(subagentModelSelectionProjectionDefinition)
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['litellm'], adapter)
  const parent = fakeAgent({ provider: 'parent-provider', model: 'parent-model' })
  if (withPolicy) {
    recordSubagentModelSelection(ctx.sessionProjections, parent.session, {
      defaultModel: DEFAULT,
      routes: [DEFAULT, OTHER],
    })
  }
  return { ctx, parent }
}

describe('resolveChildRoute', () => {
  it('fills the default when the route is omitted', async () => {
    const { ctx, parent } = await setup(true)
    await expect(resolveChildRoute(ctx, parent, undefined, new AbortController().signal))
      .resolves.toMatchObject(DEFAULT)
  })

  it('passes an allowed explicit route', async () => {
    const { ctx, parent } = await setup(true)
    await expect(resolveChildRoute(ctx, parent, OTHER, new AbortController().signal))
      .resolves.toMatchObject(OTHER)
  })

  it('rejects a disallowed explicit route', async () => {
    const { ctx, parent } = await setup(true)
    await expect(resolveChildRoute(
      ctx,
      parent,
      { provider: 'rogue', model: 'bad' },
      new AbortController().signal,
    )).rejects.toThrow('is not allowed for this Session')
  })

  it('rejects provider without model', async () => {
    const { ctx, parent } = await setup(true)
    await expect(resolveChildRoute(ctx, parent, { provider: OTHER.provider }, new AbortController().signal))
      .rejects.toThrow('must be supplied together')
  })

  it('passes requested options through when the policy is disabled', async () => {
    const { ctx, parent } = await setup(false)
    const requested = { provider: 'any', model: 'thing' }
    await expect(resolveChildRoute(ctx, parent, requested, new AbortController().signal))
      .resolves.toBe(requested)
  })
})
