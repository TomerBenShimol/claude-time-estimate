import type { AgentInfo, On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const band = (isWorking: boolean) =>
  ({
    plugin: 'time-estimate',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking,
      maxRows: 10,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  }) as const

const engine = (on: On, listed: () => AgentInfo[]) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: listed() }) as never)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return h(Box, { key: 'engine' }) as RenderElement
  })
}

test('the band ticks while a turn runs and clears when it ends', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, { durations: [30_000, 60_000, 120_000, 180_000, 240_000] })
  engine(on, () => [])

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'do it', turnId: 't1' })
  await clock.advance(65_000)

  const ui = await $.ui.mount(band(true))
  const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(shown).toContain('55s left')

  await clock.advance(1_000)
  await ui.redraw()
  const ticked = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(ticked).toContain('54s left')

  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 65_000, isAborted: false })
  await ui.redraw()
  expect(await ui.find({ key: 'time-estimate' })).toBeUndefined()
  await ui.unmount()
})

test('a background agent shows while the main loop is idle', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, { agentDurations: { '/code-review max': [600_000] } })
  const review = { id: 'r1', description: '/code-review max', type: 'fork', status: 'running' } as const
  const finder = (id: string, status: AgentInfo['status']) =>
    ({ id, description: id, type: 'general-purpose', status, parentId: 'r1' }) as const
  let listed: AgentInfo[] = [review, finder('f1', 'completed'), finder('f2', 'running')]
  engine(on, () => listed)

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: '', turnId: 'a1', agentId: 'r1' })
  await clock.advance(120_000)

  const ui = await $.ui.mount(band(false))
  const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(shown).toContain('/code-review max')
  expect(shown).toContain('2m 00s ·')
  expect(shown).toContain('sub-agents 1/2')
  expect(shown).toContain('~2m 00s left')

  listed = [{ ...review, status: 'completed' }]
  await $.turn.complete({ turnId: 'a1', agentId: 'r1', reason: 'answer', answer: '', durationMs: 121_000, isAborted: false })
  await clock.advance(1_000)
  await ui.redraw()
  expect(await ui.find({ key: 'time-estimate' })).toBeUndefined()
  await ui.unmount()
})
