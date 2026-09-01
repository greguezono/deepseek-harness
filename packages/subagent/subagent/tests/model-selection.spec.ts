import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { Context } from '@deepseek-ai/cordis'
import {
  assertModelSelectionPolicy,
  type AllowedModelRoute,
} from '../src/model-selection.ts'
import {
  subagentModelSelectionProjectionDefinition,
  subagentModelSelectionPolicy,
  recordSubagentModelSelection,
} from '../src/model-selection-state.ts'

const DEFAULT: AllowedModelRoute = { provider: 'litellm', model: 'anthropic/claude-sonnet-5' }
const OTHER: AllowedModelRoute = { provider: 'litellm', model: 'openai/gpt-5.6-terra' }
const POLICY = { defaultModel: DEFAULT, routes: [DEFAULT, OTHER] }

describe('assertModelSelectionPolicy', () => {
  it('rejects an enabled policy without a default', () => {
    expect(() => assertModelSelectionPolicy({ defaultModel: undefined, allowedModels: [DEFAULT] }))
      .toThrow('requires a default model')
  })
  it('rejects a default absent from the allowlist', () => {
    expect(() => assertModelSelectionPolicy({ defaultModel: DEFAULT, allowedModels: [OTHER] }))
      .toThrow('default must appear in the allowed list')
  })
  it('rejects an empty allowlist', () => {
    expect(() => assertModelSelectionPolicy({ defaultModel: DEFAULT, allowedModels: [] }))
      .toThrow('at least one allowed model')
  })
  it('accepts a valid policy', () => {
    expect(() => assertModelSelectionPolicy({ defaultModel: DEFAULT, allowedModels: [DEFAULT, OTHER] }))
      .not.toThrow()
  })
})

describe('subagentModelSelectionPolicy projection', () => {
  async function setup() {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(subagentModelSelectionProjectionDefinition)
    const session = Session.create(SessionId('s1'))
    return { ctx, session }
  }

  it('is undefined before recording', async () => {
    const { ctx, session } = await setup()
    expect(subagentModelSelectionPolicy(ctx.sessionProjections, session)).toBeUndefined()
  })

  it('records and reads back the default and allowlist', async () => {
    const { ctx, session } = await setup()
    recordSubagentModelSelection(ctx.sessionProjections, session, POLICY)
    const read = subagentModelSelectionPolicy(ctx.sessionProjections, session)
    expect(read).toEqual(POLICY)
  })

  it('records only once', async () => {
    const { ctx, session } = await setup()
    recordSubagentModelSelection(ctx.sessionProjections, session, POLICY)
    recordSubagentModelSelection(ctx.sessionProjections, session, { defaultModel: OTHER, routes: [OTHER] })
    expect(subagentModelSelectionPolicy(ctx.sessionProjections, session)).toEqual(POLICY)
  })

  it('rejects an empty route list at fold time', () => {
    const invalid = Session.create(SessionId('empty-policy'))
    invalid.append('subagent/model-selection-policy', { defaultModel: DEFAULT, allowedModels: [] })
    expect(() => subagentModelSelectionProjectionDefinition.apply(
      subagentModelSelectionProjectionDefinition.init(invalid.header),
      invalid.events[0]!,
    )).toThrow('requires at least one route')
  })

  it('degrades an old-format event without a default to no policy', () => {
    const legacy = Session.create(SessionId('legacy-policy'))
    legacy.append('subagent/model-selection-policy', { allowedModels: [DEFAULT] } as never)
    const state = subagentModelSelectionProjectionDefinition.apply(
      subagentModelSelectionProjectionDefinition.init(legacy.header),
      legacy.events[0]!,
    )
    expect(state).toBeNull()
  })
})
