---
description: "Service Definition for the MCP OAuth capability seam: OAuth-aware MCP consumers register one binding per grant and receive transport support plus safe status; a provider owns the whole OAuth protocol."
kind: "package-reference"
---
# MCP OAuth

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-mcp-oauth` defines the `ctx.mcpOAuth` capability seam for OAuth-protected Streamable HTTP MCP servers. An OAuth-aware MCP consumer registers one binding per grant and receives an OAuth-enabled transport plus safe status; a provider owns discovery, registration, PKCE, callback handling, token exchange and refresh, and grant persistence. This package owns the Service Definition and the `mcpOAuth` Remote controller — no Web, UI, storage, or provider-specific behavior lives here.

## Table of Contents

- [Capability seam](#capability-seam)
- [Use this package](#use-this-package)
- [Remote namespace](#remote-namespace)
- [Error codes](#error-codes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="capability-seam"></a>
## Capability seam

| Role | Package | What it owns |
|---|---|---|
| Service Definition | `@deepseek-ai/dsh-mcp-oauth` (this package) | `ctx.mcpOAuth`, `McpOAuthCredentialId`, `McpOAuthBinding`, the `mcp-oauth/status-changed` event |
| Service Provider | `@deepseek-ai/dsh-mcp-oauth-web` | SDK-driven discovery, dynamic registration, PKCE, one loopback callback route, grant persistence through `ctx.credentials` |
| Consumer | `@deepseek-ai/dsh-mcp-client` | Registers one binding per Streamable HTTP entry that configures `oauth`; restarts its connection on `authorized` and removes tools on `sign-in-required` |

-----

<a id="use-this-package"></a>
## Use this package

A consumer calls `ctx.mcpOAuth.register({ credentialId, serverUrl, scopes, label })` and receives a `McpOAuthBinding`. The binding's `createTransport(headers)` returns an OAuth-enabled `StreamableHTTPClientTransport` whose requests carry and refresh the grant; `status()` returns a safe state union; `onStatusChange(listener)` observes committed transitions; `noteUnauthorized()` returns a refused grant to `sign-in-required`; and `invalidate()` deletes the local grant. The credential id is a branded lowercase hyphenated identifier; its grant persists under `credentialKey('mcp-oauth', id)`.

`mcpOAuthCredentialId(value)` brands a raw config string and rejects anything outside the credential-key segment grammar (`/^[a-z][a-z0-9-]*$/`). `mcpOAuthCredentialKey(id)` derives the storage key. The seam emits `mcp-oauth/status-changed(credentialId, status)` only after the durable state it reports is committed.

-----

<a id="remote-namespace"></a>
## Remote namespace

`McpOAuthController` (re-exported from the main entry) backs the generated `ctx.remote.mcpOAuth` namespace over `ctx.mcpOAuth`. It exposes two safe methods a browser configuration surface calls: `list()` returns every live binding's safe entry (never a token), and `signOut({ credentialId })` deletes one binding's local grant.

-----

<a id="error-codes"></a>
## Error codes

| Code | Details | Cause |
|---|---|---|
| `mcp-oauth/unknown-credential` | `{ credentialId }` | The id names no live OAuth MCP binding. |

-----

<a id="model-experience"></a>
## Model Experience

None, as this seam registers no prompt, tool, or session event; tools arrive through `dsh-mcp-client` once a binding is authorized.

#### KV Cache effect

No direct effect; reading or writing OAuth state does not alter model requests already in flight.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Single account per credential id** — one grant lives under `mcp-oauth/<id>`; multi-account flows need distinct ids.
- **No headless provider yet** — sign-in requires a browser-driven authorization flow; a headless profile cannot complete it.
- **No server-side revocation** — the seam clears local grants only; it does not contact the authorization server to revoke a token.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
