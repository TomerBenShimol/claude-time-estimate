import { expect, test } from 'claude-code/testing'

import { reconcile } from '../hooks/agents'

const agent = (id: string, status: string, parentId?: string) =>
  ({ id, status, parentId, description: `job ${id}`, type: 'fork' }) as const

test('tracks top-level running agents with their sub-agent progress', async () => {
  const listed = [
    agent('review', 'running'),
    agent('finder-a', 'completed', 'review'),
    agent('finder-b', 'running', 'review'),
    agent('old', 'completed'),
  ]

  expect(reconcile([], listed as never, { review: 500 }, 1_000)).toEqual([
    {
      id: 'review',
      label: 'job review',
      startedAt: 500,
      isSeenFromStart: true,
      childIds: ['finder-a', 'finder-b'],
      doneChildIds: ['finder-a'],
    },
  ])
})

test('remembers finished sub-agents after the list drops them', async () => {
  const first = reconcile([], [agent('review', 'running'), agent('a', 'completed', 'review')] as never, {}, 1_000)
  const later = reconcile(first, [agent('review', 'running')] as never, {}, 9_000)

  expect(later[0]).toMatchObject({ startedAt: 1_000, isSeenFromStart: false, childIds: ['a'], doneChildIds: ['a'] })
})
