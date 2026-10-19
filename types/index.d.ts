export type Countdown = { endsAt: number; basis: string }

export type Job = { turnId: string; startedAt: number; doneAtStart: number; countdown?: Countdown }

export type Tasks = { total: number; done: number; doneIds: string[] }

export type TrackedAgent = {
  id: string
  label: string
  startedAt: number
  isSeenFromStart: boolean
  childIds: string[]
  doneChildIds: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'time-estimate': {
      job: Job | null
      now: number
      tasks: Tasks
      agents: TrackedAgent[]
      starts: Record<string, number>
    }
  }
}
