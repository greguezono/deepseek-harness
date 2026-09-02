---
description: "ctx.mcpOAuth 的 Web provider：SDK 驱动的 OAuth 发现、动态注册、PKCE、单一共享环回回调路由，以及通过 ctx.credentials 的授权持久化。"
kind: "package-reference"
---
# MCP OAuth Web

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-mcp-oauth-web` 是 `ctx.mcpOAuth` 能力 seam 的已发布 Web provider。它为 Streamable HTTP MCP 服务器拥有完整 OAuth 协议：RFC 9728 发现、动态客户端注册、PKCE 授权码流程、`ctx.webServer` 上单一共享的精确 `/oauth/mcp/callback` 路由、通过 MCP SDK 的令牌交换与刷新，以及通过 `ctx.credentials` 以 `GrantRecord` 形式在 `mcp-oauth/<id>` 下持久化授权。登录仅在已注册的 `AuthorizationFlow` 内运行，因此浏览器界面驱动同意页面。令牌、代码与验证器除进入凭据记录存储外绝不离开本 provider。

## 目录

- [能力 seam](#capability-seam)
- [回调路由契约](#callback-route-contract)
- [授权负载](#grant-payload)
- [安全姿态](#security-posture)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="capability-seam"></a>
## 能力 seam

| 角色 | 包 | 拥有何物 |
|---|---|---|
| Service Definition | `@deepseek-ai/dsh-mcp-oauth` | `ctx.mcpOAuth`、`McpOAuthCredentialId`、`McpOAuthBinding`、`mcp-oauth/status-changed` 事件 |
| Service Provider | `@deepseek-ai/dsh-mcp-oauth-web`（本包） | SDK 驱动的发现、动态注册、PKCE、单一环回回调路由、通过 `ctx.credentials` 的授权持久化 |
| Consumer | `@deepseek-ai/dsh-mcp-client` | 为每个配置了 `oauth` 的 Streamable HTTP 条目注册一个 binding；在 `authorized` 时重启连接，在 `sign-in-required` 时移除工具 |

-----

<a id="callback-route-contract"></a>
## 回调路由契约

一个精确 GET 路由 `/oauth/mcp/callback` 位于插件作用域。重定向 URI 始终为 `http://127.0.0.1:<port>/oauth/mcp/callback`，从活跃 `webServer` 端口推导（config 端口为 0 时取 OS 分配值），即使在 `0.0.0.0` 绑定下亦然。分发仅依据加密随机、一次性、10 分钟过期的 `state` 参数。路由仅接受 GET；未知、过期或复用的 state 返回 400，非 GET 返回 405。响应体为静态页面，绝不回显 state、代码或 OAuth 错误描述。

<a id="grant-payload"></a>
## 授权负载

授权以一个 `GrantRecord` 存储于 `credentialKey('mcp-oauth', <id>)` 之下。不透明 JSON 负载为 `{ serverUrl, scopes, clientInformation?, tokens?, savedAt, pending? }`，其中 `pending` = `{ state, codeVerifier, redirectUri, expiresAt }` 在授权 URL 发布前通过 `modifyRecord` 写入并在结算时清除。负载的 `serverUrl` 或 `scopes` 与当前注册不符时即过时，读取时视为不存在。

-----

<a id="security-posture"></a>
## 安全姿态

本 provider 绝不记录令牌、授权码、PKCE 验证器或 OAuth 响应体。回调路由绝不记录查询字符串。状态界面仅见安全的 `McpOAuthStatus` 联合——`sign-in-required`、`authorizing`、`authorized` 或 `error`（消息排除响应体与回调数据）。状态转换为先提交后发出：`saveTokens` 在翻转为 `authorized` 前通过 `modifyRecord` 提交；`invalidate` 与 `signOut` 在返回 `sign-in-required` 前通过 `deleteRecord` 提交。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本 provider 不注册提示词、工具或会话事件；工具仅在 binding 获得授权后通过 `dsh-mcp-client` 到达。

#### KV Cache 影响

无直接影响；读取或写入 OAuth 状态不会改变已经在途的模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **每个凭据 id 仅单账户** — 一个授权存储于 `mcp-oauth/<id>` 之下；多账户流程需使用不同 id。
- **登出时不联系服务器撤销** — provider 仅清除本地授权；不联系授权服务器撤销令牌。
- **Host 重启丢弃进行中的尝试** — 持久化的 `pending` 块为过期防御纵深，非重启恢复；登录期间重启返回 `sign-in-required`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
