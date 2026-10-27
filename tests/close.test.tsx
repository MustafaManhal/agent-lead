import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-lead',
  component: 'Pane',
  requestId: 'agent-lead',
  props: {
    title: 'agent live',
    isFocused: false,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('/agent opens the pane, /agent close closes it', async ($, on) => {
  const opened: unknown[] = []
  const closed: unknown[] = []
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })

  const open = await $.command.run({ command: 'agent', args: '' })
  expect(open.text).toBe('Agent live pane opened. /agent close hides it.')
  expect(opened).toHaveLength(1)
  expect(opened[0]).toMatchObject({ id: 'agent-lead' })

  const result = await $.command.run({ command: 'agent', args: 'close' })
  expect(result.text).toBe('Agent live pane closed.')
  expect(closed).toEqual(['agent-lead'])
})

test('the pane has no close buttons and names /agent close, on every surface', async $ => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: /If you want to close the pane, use \/agent close/ })).toBeTruthy()
    await ui.unmount()
  }
})
