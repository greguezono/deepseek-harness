# Agent Note: Modular MCP OAuth — a three-role capability seam for OAuth-protected Streamable HTTP MCP servers

Status: implemented

English | [中文](2026-09-01-modular-mcp-oauth-seam.zh.md)

## Problem

DSH connects to MCP servers over Streamable HTTP. Some servers (Datadog first) require OAuth 2.1 with PKCE and dynamic client registration. The existing `dsh-mcp-client` had no OAuth support — it could only send a static `Authorization` header, which means no browser-driven sign-in, no token refresh, and no grant persistence across restarts.

The harness already had two capability seams the OAuth flow needs: `ctx.authorization` (register flows, begin attempts, stream prompts, cancel) and `ctx.credentials` (serialized read-modify-write on scoped records). But neither was exposed to the browser, and no seam connected them to the MCP transport layer.

## Decision

Build a three-role [capability seam](2026-06-13-capability-seams.md) named `mcpOAuth`, following the bash/shell template:

1. **Service Definition** — `@deepseek-ai/dsh-mcp-oauth`: abstract `McpOAuthService` owning `ctx.mcpOAuth`, with `register`, `list`, and `signOut`. Defines `McpOAuthBinding` (the contract a consumer holds: `createTransport(headers)`, `status()`, `onStatusChange(listener)`, `noteUnauthorized()`, `invalidate()`). Also defines the `McpOAuthController` Typert Remote that projects safe status/list/signOut over the wire. Depends only on `dsh-credentials` types.

2. **Service Provider** — `@deepseek-ai/dsh-mcp-oauth-web`: the shipped Web provider. SDK-driven discovery, dynamic client registration, PKCE sign-in through `ctx.authorization`, one shared GET-only `/oauth/mcp/callback` route on `ctx.webServer`, grants persisted as `GrantRecord`s through `ctx.credentials.modifyRecord`. Never logs tokens, codes, verifiers, or OAuth response bodies.

3. **Consumer** — `dsh-mcp-client`: consumes `ctx.mcpOAuth` only when a Streamable HTTP entry configures `oauth`. The binding's `createTransport` injects the SDK `authProvider` into the transport; `noteUnauthorized` pauses reconnection without consuming the reconnect budget; `onStatusChange('authorized')` resumes via a fresh connection generation.

An independent earlier phase exposed `ctx.authorization` over a new `authorization` Remote namespace (`dsh-api-authorization-controller`) and an Authorization settings tab (`dsh-client-ui-settings-authorization`), which together unlock browser-driven sign-in for any authorization flow — not just MCP OAuth.

## Key design choices

### Parallel boot ordering

mcp-oauth-web declares `inject: ['credentials', 'authorization', 'webServer']`, so its fiber stays PENDING until those services activate. An mcp-client entry with `oauth` configured boots in the same Include group and its `apply()` runs in parallel. The consumer cannot use synchronous `ctx.get('mcpOAuth')` — the service may not be registered yet. Instead, `apply()` listens for the Cordis `internal/service` event and resolves when `mcpOAuth` registers, with a 30s timeout that fails loud when the provider is absent from the profile.

### Standard Schema re-attachment

The mcp-client `Config` wrapper uses `Object.assign` to add the `~standard` property alongside the schemastery schema. `~standard` lives on the schema's prototype, and `Object.assign` drops prototype properties. The wrapper re-attaches `~standard` with a `validate` that runs the same parse + OAuth post-check, so Loader validation (which calls `Config['~standard'].validate`) fails loud on the same misconfigurations as the constructor path.

### Commit-then-emit status transitions

Token writes go through `credentials.modifyRecord()` (serialized read-modify-write) before flipping status to `authorized`. This ordering ensures the durable grant exists before any listener (UI, mcp-client supervisor) reacts to the status change. A crash between commit and emit loses only the in-memory status flip, not the grant — the next boot reads the stored grant and re-derives `authorized`.

### Sign-in-required is a wait state, not an error

When a binding is not authorized, the mcp-client supervisor enters a wait state: no tools, no reconnection burn, and `ready` settles `{}` so `failOnStartupError` never fires. An `UnauthorizedError` during an established connection triggers `noteUnauthorized()` without consuming `failedAttempts`; the `onStatusChange` listener resumes on `authorized`.

## Alternatives considered

- **Embed OAuth in mcp-client** — rejected because it couples the MCP transport consumer to the SDK auth provider and the credential/authorization seams. A non-Web deployment (headless, CLI) could not swap the provider without forking mcp-client.

- **Static token in config** — rejected because OAuth tokens expire, refresh tokens rotate, and dynamic client registration is per-installation. A static config value cannot handle the full lifecycle.

- **Synchronous `ctx.get` with immediate throw** — the original implementation threw when `ctx.get('mcpOAuth')` returned `undefined`. This failed every parallel boot where mcp-oauth-web's inject dependencies had not yet resolved, even though the provider was in the profile. The event-listener approach with timeout is correct for the parallel boot model.

## Consequences

The seam adds four packages (mcp-oauth, mcp-oauth-web, authorization-controller, ui-settings-authorization) plus wiring in api-remotes and web-app. In return, OAuth-protected MCP servers work with browser-driven sign-in, grant persistence, and per-entry HMR — and the authorization Remote namespace unlocks browser sign-in for any future authorization flow.

The `GrantPayload` stores only `serverUrl`, `scopes`, `clientInformation`, and `tokens` — no `pending` or `savedAt` fields. An in-flight PKCE attempt's verifier lives in memory only; a crash mid-sign-in requires re-authentication, which is the correct tradeoff for a browser-driven flow.
