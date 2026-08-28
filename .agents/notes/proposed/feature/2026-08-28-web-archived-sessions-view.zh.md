# Agent Note: Web archived sessions view

Status: proposed

[English](2026-08-28-web-archived-sessions-view.md) | 中文

本提案补上 [session archive global set](../../implemented/feature/2026-07-31-session-archive-global-set.zh.md) 推迟的查看侧；归档的存储、注册表操作与 RPC 仍以那篇为准。本提案不取代任何活跃 Note：归档如何存储与提交都没有改变。

## Problem

在 Web workspace 浏览器里归档一个 Session 是单向消失。`workspace.archiveSession` 把 id 写入注册表全局集合，Host 保留会话日志及其 Workspace 记账席位，而浏览器的每个界面——分组视图、Ungrouped 桶、平铺列表、内容搜索——都会把该行过滤掉。用户无法再从 GUI 回到那些内容，运行时还会主动把人推开：进入归档集合的当前会话会被清空为「新会话」视图。

于是这些持久数据只能通过磁盘上的会话日志触达。归档读起来像删除，而这并不是该操作的语义。

## Proposal

在既有的 workspace 浏览器内增加一个只读的归档视图，由视图选项中的一个条目控制。

- **`showArchived` 是持久化的视图 store 字段**，与 `groupBy`、`orderBy` 并列。持久化 key 从 `dsh.workspace.view.v5` 升到 `v6`。
- **仅限分组模式。** `deriveGroups` 依据每个分组的 `memberIds` 填充新增的必填字段 `GroupNode.archivedSessions`；平铺列表与内容搜索继续过滤掉归档行。成员全部已归档的 workspace 会重新出现（包括 Ungrouped 桶），以便这些行可达。
- **最新 5 条，其余收在展开控件后。** 归档小节复用 `COLLAPSED_SESSION_LIMIT`，并持有自己的展开状态，与其上方的实时溢出分开计数。折叠该 workspace 分组会同时丢弃两个 key。
- **行是只读的**：标题置灰，不可拖拽，没有行操作菜单。点击即打开该会话。
- **替换输入框，而不是禁用它。** ui-workspace 以优先级 `-20` 注册进 `conversation.composer`，其 `select` 仅在打开的会话 id 属于归档集合时接管该链。打开归档会话时显示一个说明「可读不可发送」的框体。
- **`IWorkspaces.setAllowArchivedCurrent(allow)`** 让浏览器可以退出「归档即清空当前会话」的默认行为。ui-workspace 仅在分组模式**且**开关打开时设置它，effect 的销毁函数会恢复默认。

所有改动都是增量且 fail-open 的：归档 id 查找抛错时只是不产出行，而不会让实时树失败；`IsolatedBoundary` 把渲染失败限制在归档小节内；归档集合读取失败时保留实时输入框。

## Alternatives considered

- **独立的归档浮层或面板。** 否决：它会为一份严格更小的数据集重复实现树的分组、排序与行渲染，并把「我的会话在哪」割裂成两处。
- **直接倾倒原始消息，而非复用真实会话视图。** 否决：会话日志已经通过常规会话界面渲染，第二套只读渲染器会与之漂移。
- **为归档视图新建一个 client 插件包。** 否决：该功能完全位于 workspace 浏览器已有的注册之内，并读取同一份 `useWorkspaces` 快照。新建包只会增加三处注册面与一行 bundle 记录，换不来任何隔离收益。
- **把归档行就地置灰混入实时列表。** 否决：这会破坏拖拽排序与实时／归档计数，也更容易误点不可用的行。
- **在同一次改动中一并做取消归档。** 推迟：取消归档是 Host 侧的写操作，自带记账与排序问题。当前阻塞的缺口是「读」，恢复是另一个决策。
- **可配置的「最近 N 条」归档控件。** 暂时否决：该旋钮没有消费者证据。上限固定为 5，与实时溢出一致。

## Acceptance criteria

- 归档开关默认关闭，并在重载后保持。
- 开关打开且分组展开时，该分组的归档会话出现在「已归档」标题下，按时间倒序，最多 5 条，其余收在展开控件后。
- 归档行不提供重命名、fork 或归档操作。
- 打开归档会话会保持其选中状态，并以只读框体取代输入框。
- 无论开关状态如何，平铺模式都不显示归档行。
- 归档查找或渲染失败时，只损失归档行。
- 由 ui-workspace 包内测试与一个带 aria golden 的无密钥 Web e2e 场景覆盖。

## Risks

- **归档集合是注册表全局的，而小节是按分组的。** 成员关系来自每个 Workspace 的 `sessionIds` 加上 Ungrouped 余量；不属于任何账户的归档 id 会出现在 Ungrouped 下。
- **`GroupNode.archivedSessions` 是必填字段**，因此每个 `GroupNode` 字面量都必须提供它。这是刻意为之：可选字段会让某个构造点悄悄丢掉这些行。
- **Composer 优先级是共享的排序。** 归档条目位于 `-20`；若另一个链条目以更低优先级认领同一会话，它会胜出。目前只有归档选择器以归档集合为判据。
- **没有取消归档**意味着误归档的用户可以阅读，但无法从 GUI 恢复。
