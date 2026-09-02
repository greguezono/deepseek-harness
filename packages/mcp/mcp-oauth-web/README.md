---
description: "Web provider for ctx.mcpOAuth: SDK-driven OAuth discovery, dynamic registration, PKCE, one shared loopback callback route, and grant persistence through ctx.credentials."
kind: "package-reference"
---
# MCP OAuth Web

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-mcp-oauth-web` is the shipped Web provider for the `ctx.mcpOAuth` capability seam. It owns the full OAuth protocol for Streamable HTTP MCP servers: RFC 9728 discovery, dynamic client registration, PKCE authorization-code flow, one shared exact `/oauth/mcp/callback` route on `ctx.webServer`, token exchange and refresh through the MCP SDK, and grant persistence as `GrantRecord`s under `mcp-oauth/<id>` through `ctx.credentials`. Sign-in runs only inside the registered `AuthorizationFlow`, so a browser surface drives the consent page. Tokens, codes, and verifiers never leave the provider except into the credential record store.

## Table of Contents

- [Capability seam](#capability-seam)
- [Callback route contract](#callback-route-contract)
- [Grant payload](#grant-payload)
- [Security posture](#security-posture)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="capability-seam"></a>
## Capability seam

| Role | Package | What it owns |
|---|---|---|
| Service Definition | `@deepseek-ai/dsh-mcp-oauth` | `ctx.mcpOAuth`, `McpOAuthCredentialId`, `McpOAuthBinding`, the `mcp-oauth/status-changed` event |
| Service Provider | `@deepseek-ai/dsh-mcp-oauth-web` (this package) | SDK-driven discovery, dynamic registration, PKCE, one loopback callback route, grant persistence through `ctx.credentials` |
| Consumer | `@deepseek-ai/dsh-mcp-client` | Registers one binding per Streamable HTTP entry that configures `oauth`; restarts its connection on `authorized` and removes tools on `sign-in-required` |

-----

<a id="callback-route-contract"></a>
## Callback route contract

One exact GET route `/oauth/mcp/callback` lives at plugin scope. The redirect URI is always `http://127.0.0.1:<port>/oauth/mcp/callback`, derived from the live `webServer` port (the OS-assigned value when config port is 0), even on a `0.0.0.0` bind. Dispatch is by the cryptographically random, single-use, 10-minute-expiring `state` parameter only. The route accepts only GET; unknown, expired, or reused state yields 400, non-GET yields 405. The response body is a static page that never echoes the state, code, or OAuth error description.

<a id="grant-payload"></a>
## Grant payload

The grant persists as one `GrantRecord` under `credentialKey('mcp-oauth', <id>)`. The opaque JSON payload is `{ serverUrl, scopes, clientInformation?, tokens?, savedAt, pending? }`, where `pending` = `{ state, codeVerifier, redirectUri, expiresAt }` is written through `modifyRecord` before the authorization URL is published and cleared at settlement. A payload whose `serverUrl` or `scopes` differ from the current registration is stale and treated as absent on read.

-----

<a id="security-posture"></a>
## Security posture

The provider never logs tokens, authorization codes, PKCE verifiers, or OAuth response bodies. The callback route never logs query strings. Status surfaces see only the safe `McpOAuthStatus` union — `sign-in-required`, `authorizing`, `authorized`, or `error` with a message that excludes response bodies and callback data. Status transitions are commit-then-emit: `saveTokens` commits via `modifyRecord` before flipping to `authorized`; `invalidate` and `signOut` commit via `deleteRecord` before returning to `sign-in-required`.

-----

<a id="model-experience"></a>
## Model Experience

None, as this provider registers no prompt, tool, or session event; tools arrive through `dsh-mcp-client` once a binding is authorized.

#### KV Cache effect

No direct effect; reading or writing OAuth state does not alter model requests already in flight.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Single account per credential id** — one grant lives under `mcp-oauth/<id>`; multi-account flows need distinct ids.
- **No revocation call to the server on sign-out** — the provider clears local grants only; it does not contact the authorization server to revoke a token.
- **Host restart drops in-flight attempts** — the persisted `pending` block is expiring defense-in-depth, not restart recovery; a restart during sign-in returns to `sign-in-required`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
