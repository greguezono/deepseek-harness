# Agent Note: Web archived sessions view

Status: implemented

[English](2026-08-28-web-archived-sessions-view.md) | 中文

本视图补上 [session archive global set](../../implemented/feature/2026-07-31-session-archive-global-set.zh.md) 推迟的查看侧；该 Note 仍是归档存储、注册表操作和 RPC 的依据。

## Problem

在 Web workspace 浏览器中归档 Session 会从所有浏览器视图隐藏它，但日志和 Workspace 记账席位仍保留。用户无法从 GUI 返回它的内容。

## Decision

workspace 浏览器提供持久化、分组、只读的归档会话视图。

- `showArchived` 是与 `groupBy`、`orderBy` 并列的持久化视图 store 字段；存储 key 为 `dsh.workspace.view.v6`。
- 在分组模式中，`deriveGroups` 从每个分组的 `memberIds` 填充 `GroupNode.archivedSessions`。平铺列表和内容搜索排除归档行。只有归档成员的分组仍保持可见，包括 Ungrouped。
- 归档小节先显示最新五行，并使用独立的「展开其余」控件。折叠 workspace 分组会清除实时和归档的展开 key。
- 归档行使用常规会话视图，但不提供拖拽控件或行操作。编辑器链以只读消息替代输入框。
- 浏览器的 `workspaceArchivedView` control 只在分组归档行可见时保留已归档的当前会话。其 effect disposer 恢复默认的 selection-clear 规则。
- 归档成员查找失败时不会产生归档行。`IsolatedBoundary` 把归档小节内的渲染错误限制在那里，实时 workspace 行仍可用。

## Alternatives considered

**独立的归档浮层或面板。** 否决：它会为更小的数据集重复实现分组、排序和行渲染。

**直接倾倒原始消息，而非使用会话视图。** 否决：常规会话界面已经渲染会话日志；第二个渲染器会漂移。

**为归档视图新建 client 插件包。** 否决：workspace 浏览器已经拥有所需的视图状态和注册。

**把归档行混入实时列表。** 否决：它会破坏拖拽排序和实时行计数，并使不可用行更容易被打开。

**随视图一同提供取消归档。** 推迟：取消归档是 Host 写操作，有独立的记账和排序决策。

**可配置的归档行数量。** 否决：没有消费者需要配置字段。固定上限与实时溢出保持一致。

## Consequences

归档视图默认关闭，并在重载后保持。它只在展开的 workspace 分组中可用。打开归档行会保留 selection，并以只读消息替代编辑器。ui-workspace 包内测试和无密钥 workspace-management e2e snapshot 覆盖该行为。

GUI 没有取消归档操作。用户可以读取归档的 Session，但不能从 workspace 浏览器恢复它。
