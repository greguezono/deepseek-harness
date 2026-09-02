---
description: "MCP OAuth 能力 seam 的 Service Definition：OAuth 感知的 MCP 消费者为每个授权注册一个 binding 并获得传输支持与安全状态；provider 拥有整个 OAuth 协议。"
kind: "package-reference"
---
# MCP OAuth

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-mcp-oauth` 为受 OAuth 保护的 Streamable HTTP MCP 服务器定义 `ctx.mcpOAuth` 能力 seam。OAuth 感知的 MCP 消费者为每个授权注册一个 binding，获得 OAuth 感知的传输与安全状态；provider 拥有发现、注册、PKCE、回调处理、令牌交换与刷新以及授权持久化。本包拥有 Service Definition 与 `mcpOAuth` Remote controller——此处不含 Web、UI、存储或 provider 特有行为。

## 目录

- [能力 seam](#capability-seam)
- [使用本包](#use-this-package)
- [Remote namespace](#remote-namespace)
- [错误码](#error-codes)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="capability-seam"></a>
## 能力 seam

| 角色 | 包 | 拥有何物 |
|---|---|---|
| Service Definition | `@deepseek-ai/dsh-mcp-oauth`（本包） | `ctx.mcpOAuth`、`McpOAuthCredentialId`、`McpOAuthBinding`、`mcp-oauth/status-changed` 事件 |
| Service Provider | `@deepseek-ai/dsh-mcp-oauth-web` | SDK 驱动的发现、动态注册、PKCE、单一环回回调路由、通过 `ctx.credentials` 的授权持久化 |
| Consumer | `@deepseek-ai/dsh-mcp-client` | 为每个配置了 `oauth` 的 Streamable HTTP 条目注册一个 binding；在 `authorized` 时重启连接，在 `sign-in-required` 时移除工具 |

-----

<a id="use-this-package"></a>
## 使用本包

消费者调用 `ctx.mcpOAuth.register({ credentialId, serverUrl, scopes, label })` 并获得 `McpOAuthBinding`。该 binding 的 `createTransport(headers)` 返回 OAuth 感知的 `StreamableHTTPClientTransport`，其请求携带并刷新授权；`status()` 返回安全状态联合；`onStatusChange(listener)` 观察已提交的状态转换；`noteUnauthorized()` 将被拒绝的授权退回 `sign-in-required`；`invalidate()` 删除本地授权。凭据 id 为带 brand 的小写连字符标识符；其授权存储于 `credentialKey('mcp-oauth', id)` 之下。

`mcpOAuthCredentialId(value)` 为原始配置字符串打 brand，拒绝任何不符合凭据键段语法（`/^[a-z][a-z0-9-]*$/`）的值。`mcpOAuthCredentialKey(id)` 推导存储键。seam 仅在所报告的持久状态已提交后发出 `mcp-oauth/status-changed(credentialId, status)`。

-----

<a id="remote-namespace"></a>
## Remote namespace

`McpOAuthController`（从主入口再导出）支撑生成的 `ctx.remote.mcpOAuth` namespace，基于 `ctx.mcpOAuth`。它暴露两个浏览器配置界面调用的安全方法：`list()` 返回每个活跃 binding 的安全条目（绝非令牌），`signOut({ credentialId })` 删除一个 binding 的本地授权。

-----

<a id="error-codes"></a>
## 错误码

| Code | Details | 原因 |
|---|---|---|
| `mcp-oauth/unknown-credential` | `{ credentialId }` | 该 id 未命名任何活跃的 OAuth MCP binding。 |

-----

<a id="model-experience"></a>
## 模型体验

无，因为该 seam 不注册提示词、工具或会话事件；工具仅在 binding 获得授权后通过 `dsh-mcp-client` 到达。

#### KV Cache 影响

无直接影响；读取或写入 OAuth 状态不会改变已经在途的模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **每个凭据 id 仅单账户** — 一个授权存储于 `mcp-oauth/<id>` 之下；多账户流程需使用不同 id。
- **尚无无头 provider** — 登录需要浏览器驱动的授权流程；无头 profile 无法完成。
- **无服务端撤销** — seam 仅清除本地授权；不联系授权服务器撤销令牌。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
