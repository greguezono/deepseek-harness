---
description: "Authorization tab in Web Plugins settings for the dsh web client: sign-in surface for OAuth MCP servers and credential flows, with streamed notices, prompts, and outcomes."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-authorization

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-settings-authorization` contributes the **Authorization** tab to the Web Settings Plugins section. The tab joins `ctx.remote.authorization.list()` with `ctx.remote.mcpOAuth.list()` on credential key and renders one row per authorization flow. OAuth rows carry the binding status — sign-in-required, authorizing, authorized, or error — plus the MCP server URL and a loopback-only note; non-OAuth rows list the flow's offered methods. Selecting a sign-in-required or errored row opens a panel that drives `ctx.remote.authorization.begin()` and forwards each streamed frame — notices with optional links, prompts (text, secret, or select), and the final outcome — until the attempt settles. The human answers or declines prompts through `ctx.remote.authorization.respond()`, cancels through `ctx.remote.authorization.cancel()`, and revokes an authorized binding through `ctx.remote.mcpOAuth.signOut()`. A bare counter observable, bumped on every `authorization/settled` event, binds to `useSettled` so a settlement from this tab or another surface refreshes the roster. Loading, empty, and generic failure states stay local to the mounted component, and a failed read can be retried without exposing transport details.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open the Plugins section in Settings and select the **Authorization** tab to inspect and drive authorization flows. The tab reads no Remote during plugin activation; mounting it calls the joined roster lazily.

### Reading a row

Each row shows the flow label and a status pill. An OAuth row adds the MCP server URL and, when the binding requires a loopback redirect, a note that sign-in works only from a browser on the host machine. An errored OAuth row surfaces the binding's safe message. A non-OAuth row lists the methods the flow offers.

### Signing in

Selecting a sign-in-required or errored row opens a panel and starts a `begin()` stream. The panel accumulates notices — each carrying a link to open when the human must continue in a browser — renders prompts as text, password, or select inputs, and shows the outcome when the stream settles. The human submits or declines a prompt; canceling aborts the attempt. An authorized outcome closes the panel.

### Managing an authorized binding

An authorized OAuth row offers a sign-out button that revokes the grant through `mcpOAuth.signOut()` and returns the binding to sign-in-required.

### Retrying a failed read

A failed roster read renders a generic failure state inside the tab; retrying re-runs the joined `list()` calls without exposing transport details.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The tab is a projection of two Host-owned Remote namespaces; it performs no Remote read during plugin activation and takes the roster on mount.

### Registration

The browser plugin registers one localized `settings.plugins.tab` contribution with id `authorization` and order 20; the Plugins section owns the navigation entry and tab chrome. Registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

### Joined roster

The injected `list()` awaits both `authorization.list()` and `mcpOAuth.list()`, unwraps each `RemoteResult`, and joins the two arrays on `key`. A failed result throws before rendering, so the component's error state covers either namespace.

### Settled refresh

A bare counter observable lives in the inject `hooks` compartment as `settled`. The plugin subscribes to the forwarded `authorization/settled` event and bumps the counter; the renderer binds it to `useSettled`, so a settlement refreshes the roster through the same effect that drives retry.

### Stream forwarding

The injected `begin()` iterates the Remote `begin()` async iterable and forwards each frame to an `onFrame` callback until the stream ends. An `AbortController` cancels the running attempt when the panel closes or the tab unmounts.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the settings section, the Remote namespaces, and the Host-side controllers.

- [ui-settings-plugins](../ui-settings-plugins/README.md) — the Plugins section this tab registers into.
- [ui-settings](../ui-settings/README.md) — the domain base declaring `settings.plugins.tab`.
- [api-remotes](../../api/remotes/README.md) — the Remote BFF surface behind `authorization` and `mcpOAuth`.
- [authorization-controller](../../api/authorization-controller/README.md) — the Host-side authorization controller owning `begin`/`respond`/`cancel`.
- [mcp-oauth](../../mcp/mcp-oauth/README.md) — the MCP OAuth capability owning the binding roster and `signOut`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the freshness and reach of the authorization view; they are current package constraints.

- **One roster per Settings mount, retry, or settlement** — the tab does not subscribe to mcpOAuth status changes directly; the `settled` counter refreshes the roster after an attempt settles, but a binding state change from another surface waits for the next settlement or remount.
- **Single active attempt** — the panel drives one attempt at a time; starting a new sign-in aborts the previous one. Concurrent attempts across rows are deferred work.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
