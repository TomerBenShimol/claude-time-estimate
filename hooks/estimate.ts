import type { Countdown, Tasks } from '../types'

export const MIN_SAMPLE = 5
export const MAX_HISTORY = 50

export type Estimate =
  | { kind: 'tasks'; remainingMs: number }
  | { kind: 'history'; remainingMs: number; sample: number }
  | { kind: 'beyond'; sample: number }
  | { kind: 'learning'; sample: number }

export const NO_TASKS: Tasks = { total: 0, done: 0, doneIds: [] }

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? 0

  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2
}

// Conditioned on the turn having already run `elapsedMs`: only past turns that
// outlasted it say anything about how much longer this one will take.
const fromHistory = (elapsedMs: number, history: number[], minSample: number): Estimate => {
  if (history.length < minSample) return { kind: 'learning', sample: history.length }

  const longer = history.filter(ms => ms > elapsedMs)

  return longer.length === 0
    ? { kind: 'beyond', sample: history.length }
    : { kind: 'history', remainingMs: median(longer) - elapsedMs, sample: history.length }
}

export type Progress = Pick<Tasks, 'total' | 'done'>

export const estimate = (
  elapsedMs: number,
  tasks: Progress,
  doneAtStart: number,
  history: number[],
  minSample = MIN_SAMPLE,
): Estimate => {
  const doneThisJob = tasks.done - doneAtStart
  const left = tasks.total - tasks.done

  return doneThisJob > 0 && left > 0
    ? { kind: 'tasks', remainingMs: (elapsedMs / doneThisJob) * left }
    : fromHistory(elapsedMs, history, minSample)
}

type TaskUpdateInput = { taskId: string; status?: string }
type TodoWriteInput = { todos: ReadonlyArray<{ status: string }> }

const applyUpdate = (tasks: Tasks, { taskId, status }: TaskUpdateInput): Tasks => {
  const wasDone = tasks.doneIds.includes(taskId)

  switch (true) {
    case status === 'completed' && !wasDone:
      return { ...tasks, done: tasks.done + 1, doneIds: [...tasks.doneIds, taskId] }
    case status === 'deleted':
      return {
        total: Math.max(0, tasks.total - 1),
        done: wasDone ? tasks.done - 1 : tasks.done,
        doneIds: tasks.doneIds.filter(id => id !== taskId),
      }
    default:
      return tasks
  }
}

const fromTodos = ({ todos }: TodoWriteInput): Tasks => ({
  total: todos.length,
  done: todos.filter(todo => todo.status === 'completed').length,
  doneIds: [],
})

export const applyTool = (tasks: Tasks, tool: string, input: unknown): Tasks => {
  switch (tool) {
    case 'TaskCreate':
      return { ...tasks, total: tasks.total + 1 }
    case 'TaskUpdate':
      return applyUpdate(tasks, input as TaskUpdateInput)
    case 'TodoWrite':
      return fromTodos(input as TodoWriteInput)
    default:
      return tasks
  }
}

export const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  switch (true) {
    case h > 0:
      return `${h}h ${pad(m)}m`
    case m > 0:
      return `${m}m ${pad(s)}s`
    default:
      return `${s}s`
  }
}

export const describe = (e: Estimate, noun = 'turns', minSample = MIN_SAMPLE): string => {
  switch (e.kind) {
    case 'tasks':
      return `~${formatDuration(e.remainingMs)} left`
    case 'history':
      return `usually ~${formatDuration(e.remainingMs)} more (${e.sample} past ${noun})`
    case 'beyond':
      return `longer than your last ${e.sample} ${noun}`
    case 'learning':
      return `learning your pace (${e.sample}/${minSample} ${noun})`
  }
}

// The end time is held between ticks so the display counts down one second per second;
// it moves only when the estimate's footing changes (a task finished) or the time runs out.
export const nextCountdown = (
  prev: Countdown | undefined,
  at: number,
  guess: Estimate,
  done: number,
): Countdown | undefined => {
  if (!('remainingMs' in guess)) return undefined
  const basis = `${guess.kind}:${done}`
  const isStale = prev === undefined || prev.basis !== basis || prev.endsAt <= at

  return isStale ? { endsAt: at + guess.remainingMs, basis } : prev
}

export const describeCountdown = (countdown: Countdown | undefined, at: number, guess: Estimate): string => {
  switch (true) {
    case countdown !== undefined:
      return `${formatDuration(countdown.endsAt - at)} left`
    case guess.kind === 'learning':
      return 'estimating…'
    default:
      return 'longer than usual'
  }
}
