---
description: "通用授权界面的 Host Remote owner：在 ctx.authorization 上提供安全列表、流式登录尝试、提示作答与取消。"
kind: "package-reference"
---
# Authorization Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-authorization-controller` 为浏览器登录界面提供生成的 `ctx.remote.authorization` namespace。它把已注册的授权流以安全的 wire 视图列出，把一次尝试的通知与提示流式传给发起它的 carrier，用人类的回答或拒绝落定每个提示，并取消正在进行的尝试。通知与提示只对发起请求的 carrier 可见；流程请求的密钥从不随帧跨越 wire，失败的流程只暴露其错误消息，绝不暴露错误对象本身。

## 目录

- [使用本包](#use-this-package)
- [帧协议](#frame-protocol)
- [错误码](#error-codes)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

请把本包作为 Loader entry 挂载到提供浏览器登录的 profile 中。它生成的 descriptor 进入严格 Typert registry，而 authorization Definition 仍是普通 Cordis Service，自身不承担任何 wire 义务。未挂载授权 provider 时 controller 仍会注册，因此调用会具名报告缺失的 seam，而不是凭空消失。

`list()` 以注册顺序返回每个已注册流的 wire 视图：合并后的 `<scope>/<id>` 键、标签、提供的方法，以及是否正有尝试在途。`begin({ key, method? }, signal)` 启动一次尝试并流式输出其帧；流以且仅以一个 `outcome` 结束。`respond({ key, promptId, answer? | declined })` 落定流中携带的一个待处理提示，按其 `promptId` 寻址。`cancel({ key })` 撤回某键正在进行的尝试；没有尝试时为 no-op。

carrier 信号中断会撤回尝试：流落定为 `cancelled`，流程的孤儿运行自行结束。每个键同时只允许一次尝试，这是 seam 自身的规则；第二个调用者会被 `ctx.authorization` 拒绝。

-----

<a id="frame-protocol"></a>
## 帧协议

`begin` 按以下形态产出帧。流以且仅以一个 `outcome` 结束。

- `notice` — `{ message, url?, code? }`：运行中流程的进度报告；需要人类打开的页面，或需在该页面输入的代码。
- `prompt` — `{ promptId, prompt }`：需要人类回答的问题。`prompt` 为 `text`、`secret` 或 `select`；流程自身的 `AbortSignal` 留在 Host。
- `prompt-withdrawn` — `{ promptId }`：流程在提示被回答前将其撤回。
- `outcome` — `{ status, message? }`：终止帧。`status` 为 `authorized`、`cancelled` 或 `failed`；`failed` 携带安全的 `message`。

-----

<a id="error-codes"></a>
## 错误码

| Code | Details | 原因 |
|---|---|---|
| `authorization/invalid-key` | `{ key }` | 提供的键不是 `<scope>/<id>` 凭据键。 |
| `authorization/no-prompt` | `{ key, promptId }` | 该 id 的提示在该键的运行尝试中没有待处理项。 |

-----

<a id="model-experience"></a>
## 模型体验

无，因为这是面向人类登录 seam 的 Remote 界面，不注册提示词、工具或会话事件。

#### KV Cache 影响

无直接影响；读取或写入授权状态不会改变已经在途的模型请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **无无头调用者** — 一个对所有提示均拒绝的 `AuthorizationInteraction` 属于未来工作，因此无头 profile 无法驱动登录。
- **尝试无法在 Host 重启后存活** — 运行中的尝试位于内存；重启会丢弃其待处理提示而不落定流。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
