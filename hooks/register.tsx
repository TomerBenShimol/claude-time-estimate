import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnCompleteInput } from 'claude-code'

import type { Job, TrackedAgent } from '../types'
import { reconcile } from './agents'
import { MAX_HISTORY, NO_TASKS, applyTool, describe, describeCountdown, estimate, formatDuration, nextCountdown } from './estimate'

const job = atom({ plugin: 'time-estimate', key: 'job' } as const, null)
const now = atom({ plugin: 'time-estimate', key: 'now' } as const, 0)
const tasks = atom({ plugin: 'time-estimate', key: 'tasks' } as const, NO_TASKS)
const agents = atom({ plugin: 'time-estimate', key: 'agents' } as const, [])
const starts = atom({ plugin: 'time-estimate', key: 'starts' } as const, {})

const HISTORY_KEY = 'durations'
const AGENT_HISTORY_KEY = 'agentDurations'
const AGENT_MIN_SAMPLE = 1
const TRACKED_TOOLS = ['TaskCreate', 'TaskUpdate', 'TodoWrite']

const asHistory = (stored: unknown): number[] =>
  Array.isArray(stored) ? stored.filter((ms): ms is number => typeof ms === 'number') : []

const asAgentHistory = (stored: unknown): Record<string, number[]> =>
  typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? Object.fromEntries(Object.entries(stored).map(([label, list]) => [label, asHistory(list)]))
    : {}

let history: number[] = []
let agentHistory: Record<string, number[]> = {}

const completeMain = async ($: EngineInterface, e: TurnCompleteInput) => {
  const current = await read($, job)
  if (current === null || current.turnId !== e.turnId) return

  await update($, job, () => null)
  if (e.reason !== 'answer') return
  history = [...history, e.durationMs].slice(-MAX_HISTORY)
  await $.store.set(HISTORY_KEY, history)
}

const completeAgent = async ($: EngineInterface, e: TurnCompleteInput, agentId: string) => {
  const tracked = (await read($, agents)).find(agent => agent.id === agentId)
  const isTimed = e.reason === 'answer' && tracked !== undefined && tracked.isSeenFromStart
  if (!isTimed) return

  const past = agentHistory[tracked.label] ?? []
  agentHistory = { ...agentHistory, [tracked.label]: [...past, e.durationMs].slice(-MAX_HISTORY) }
  await $.store.set(AGENT_HISTORY_KEY, agentHistory)
}

const refreshCountdown = async ($: EngineInterface, at: number) => {
  const progress = await read($, tasks)
  await update($, job, current => {
    if (current === null) return null
    const guess = estimate(Math.max(0, at - current.startedAt), progress, current.doneAtStart, history)

    return { ...current, countdown: nextCountdown(current.countdown, at, guess, progress.done) }
  })
}

const agentLine = (agent: TrackedAgent, at: number): string => {
  const elapsed = Math.max(0, at - agent.startedAt)
  const children = { total: agent.childIds.length, done: agent.doneChildIds.length }
  const guess = estimate(elapsed, children, 0, agentHistory[agent.label] ?? [], AGENT_MIN_SAMPLE)
  const since = agent.isSeenFromStart ? '' : '+'
  const childText = children.total > 0 ? ` · sub-agents ${children.done}/${children.total}` : ''

  return `${formatDuration(elapsed)}${since}${childText} · ${describe(guess, 'runs', AGENT_MIN_SAMPLE)}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    history = asHistory(await $.store.get(HISTORY_KEY))
    agentHistory = asAgentHistory(await $.store.get(AGENT_HISTORY_KEY))
    $.clock.every(1000, async () => {
      const at = await $.clock.now()
      const listed = await $.agent.list()
      const knownStarts = await read($, starts)
      await update($, agents, tracked => reconcile(tracked, listed, knownStarts, at))
      const isBusy = (await read($, agents)).length > 0 || (await read($, job)) !== null
      if (isBusy) await update($, now, () => at)
      await refreshCountdown($, at)
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, starts, known => (agentId in known ? known : { ...known, [agentId]: startedAt }))
      return next(e)
    }

    const current: Job = { turnId: e.turnId, startedAt, doneAtStart: (await read($, tasks)).done }
    await update($, job, () => current)
    await update($, now, () => startedAt)
    await refreshCountdown($, startedAt)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const isCounted = TRACKED_TOOLS.includes(String(e.tool)) && ran.deny === undefined && ran.isError !== true
    if (isCounted) await update($, tasks, current => applyTool(current, String(e.tool), e))

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await (e.agentId === undefined ? completeMain($, e) : completeAgent($, e, e.agentId))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, job)
    const running = await read($, agents)
    const main = e.props.isWorking ? current : null
    if (e.props.hasSurvey || (main === null && running.length === 0)) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const at = await read($, now)
    const progress = await read($, tasks)
    const room = Math.max(1, e.props.maxRows - 3 - (main === null ? 0 : 1))
    const mainElapsed = main === null ? 0 : Math.max(0, at - main.startedAt)

    return (
      <Box key="time-estimate" flexDirection="column" marginTop={1} marginLeft={4} paddingX={2} borderStyle="round" borderColor="claude">
        {main !== null && (
          <Box key="main">
            <Text bold color="claude">
              ⏳ {describeCountdown(main.countdown, at, estimate(mainElapsed, progress, main.doneAtStart, history))}
            </Text>
          </Box>
        )}
        {running.slice(0, room).map(agent => (
          <Box key={`agent-${agent.id}`}>
            <Text bold color="claude">⚙ {agent.label}</Text>
            <Text dimColor> · {agentLine(agent, at)}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
