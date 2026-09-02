---
description: "Host Remote owner for the generic authorization surface: safe listing, streamed sign-in attempts, prompt answers, and cancel over ctx.authorization."
kind: "package-reference"
---
# Authorization Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-authorization-controller` exposes the generated `ctx.remote.authorization` namespace for browser sign-in surfaces. It lists registered authorization flows as safe wire views, streams one attempt's notices and prompts to the carrier that started it, settles each prompt with the human's answer or decline, and cancels a running attempt. Notices and prompts stay scoped to the requesting carrier; a secret a flow asks for never rides a frame, and a failed flow surfaces its error message only, never the error object.

## Table of Contents

- [Use this package](#use-this-package)
- [Frame protocol](#frame-protocol)
- [Error codes](#error-codes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package as a Loader entry in a profile that serves browser sign-in. Its generated descriptors enter the strict Typert registry, while the authorization Definition remains a plain Cordis Service with no wire obligations of its own. The controller stays registered when no authorization provider is mounted, so a call names the missing seam rather than disappearing.

`list()` returns every registered flow as a wire view in registration order: the joined `<scope>/<id>` key, the label, the offered methods, and whether an attempt is in flight. `begin({ key, method? }, signal)` starts one attempt and streams its frames; the stream ends with exactly one `outcome`. `respond({ key, promptId, answer? | declined })` settles one pending prompt the stream carried, addressed by its `promptId`. `cancel({ key })` withdraws the attempt running for a key and is a no-op when none runs.

A dropped carrier signal withdraws the attempt: the stream settles as `cancelled` and the flow's orphaned run finishes on its own. One attempt runs per key at a time, the seam's own rule; a second caller is refused by `ctx.authorization`.

-----

<a id="frame-protocol"></a>
## Frame protocol

`begin` yields frames in this shape. The stream ends with exactly one `outcome`.

- `notice` — `{ message, url?, code? }`: a progress report from the running flow; a page the human must open, or a code to enter there.
- `prompt` — `{ promptId, prompt }`: a question the human must answer. `prompt` is `text`, `secret`, or `select`; the flow's own `AbortSignal` stays on the Host.
- `prompt-withdrawn` — `{ promptId }`: the flow retired a prompt before it was answered.
- `outcome` — `{ status, message? }`: the terminal frame. `status` is `authorized`, `cancelled`, or `failed`; `failed` carries a safe `message`.

-----

<a id="error-codes"></a>
## Error codes

| Code | Details | Cause |
|---|---|---|
| `authorization/invalid-key` | `{ key }` | The supplied key is not a `<scope>/<id>` credential key. |
| `authorization/no-prompt` | `{ key, promptId }` | No prompt with that id is pending for the key's running attempt. |

-----

<a id="model-experience"></a>
## Model Experience

None, as this is a Remote surface over a human-facing sign-in seam and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; reading or writing authorization state does not alter model requests already in flight.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No headless caller** — an `AuthorizationInteraction` that declines every prompt is future work, so a headless profile cannot drive sign-in.
- **Attempts do not survive Host restart** — a running attempt is in-memory; a restart drops its pending prompts without settling the stream.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
