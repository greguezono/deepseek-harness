import { describe, expect, it } from 'vitest'
import { parseGrantPayload, serializeGrantPayload } from '../src/grant.ts'

const registration = { serverUrl: 'https://mcp.example.com/mcp', scopes: ['mcp_all'] }

describe('grant payload', () => {
  it('round-trips tokens and client information', () => {
    const payload = serializeGrantPayload({
      serverUrl: registration.serverUrl,
      scopes: registration.scopes,
      clientInformation: { client_id: 'abc' },
      tokens: { access_token: 't', token_type: 'bearer', refresh_token: 'r' },
    })
    const parsed = parseGrantPayload(payload, registration)
    expect(parsed?.tokens?.access_token).toBe('t')
    expect(parsed?.clientInformation?.client_id).toBe('abc')
  })

  it('treats a payload for a different resource or scope set as absent', () => {
    const payload = serializeGrantPayload({
      serverUrl: 'https://other.example.com/mcp',
      scopes: ['mcp_all'],
      clientInformation: { client_id: 'abc' },
      tokens: { access_token: 't', token_type: 'bearer' },
    })
    expect(parseGrantPayload(payload, registration)).toBeUndefined()
    expect(parseGrantPayload({ nonsense: true }, registration)).toBeUndefined()
  })
})
