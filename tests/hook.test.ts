import { describe, expect, mock, test } from 'claude-code/testing'

const PAGE = 'Pricing: Free, Pro at 10 pounds, Team at 40 pounds per seat. '.repeat(8)
const FETCH = { tool: 'WebFetch', url: 'https://shop.example.com/pricing', prompt: 'What does Pro cost?' } as never
const blocked = () => ({ result: { bytes: 0, code: 403, codeText: 'Forbidden', result: 'Forbidden', durationMs: 5, url: 'https://shop.example.com/pricing' }, text: 'Forbidden' })

function engine(on: any, opts: { fetch?: () => unknown; firecrawl?: { exitCode: number; stdout: string; onRun?: () => void }; chrome?: (tool: string) => unknown } = {}) {
  const seen: string[] = []
  mock.clock(on)
  on('tool.call', { tool: 'WebFetch' }, opts.fetch ?? blocked)
  on('process.run', () => {
    opts.firecrawl?.onRun?.()
    return { value: { exitCode: opts.firecrawl?.exitCode ?? 1, stdout: opts.firecrawl?.stdout ?? '', stderr: '' } }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Pro costs 10 pounds.' } }))
  for (const t of ['tabs_context_mcp', 'tabs_create_mcp', 'navigate', 'get_page_text', 'tabs_close_mcp'])
    on('tool.call', { tool: `mcp__claude-in-chrome__${t}` }, () => {
      seen.push(t)
      return opts.chrome ? opts.chrome(t) : { result: '', text: t === 'tabs_create_mcp' ? 'Created tab tabId: 7' : PAGE }
    })
  return seen
}

describe('WebFetch fallback', () => {
  test('a good fetch is untouched', async ($, on) => {
    const seen = engine(on, { fetch: () => ({ result: { bytes: 9, code: 200, codeText: 'OK', result: 'Pro is 10 pounds.'.repeat(120), durationMs: 5, url: 'u' }, text: 'Pro is 10 pounds.'.repeat(120) }) })
    const r = await $.tool.call(FETCH)
    expect(r.text).toContain('Pro is 10 pounds.')
    expect(seen).toEqual([])
  })

  test('a 403 is answered through Firecrawl as an ordinary WebFetch result', async ($, on) => {
    const seen = engine(on, { firecrawl: { exitCode: 0, stdout: PAGE } })
    const r = await $.tool.call(FETCH)
    expect(r.deny).toBeUndefined()
    expect((r.result as { code: number; result: string }).code).toBe(200)
    expect((r.result as { result: string }).result).toBe('Pro costs 10 pounds.')
    expect(seen).toEqual([])
  })

  test('Firecrawl failing goes to Chrome and closes the tab', async ($, on) => {
    const seen = engine(on, { firecrawl: { exitCode: 1, stdout: '' } })
    const r = await $.tool.call(FETCH)
    expect((r.result as { result: string }).result).toBe('Pro costs 10 pounds.')
    expect(seen).toEqual(['tabs_context_mcp', 'tabs_create_mcp', 'navigate', 'get_page_text', 'tabs_close_mcp'])
  })

  test('every rung failing returns WebFetch\'s own answer', async ($, on) => {
    engine(on, { firecrawl: { exitCode: 1, stdout: '' }, chrome: () => ({ isError: true, text: 'no browser', result: '' }) })
    const r = await $.tool.call(FETCH)
    expect(r.text).toBe('Forbidden')
  })

  test('a private URL never reaches Firecrawl', { options: { chrome: false } }, async ($, on) => {
    let ran = false
    engine(on, { firecrawl: { exitCode: 0, stdout: PAGE, onRun: () => { ran = true } } })
    const r = await $.tool.call({ tool: 'WebFetch', url: 'http://192.168.1.5/admin', prompt: 'x' } as never)
    expect(ran).toBe(false)
    expect(r.text).toBe('Forbidden')
  })
})
