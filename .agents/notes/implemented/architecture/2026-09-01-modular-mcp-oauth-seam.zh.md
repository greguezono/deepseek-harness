# Agent Note: 模块化 MCP OAuth——面向 OAuth 保护的 Streamable HTTP MCP 服务器的三角色能力 seam

Status: implemented

[English](2026-09-01-modular-mcp-oauth-seam.md) | 中文

## 问题

DSH 通过 Streamable HTTP 连接 MCP 服务器。部分服务器（首个为 Datadog）要求 OAuth 2.1 with PKCE 和动态客户端注册。现有的 `dsh-mcp-client` 不支持 OAuth——只能发送静态 `Authorization` 头，这意味着没有浏览器驱动的登录、没有令牌刷新、重启后无法持久化授权。

harness 已有两个 OAuth 流程所需的能力 seam：`ctx.authorization`（注册流程、发起尝试、流式传输提示、取消）和 `ctx.credentials`（对 scoped 记录的串行化 read-modify-write）。但两者均未暴露给浏览器，也没有 seam 将它们连接到 MCP 传输层。

## 决策

构建名为 `mcpOAuth` 的三角色[能力 seam](2026-06-13-capability-seams.zh.md)，遵循 bash/shell 模板：

1. **Service Definition**——`@deepseek-ai/dsh-mcp-oauth`：抽象 `McpOAuthService` 拥有 `ctx.mcpOAuth`，提供 `register`、`list` 和 `signOut`。定义 `McpOAuthBinding`（消费方持有的约定：`createTransport(headers)`、`status()`、`onStatusChange(listener)`、`noteUnauthorized()`、`invalidate()`）。同时定义 `McpOAuthController` Typert Remote，通过网络投影安全的状态/列表/登出。仅依赖 `dsh-credentials` 类型。

2. **Service Provider**——`@deepseek-ai/dsh-mcp-oauth-web`：已发布的 Web 提供方。SDK 驱动的发现、动态客户端注册、通过 `ctx.authorization` 的 PKCE 登录、`ctx.webServer` 上的一个共享 GET-only `/oauth/mcp/callback` 路由、通过 `ctx.credentials.modifyRecord` 持久化为 `GrantRecord` 的授权。从不记录令牌、代码、验证器或 OAuth 响应体。

3. **Consumer**——`dsh-mcp-client`：仅在 Streamable HTTP 条目配置了 `oauth` 时消费 `ctx.mcpOAuth`。binding 的 `createTransport` 将 SDK `authProvider` 注入传输；`noteUnauthorized` 暂停重连但不消耗重连预算；`onStatusChange('authorized')` 通过全新的连接 generation 恢复。

一个独立的早期阶段将 `ctx.authorization` 暴露到新的 `authorization` Remote 命名空间（`dsh-api-authorization-controller`）和 Authorization 设置标签页（`dsh-client-ui-settings-authorization`），两者共同解锁了浏览器驱动的登录——不仅限于 MCP OAuth。

## 关键设计选择

### 并行启动顺序

mcp-oauth-web 声明 `inject: ['credentials', 'authorization', 'webServer']`，因此其 fiber 在这些服务激活之前保持 PENDING。配置了 `oauth` 的 mcp-client 条目在同一 Include 组中启动，其 `apply()` 并行运行。消费方不能使用同步 `ctx.get('mcpOAuth')`——服务可能尚未注册。取而代之，`apply()` 监听 Cordis `internal/service` 事件，在 `mcpOAuth` 注册时 resolve，并设有 30 秒超时在提供方不在 profile 中时大声失败。

### Standard Schema 重新附加

mcp-client 的 `Config` 包装器使用 `Object.assign` 在 schemastery schema 旁添加 `~standard` 属性。`~standard` 位于 schema 的原型上，`Object.assign` 会丢弃原型属性。包装器重新附加 `~standard`，其 `validate` 运行相同的解析 + OAuth 后置检查，使 Loader 验证（调用 `Config['~standard'].validate`）在相同的错误配置上大声失败。

### 先提交再发出状态转换

令牌写入通过 `credentials.modifyRecord()`（串行化 read-modify-write）完成，然后才翻转为 `authorized` 状态。此顺序确保在任何监听器（UI、mcp-client 监督器）对状态变化做出反应之前，持久化授权已存在。提交与发出之间的崩溃仅丢失内存中的状态翻转，不丢失授权——下次启动读取存储的授权并重新推导出 `authorized`。

### 需要登录是等待状态，不是错误

当 binding 未授权时，mcp-client 监督器进入等待状态：无工具、无重连消耗，`ready` 以 `{}` 结束，因此 `failOnStartupError` 不会触发。已建立连接期间的 `UnauthorizedError` 触发 `noteUnauthorized()` 但不消耗 `failedAttempts`；`onStatusChange` 监听器在 `authorized` 时恢复。

## 考虑过的替代方案

- **将 OAuth 嵌入 mcp-client**——拒绝，因为它将 MCP 传输消费方耦合到 SDK 认证提供方和 credential/authorization seam。非 Web 部署（headless、CLI）无法在不 fork mcp-client 的情况下替换提供方。

- **配置中的静态令牌**——拒绝，因为 OAuth 令牌会过期、刷新令牌会轮换、动态客户端注册是按安装实例的。静态配置值无法处理完整生命周期。

- **同步 `ctx.get` 立即抛出**——原始实现在 `ctx.get('mcpOAuth')` 返回 `undefined` 时抛出。这在每次并行启动中失败（mcp-oauth-web 的 inject 依赖尚未 resolve），即使提供方在 profile 中。带超时的事件监听器方法对并行启动模型是正确的。

## 后果

该 seam 增加了四个包（mcp-oauth、mcp-oauth-web、authorization-controller、ui-settings-authorization）以及 api-remotes 和 web-app 中的接线。作为回报，OAuth 保护的 MCP 服务器支持浏览器驱动的登录、授权持久化和按条目 HMR——且 authorization Remote 命名空间为任何未来的授权流程解锁了浏览器登录。

`GrantPayload` 仅存储 `serverUrl`、`scopes`、`clientInformation` 和 `tokens`——没有 `pending` 或 `savedAt` 字段。进行中的 PKCE 尝试的验证器仅存在于内存中；登录中途崩溃需要重新认证，这对浏览器驱动的流程是正确的权衡。
