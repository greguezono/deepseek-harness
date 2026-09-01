/**
 * Grant payload (de)serialization: the opaque JSON stored inside the
 * `GrantRecord` for `mcp-oauth/<id>`. A payload bound to a different resource
 * URL or scope set parses as absent, so a profile edit can never reuse a
 * grant across resources. Validation is hand-rolled structural checks at this
 * durable boundary — no schema library needed.
 * @module @deepseek-ai/dsh-mcp-oauth-web/grant
 */

import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'

/** The stored grant: registration facts, registered client, and tokens. */
export interface GrantPayload {
  serverUrl: string
  scopes: readonly string[]
  clientInformation?: OAuthClientInformationMixed
  tokens?: OAuthTokens
}

/** Registration facts a stored payload must match to be usable. */
export interface GrantBindingFacts {
  serverUrl: string
  scopes: readonly string[]
}

/** Whether a value is a plain object (not an array, not null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether two scope lists are equal element-for-element in order. */
function scopesEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((scope, i) => scope === b[i])
}

/**
 * Serialize a grant payload for storage: a JSON-serializable copy with scopes
 * as a plain array.
 * @param payload - the grant to store.
 * @returns the opaque JSON value for `GrantRecord.payload`.
 */
export function serializeGrantPayload(payload: GrantPayload): unknown {
  return {
    serverUrl: payload.serverUrl,
    scopes: [...payload.scopes],
    ...payload.clientInformation === undefined ? {} : { clientInformation: payload.clientInformation },
    ...payload.tokens === undefined ? {} : { tokens: payload.tokens },
  }
}

/**
 * Parse a stored payload back into a {@link GrantPayload}, returning
 * `undefined` when the value is not a valid grant or its `serverUrl`/`scopes`
 * do not match `facts` (a stale grant from a different registration).
 * @param raw - the `GrantRecord.payload` value.
 * @param facts - the current registration's server URL and scopes.
 * @returns the validated payload, or `undefined` when stale or malformed.
 */
export function parseGrantPayload(raw: unknown, facts: GrantBindingFacts): GrantPayload | undefined {
  if (!isPlainObject(raw)) return undefined
  const { serverUrl, scopes, clientInformation, tokens } = raw
  if (typeof serverUrl !== 'string' || serverUrl !== facts.serverUrl) return undefined
  if (!Array.isArray(scopes) || !scopes.every(s => typeof s === 'string') || !scopesEqual(scopes, facts.scopes)) {
    return undefined
  }
  if (clientInformation !== undefined && !isPlainObject(clientInformation)) return undefined
  if (clientInformation !== undefined && typeof clientInformation.client_id !== 'string') return undefined
  if (tokens !== undefined) {
    if (!isPlainObject(tokens)) return undefined
    if (typeof tokens.access_token !== 'string') return undefined
  }
  return {
    serverUrl,
    scopes: scopes,
    ...clientInformation === undefined ? {} : { clientInformation: clientInformation as OAuthClientInformationMixed },
    ...tokens === undefined ? {} : { tokens: tokens as OAuthTokens },
  }
}
