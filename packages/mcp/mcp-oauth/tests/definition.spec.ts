import { describe, expect, it } from 'vitest'
import { mcpOAuthCredentialId, mcpOAuthCredentialKey } from '../src/index.ts'

describe('McpOAuth ids', () => {
  it('brands a lowercase hyphenated id and derives its credential key', () => {
    const id = mcpOAuthCredentialId('datadog')
    expect(String(id)).toBe('datadog')
    expect(String(mcpOAuthCredentialKey(id))).toBe('mcp-oauth/datadog')
  })

  it('rejects an id outside the credential-key segment grammar', () => {
    expect(() => mcpOAuthCredentialId('Not Valid')).toThrow(TypeError)
    expect(() => mcpOAuthCredentialId('')).toThrow(TypeError)
  })
})
