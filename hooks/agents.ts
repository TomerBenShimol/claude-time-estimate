import type { AgentInfo } from 'claude-code'

import type { TrackedAgent } from '../types'

const ACTIVE = ['pending', 'running', 'waiting']

type Listed = Pick<AgentInfo, 'id' | 'description' | 'type' | 'status' | 'parentId' | 'name'>

const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])]

const labelOf = (agent: Listed): string => agent.description || agent.name || agent.type

export const reconcile = (
  tracked: TrackedAgent[],
  listed: Listed[],
  starts: Record<string, number>,
  at: number,
): TrackedAgent[] =>
  listed
    .filter(agent => agent.parentId === undefined && ACTIVE.includes(agent.status))
    .map(agent => {
      const known = tracked.find(one => one.id === agent.id)
      const children = listed.filter(child => child.parentId === agent.id)
      const doneChildren = children.filter(child => !ACTIVE.includes(child.status))

      return {
        id: agent.id,
        label: labelOf(agent),
        startedAt: starts[agent.id] ?? known?.startedAt ?? at,
        isSeenFromStart: starts[agent.id] !== undefined,
        childIds: union(known?.childIds ?? [], children.map(child => child.id)),
        doneChildIds: union(known?.doneChildIds ?? [], doneChildren.map(child => child.id)),
      }
    })
