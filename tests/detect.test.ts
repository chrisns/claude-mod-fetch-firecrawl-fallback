import { describe, expect, test } from 'claude-code/testing'
import { isBlocked, isWallText, mayLeaveMachine } from '../hooks/detect.ts'

describe('isBlocked', () => {
  test('bot-wall statuses', () => {
    for (const code of [401, 403, 429, 503, 999]) expect(isBlocked({ code, text: '', isError: false })).toBe(true)
  })
  test('real answers are not walls', () => {
    expect(isBlocked({ code: 200, text: 'The pricing page lists three plans.'.repeat(60), isError: false })).toBe(false)
    expect(isBlocked({ code: 404, text: 'Not found', isError: false })).toBe(false)
    expect(isBlocked({ code: 500, text: 'oops', isError: true })).toBe(false)
  })
  test('an errored fetch naming 403', () => {
    expect(isBlocked({ text: 'Request failed with status code 403', isError: true })).toBe(true)
  })
  test('a short 200 that is a challenge page', () => {
    expect(isBlocked({ code: 200, text: 'The page says "Just a moment..." and asks to enable JavaScript and cookies to continue.', isError: false })).toBe(true)
  })
  test('a cross-host redirect is not a wall', () => {
    expect(isBlocked({ code: 200, text: 'REDIRECT DETECTED: the URL redirects to another host', isError: false })).toBe(false)
  })
})

describe('mayLeaveMachine', () => {
  test('public https passes', () => expect(mayLeaveMachine('https://www.example.com/a?b=1', '')).toBe(true))
  test('refuses private, local, credentialed and non-http URLs', () => {
    for (const u of ['http://localhost:3000', 'http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.0.9/', 'http://nas/', 'http://printer.local/', 'https://user:pw@example.com/', 'file:///etc/passwd', 'not a url'])
      expect(mayLeaveMachine(u, '')).toBe(false)
  })
  test('skip_hosts matches the host and its subdomains', () => {
    expect(mayLeaveMachine('https://a.corp-example.com/', 'corp-example.com')).toBe(false)
    expect(mayLeaveMachine('https://example.org/', 'corp-example.com')).toBe(true)
  })
})

describe('isWallText', () => {
  test('empty and challenge text', () => {
    expect(isWallText('')).toBe(true)
    expect(isWallText('Checking your browser before accessing the site. This process is automatic. Please wait a few seconds.')).toBe(true)
    expect(isWallText('A real article. '.repeat(40))).toBe(false)
  })
})
