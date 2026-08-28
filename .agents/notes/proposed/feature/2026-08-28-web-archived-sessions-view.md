# Agent Note: Web archived sessions view

Status: proposed

English | [中文](2026-08-28-web-archived-sessions-view.zh.md)

This proposal fills the viewing half deferred by the [session archive global set](../../implemented/feature/2026-07-31-session-archive-global-set.md), which remains the authority for the archive storage, registry operation, and RPC. It supersedes no active note: nothing here changes how archiving is stored or committed.

## Problem

Archiving a Session in the web workspace browser was a one-way disappearance. `workspace.archiveSession` adds the id to a registry-global set, the Host keeps the session log and its Workspace accounting seat, and every browser surface — grouped view, Ungrouped bucket, flat list, content search — filters the row out. The user had no way back to that content from the GUI, and the runtime actively pushed them away: a current session that entered the archive set was cleared into the New Session view.

The durable data was therefore reachable only through the session log on disk. Archive read as delete, which is not what the operation does.

## Proposal

Add a read-only archived view to the existing workspace browser, controlled by one View options entry.

- **`showArchived` is a persisted view-store field**, alongside `groupBy` and `orderBy`. The persist key moved `dsh.workspace.view.v5` → `v6`.
- **Grouped mode only.** `deriveGroups` fills a new required `GroupNode.archivedSessions` from each group's `memberIds`; the flat list and content search keep filtering archived rows out. A workspace whose only members are archived brings its group back (including the Ungrouped bucket) so those rows are reachable.
- **Newest five, then Show more.** The archived subsection reuses `COLLAPSED_SESSION_LIMIT` with its own expansion state, counted separately from the live overflow above it. Collapsing the workspace group drops both keys.
- **Rows are read-only**: greyed title, no drag, no row action menu. Clicking one opens the session.
- **The composer is replaced, not disabled.** ui-workspace registers into `conversation.composer` at priority `-20` with a `select` that claims the chain only when the open session id is in the archive set. Opening an archived session shows a frame stating it is readable but not sendable.
- **`IWorkspaces.setAllowArchivedCurrent(allow)`** lets the browser opt out of the clear-on-archive default. ui-workspace sets it only while grouped *and* the toggle is on; the effect disposer restores the default.

Everything is additive and fail-open: archived id lookups that throw yield no rows rather than failing the live tree, an `IsolatedBoundary` contains a render failure in the archived subsection, and a failed archive-set read leaves the live composer in place.

## Alternatives considered

- **A separate archived overlay or panel.** Rejected: it duplicates the tree's grouping, ordering, and row rendering for a strictly smaller data set, and splits "where are my sessions" into two places.
- **A raw message dump instead of the real conversation view.** Rejected: the session log already renders through the normal conversation surface; a second read-only renderer would drift from it.
- **A new client plugin package for the archived view.** Rejected: the feature is entirely inside the workspace browser's existing registrations and reads the same `useWorkspaces` snapshot. A package would add three registration surfaces and a bundle row for no isolation gain.
- **Mixing archived rows into the live list, greyed in place.** Rejected: it breaks drag ordering and the live/archived counts, and makes accidental clicks on unusable rows likely.
- **Shipping unarchive in the same change.** Deferred: unarchive is a Host mutation with its own accounting and ordering questions. Reading is the blocking gap; restoring is a separate decision.
- **A configurable "last N" archived control.** Rejected for now: no consumer evidence for the knob. The cap is fixed at 5, matching the live overflow.

## Acceptance criteria

- Archived is off by default and survives reload.
- With it on and a group expanded, that group's archived sessions appear under an Archived heading, newest first, capped at five with a Show more control.
- Archived rows expose no rename, fork, or archive action.
- Opening an archived session keeps it selected and shows the read-only composer instead of an input.
- Flat mode shows no archived rows regardless of the toggle.
- A failing archived lookup or render costs only the archived rows.
- Covered by ui-workspace package specs and a keyless web e2e scenario with an aria golden.

## Risks

- **The archived set is registry-global while the subsection is per-group.** Membership comes from each Workspace's `sessionIds` plus an Ungrouped remainder; an archived id in no account surfaces under Ungrouped.
- **`GroupNode.archivedSessions` is required**, so every `GroupNode` literal must supply it. This is deliberate: an optional field would let a construction site silently lose the rows.
- **Composer priority is a shared ordering.** The archived entry sits at `-20`; another chain entry claiming the same session at a lower priority would win. Only the archived selector keys on the archive set today.
- **No unarchive** means a user who archives by mistake can read but not restore from the GUI.
