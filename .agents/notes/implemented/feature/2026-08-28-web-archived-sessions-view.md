# Agent Note: Web archived sessions view

Status: implemented

English | [中文](2026-08-28-web-archived-sessions-view.zh.md)

This view completes the viewing half deferred by the [session archive global set](../../implemented/feature/2026-07-31-session-archive-global-set.md), which remains the authority for archive storage, registry operation, and RPC.

## Problem

Archiving a Session in the web workspace browser hid it from every browser view while its log and Workspace accounting seat remained. The user could not return to its content from the GUI.

## Decision

The workspace browser provides a persisted, grouped, read-only archived-session view.

- `showArchived` is a persisted view-store field alongside `groupBy` and `orderBy`; its storage key is `dsh.workspace.view.v6`.
- In grouped mode, `deriveGroups` populates `GroupNode.archivedSessions` from every group's `memberIds`. The flat list and content search exclude archived rows. A group with only archived members remains visible, including Ungrouped.
- The archived subsection shows the newest five rows before its independent Show more control. Collapsing a workspace group clears its live and archived expansion keys.
- Archived rows use the ordinary conversation view but expose no drag control or row actions. The composer chain replaces the input with a read-only message when no pending interaction needs its controls.
- The browser's `workspaceArchivedView` control reveals an archived current session only while grouped archived rows are visible. Its effect disposer restores the default reversible projection mask without deleting the persisted selection.
- An archived-member lookup failure yields no archived rows. `IsolatedBoundary` contains a render failure inside the archived subsection, leaving live workspace rows usable.

## Alternatives considered

**A separate archived overlay or panel.** Rejected: it would duplicate grouping, ordering, and row rendering for a smaller data set.

**A raw message dump instead of the conversation view.** Rejected: the normal conversation surface already renders the session log; a second renderer would drift.

**A new client plugin package for the archived view.** Rejected: the workspace browser already owns the needed view state and registrations.

**Mix archived rows into the live list.** Rejected: it would break drag ordering and live-row counts, and make unusable rows easier to open accidentally.

**Ship unarchive with the view.** Deferred: unarchive is a Host mutation with distinct accounting and ordering decisions.

**A configurable archived-row limit.** Rejected: there is no consumer need for a configuration field. The fixed limit matches live overflow.

## Consequences

The archived view is off by default and persists across reloads. It is available only in expanded workspace groups. Opening an archived row retains selection. The composer shows the read-only message unless a pending interaction needs its controls. The ui-workspace package specs and the keyless workspace-management e2e snapshot cover this behavior.

There is no GUI unarchive action. A user can read an archived Session but cannot restore it from the workspace browser.
