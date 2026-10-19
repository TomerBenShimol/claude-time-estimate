import { describe, expect, test } from 'claude-code/testing'

import { NO_TASKS, applyTool, describeCountdown, estimate, formatDuration, nextCountdown } from '../hooks/estimate'

describe('estimate', () => {
  test('projects the pace of completed tasks onto the ones left', async () => {
    const tasks = { total: 5, done: 3, doneIds: ['1', '2', '3'] }

    expect(estimate(60_000, tasks, 1, [])).toEqual({ kind: 'tasks', remainingMs: 60_000 })
  })

  test('falls back to past turns that outlasted the elapsed time', async () => {
    const history = [10_000, 20_000, 90_000, 120_000, 150_000]

    expect(estimate(60_000, NO_TASKS, 0, history)).toEqual({
      kind: 'history',
      remainingMs: 60_000,
      sample: 5,
    })
  })

  test('says so when the turn already outran every past turn', async () => {
    const history = [1_000, 2_000, 3_000, 4_000, 5_000]

    expect(estimate(60_000, NO_TASKS, 0, history)).toEqual({ kind: 'beyond', sample: 5 })
  })

  test('waits for enough history before guessing', async () => {
    expect(estimate(1_000, NO_TASKS, 0, [5_000])).toEqual({ kind: 'learning', sample: 1 })
  })
})

describe('applyTool', () => {
  test('counts created, completed and deleted tasks once each', async () => {
    let tasks = NO_TASKS
    tasks = applyTool(tasks, 'TaskCreate', { subject: 'a' })
    tasks = applyTool(tasks, 'TaskCreate', { subject: 'b' })
    tasks = applyTool(tasks, 'TaskUpdate', { taskId: '1', status: 'completed' })
    tasks = applyTool(tasks, 'TaskUpdate', { taskId: '1', status: 'completed' })

    expect(tasks).toEqual({ total: 2, done: 1, doneIds: ['1'] })

    tasks = applyTool(tasks, 'TaskUpdate', { taskId: '1', status: 'deleted' })

    expect(tasks).toEqual({ total: 1, done: 0, doneIds: [] })
  })

  test('takes a todo list as the whole picture', async () => {
    const todos = [{ status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }]

    expect(applyTool(NO_TASKS, 'TodoWrite', { todos })).toEqual({ total: 3, done: 1, doneIds: [] })
  })
})

test('formats durations compactly', async () => {
  expect(formatDuration(42_000)).toBe('42s')
  expect(formatDuration(192_000)).toBe('3m 12s')
  expect(formatDuration(3_840_000)).toBe('1h 04m')
})

test('the countdown keeps its end time while nothing new is learned', () => {
  const guess = { kind: 'history', remainingMs: 120_000, sample: 5 } as const
  const first = nextCountdown(undefined, 1_000, guess, 0)
  const later = nextCountdown(first, 2_000, { ...guess, remainingMs: 300_000 }, 0)

  expect(first).toEqual({ endsAt: 121_000, basis: 'history:0' })
  expect(later).toBe(first)
})

test('the countdown resets when a task finishes or its time runs out', () => {
  const held = { endsAt: 10_000, basis: 'tasks:1' }
  const tasks = { kind: 'tasks', remainingMs: 60_000 } as const

  expect(nextCountdown(held, 5_000, tasks, 2)).toEqual({ endsAt: 65_000, basis: 'tasks:2' })
  expect(nextCountdown(held, 10_000, tasks, 1)).toEqual({ endsAt: 70_000, basis: 'tasks:1' })
  expect(nextCountdown(held, 10_000, { kind: 'beyond', sample: 5 }, 1)).toBeUndefined()
})

test('the countdown reads as time left, or says why there is none', () => {
  expect(describeCountdown({ endsAt: 1_220_000, basis: 'history:0' }, 1_000, { kind: 'history', remainingMs: 0, sample: 5 })).toBe('20m 19s left')
  expect(describeCountdown(undefined, 0, { kind: 'learning', sample: 2 })).toBe('estimating…')
  expect(describeCountdown(undefined, 0, { kind: 'beyond', sample: 5 })).toBe('longer than usual')
})
