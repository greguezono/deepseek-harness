import { describe, expect, it } from 'vitest'
import type {
  SessionId, SessionListState, SessionSummary, WorkspaceId, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  deriveFlat, deriveGroups, deriveSearchResults, UNGROUPED_KEY,
} from '../src/client/tree.ts'

const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId
const summary = (id: string, updatedAt: number, cwd?: string): SessionSummary => ({
  id: sid(id), displayTitle: id, running: false, blank: false,
  updatedAt, ...(cwd === undefined ? {} : { cwd }),
})
const list = (...items: SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  current: undefined,
  phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
})
const workspace = (id: string, sessionIds: string[], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const view = (expandedGroups: readonly string[] = [], ungroupedOrder?: readonly string[]) => ({
  expandedGroups,
  ...(ungroupedOrder === undefined ? {} : { ungroupedOrder }),
})
const archived = (...ids: string[]): readonly SessionId[] => ids.map(sid)

describe('deriveGroups archived members', () => {
  it('leaves archivedSessions empty when the toggle is omitted or false', () => {
    const kept = summary('kept', 1, '/projects/first')
    const gone = summary('gone', 2, '/projects/first')
    const looseGone = summary('loose-gone', 3, '/other')
    const sessions = list(kept, gone, looseGone)
    const workspaces = [workspace('first', ['kept', 'gone'])]
    const omitted = deriveGroups(
      sessions, workspaces, archived('gone', 'loose-gone'), view(['first', UNGROUPED_KEY]),
    )
    expect(omitted.map(group => group.key)).toEqual(['first'])
    expect(omitted[0]!.sessions.map(node => node.id)).toEqual([kept.id])
    expect(omitted[0]!.archivedSessions).toEqual([])

    const off = deriveGroups(
      sessions, workspaces, archived('gone', 'loose-gone'),
      { ...view(['first', UNGROUPED_KEY]), showArchived: false },
    )
    expect(off.map(group => group.key)).toEqual(['first'])
    expect(off[0]!.sessions.map(node => node.id)).toEqual([kept.id])
    expect(off[0]!.archivedSessions).toEqual([])
  })

  it('lists archived workspace members newest-first without mixing them into live rows', () => {
    const kept = summary('kept', 1, '/projects/first')
    const gone = summary('gone', 3, '/projects/first')
    const olderGone = summary('older-gone', 2, '/projects/first')
    const sessions = list(kept, gone, olderGone)
    const groups = deriveGroups(
      sessions, [workspace('first', ['kept', 'gone', 'older-gone'])], archived('gone', 'older-gone'),
      { ...view(['first']), showArchived: true },
    )
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([kept.id])
    expect(groups[0]!.archivedSessions.map(node => node.id)).toEqual([sid('gone'), sid('older-gone')])
    expect(groups[0]!.sessionCount).toBe(1)
  })

  it('returns every archived member newest-first with an id tie-break', () => {
    const kept = summary('kept', 0, '/projects/first')
    const archivedMembers = [
      summary('old', 1, '/projects/first'),
      summary('tie-b', 3, '/projects/first'),
      summary('tie-a', 3, '/projects/first'),
      summary('mid', 4, '/projects/first'),
      summary('newer', 5, '/projects/first'),
      summary('newest', 6, '/projects/first'),
    ]
    const sessions = list(kept, ...archivedMembers)
    const groups = deriveGroups(
      sessions,
      [workspace('first', ['kept', 'old', 'tie-b', 'tie-a', 'mid', 'newer', 'newest'])],
      archived('old', 'tie-b', 'tie-a', 'mid', 'newer', 'newest'),
      { ...view(['first']), showArchived: true },
    )
    expect(groups[0]!.archivedSessions.map(node => node.id)).toEqual([
      sid('newest'), sid('newer'), sid('mid'), sid('tie-a'), sid('tie-b'), sid('old'),
    ])
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([kept.id])
  })

  it('omits blank and subagent-origin sessions from archivedSessions', () => {
    const kept = summary('kept', 1, '/projects/first')
    const gone = summary('gone', 4, '/projects/first')
    const blankGone = { ...summary('blank-gone', 5, '/projects/first'), blank: true }
    const subagentGone = {
      ...summary('subagent-gone', 6, '/projects/first'), origin: 'subagent' as const,
    }
    const sessions = list(kept, gone, blankGone, subagentGone)
    const groups = deriveGroups(
      sessions,
      [workspace('first', ['kept', 'gone', 'blank-gone', 'subagent-gone'])],
      archived('gone', 'blank-gone', 'subagent-gone'),
      { ...view(['first']), showArchived: true },
    )
    expect(groups[0]!.archivedSessions.map(node => node.id)).toEqual([gone.id])
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([kept.id])
  })

  it('places archived ungrouped sessions only under Ungrouped, even with no live stray', () => {
    const kept = summary('kept', 1, '/projects/first')
    const gone = summary('gone', 2, '/projects/first')
    const looseGone = summary('loose-gone', 3, '/other')
    const sessions = list(kept, gone, looseGone)
    const groups = deriveGroups(
      sessions, [workspace('first', ['kept', 'gone'])], archived('gone', 'loose-gone'),
      { ...view(['first', UNGROUPED_KEY]), showArchived: true },
    )
    expect(groups.map(group => group.key)).toEqual(['first', UNGROUPED_KEY])
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([kept.id])
    expect(groups[0]!.archivedSessions.map(node => node.id)).toEqual([gone.id])
    expect(groups[1]!.sessions).toEqual([])
    expect(groups[1]!.sessionCount).toBe(0)
    expect(groups[1]!.archivedSessions.map(node => node.id)).toEqual([looseGone.id])
  })

  it('omits archivedSessions while the group is folded', () => {
    const kept = summary('kept', 1, '/projects/first')
    const gone = summary('gone', 2, '/projects/first')
    const groups = deriveGroups(
      list(kept, gone), [workspace('first', ['kept', 'gone'])], archived('gone'),
      { ...view([]), showArchived: true },
    )
    expect(groups[0]!.sessions).toEqual([])
    expect(groups[0]!.archivedSessions).toEqual([])
    expect(groups[0]!.sessionCount).toBe(1)
  })

  it('skips archived members whose summary has not landed', () => {
    const kept = summary('kept', 1, '/projects/first')
    const groups = deriveGroups(
      list(kept), [workspace('first', ['kept', 'gone'])], archived('gone'),
      { ...view(['first']), showArchived: true },
    )
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([kept.id])
    expect(groups[0]!.archivedSessions).toEqual([])
  })

  it('fail-opens archivedSessions when an archived lookup throws', () => {
    const live = summary('kept', 1, '/projects/first')
    const gone = summary('gone', 2, '/projects/first')
    const sessions = list(live, gone)
    const hostile: SessionListState = {
      ...sessions,
      byId: new Proxy(sessions.byId, {
        get(target: SessionListState['byId'], prop: string): SessionSummary | undefined {
          if (prop === gone.id) throw new Error('archived lookup failed')
          return target[prop as SessionId]
        },
      }),
    }
    const groups = deriveGroups(
      hostile, [workspace('first', ['kept', 'gone'])], archived('gone'),
      { ...view(['first']), showArchived: true },
    )
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([live.id])
    expect(groups[0]!.archivedSessions).toEqual([])
  })
})

describe('deriveFlat archive filtering', () => {
  it('still hides archived ids', () => {
    const kept = summary('kept', 1)
    const gone = summary('gone', 2)
    expect(deriveFlat(list(kept, gone), archived('gone')).map(row => row.id)).toEqual([kept.id])
  })
})

describe('deriveSearchResults archive filtering', () => {
  it('still excludes archived ids', () => {
    const hit = summary('hit', 2)
    hit.displayTitle = 'Needle row'
    const gone = summary('gone', 1)
    gone.displayTitle = 'Needle archived'
    const result = deriveSearchResults(
      list(hit, gone),
      [],
      'needle',
      archived('gone'),
      { items: [{ sessionId: gone.id, snippet: 'needle body' }], hasMore: false },
      10,
    )
    expect(result.items.map(item => item.id)).toEqual([hit.id])
  })
})
