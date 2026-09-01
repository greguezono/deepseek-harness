---
description: "dsh Web 客户端设置「插件」分区里的授权标签页：OAuth MCP 服务器与凭据流的登录面，带流式通知、提示与结果。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-authorization

[English](README.md) | 中文

## 概述

`dsh-client-ui-settings-authorization` 向 Web 设置的「插件」分区贡献**授权**标签页。该标签页把 `ctx.remote.authorization.list()` 与 `ctx.remote.mcpOAuth.list()` 按 key 拼合，按授权流逐行渲染。OAuth 行携带绑定状态——需登录、授权中、已授权或出错——加上 MCP 服务器 URL 与 loopback-only 提示；非 OAuth 行列出该流提供的方法。选择需登录或出错的行会打开一个面板，驱动 `ctx.remote.authorization.begin()` 并转发每一帧流——带可选链接的通知、提示（文本、密码或选择）以及最终结果——直到尝试结算。人类通过 `ctx.remote.authorization.respond()` 回答或拒绝提示，通过 `ctx.remote.authorization.cancel()` 取消，通过 `ctx.remote.mcpOAuth.signOut()` 撤销已授权绑定。一个裸计数器可观察对象在每次 `authorization/settled` 事件时递增，绑定到 `useSettled`，使本标签页或其他表面的结算都能刷新清单。加载、空结果与通用失败状态只属于已挂载组件，读取失败后可以重试，且不暴露传输细节。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打开设置中的「插件」分区并选择**授权**标签页，即可查看并驱动授权流。插件激活期间不读取 Remote；挂载组件时才懒读取拼合后的清单。

### 阅读行

每行显示流标签与状态胶囊。OAuth 行附加 MCP 服务器 URL，并在绑定需要 loopback 重定向时提示登录只能从宿主机器上的浏览器进行。出错的 OAuth 行显示绑定的安全消息。非 OAuth 行列出该流提供的方法。

### 登录

选择需登录或出错的行会打开面板并开始 `begin()` 流。面板累积通知——每条带一个供人类在浏览器中继续时打开的链接——把提示渲染为文本、密码或选择输入，并在流结算时显示结果。人类可提交或拒绝提示；取消会中止尝试。授权结果会关闭面板。

### 管理已授权绑定

已授权的 OAuth 行提供退出登录按钮，通过 `mcpOAuth.signOut()` 撤销授权并把绑定恢复为需登录。

### 重试失败的读取

清单读取失败会在标签页内渲染通用失败状态；重试会重新执行拼合的 `list()` 调用，且不暴露传输细节。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该标签页是两个宿主拥有的 Remote 命名空间的投影；插件激活期间不执行任何 Remote 读取，挂载时才取清单。

### 注册

浏览器插件注册一个 id 为 `authorization`、order 为 20 的本地化 `settings.plugins.tab` 贡献；「插件」分区拥有导航入口与标签栏。注册使用 `ctx.slots.inject()`，因此能跟随标签 slot 的延迟声明、重新声明、本地化变化与 teardown，而无需 import 分区拥有方。

### 拼合清单

注入的 `list()` 同时等待 `authorization.list()` 与 `mcpOAuth.list()`，解开每个 `RemoteResult`，并按 `key` 拼合两个数组。失败的结果在渲染前抛出，因此组件的错误状态覆盖任一命名空间。

### 结算刷新

裸计数器可观察对象位于 inject 的 `hooks` 分区，名为 `settled`。插件订阅转发的 `authorization/settled` 事件并递增计数器；渲染器把它绑定到 `useSettled`，使结算通过驱动重试的同一 effect 刷新清单。

### 流转发

注入的 `begin()` 迭代 Remote 的 `begin()` 异步可迭代对象，把每一帧转发给 `onFrame` 回调直到流结束。面板关闭或标签页卸载时，`AbortController` 取消正在进行的尝试。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖设置分区、Remote 命名空间与宿主侧控制器。

- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——本标签页注册进的「插件」分区。
- [ui-settings](../ui-settings/README.zh.md)——声明 `settings.plugins.tab` 的领域底座。
- [api-remotes](../../api/remotes/README.zh.md)——`authorization` 与 `mcpOAuth` 背后的 Remote BFF 表面。
- [authorization-controller](../../api/authorization-controller/README.zh.md)——拥有 `begin`/`respond`/`cancel` 的宿主侧授权控制器。
- [mcp-oauth](../../mcp/mcp-oauth/README.zh.md)——拥有绑定清单与 `signOut` 的 MCP OAuth 能力。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端设置表面，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制定义授权视图的新鲜度与触达范围；它们是当前包约束。

- **每次 Settings 挂载、重试或结算只读取一份清单**：标签页不直接订阅 mcpOAuth 状态变化；`settled` 计数器在尝试结算后刷新清单，但来自其他表面的绑定状态变化要等到下一次结算或重新挂载。
- **单一活动尝试**：面板一次只驱动一个尝试；开始新的登录会中止上一个。跨行并发尝试是延期工作。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
