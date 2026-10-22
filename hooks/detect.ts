// Pure helpers: is a WebFetch outcome an anti-bot wall, and may a URL leave the machine.

// Statuses a bot wall answers with. 404 and 5xx other than 503 are real answers, not walls.
const BLOCK_STATUS = new Set([401, 403, 406, 407, 429, 451, 503, 999])

// A page that is the wall itself. These phrases are the vendors' own interstitial copy.
const CHALLENGE =
  /just a moment\.\.\.|attention required! \| cloudflare|checking your browser|verify(ing)? you are (a )?human|enable javascript and cookies to continue|cf-chl|cf_chl|challenge-platform|pardon our interruption|px-captcha|perimeterx|datadome|incapsula incident|request unsuccessful\. incapsula|access denied.{0,40}(akamai|reference #)|unusual traffic from your computer|are you a robot|please complete the security check|captcha-delivery|\bddos protection by\b/i

// The summary WebFetch's small model writes about a wall says so in its own words.
const WALL_SUMMARY =
  /\b(cloudflare|captcha|anti-bot|bot (protection|detection)|security check|access denied|challenge page|blocked (the|this) request|403 forbidden|are you a human)\b/i

export type Outcome = { code?: number; text: string; isError: boolean }

export function isBlocked(o: Outcome): boolean {
  if (o.code !== undefined && BLOCK_STATUS.has(o.code)) return true
  if (o.isError) {
    const m = /\b(?:status(?: code)?|HTTP|error)\s*:?\s*(\d{3})\b/i.exec(o.text) ?? /\b(40[13679]|429|451|503|999)\b/.exec(o.text)
    if (m && BLOCK_STATUS.has(Number(m[1]))) return true
    return CHALLENGE.test(o.text)
  }
  // A cross-host redirect is WebFetch asking the agent a question, not a wall.
  if (/REDIRECT DETECTED/.test(o.text)) return false
  // A wall that came back 200 is short: the summary of a real page is not.
  return o.text.length < 1500 && (CHALLENGE.test(o.text) || WALL_SUMMARY.test(o.text))
}

// Raw page text (Firecrawl markdown, Chrome page text) that is still the wall, or empty.
export function isWallText(text: string): boolean {
  const t = text.trim()
  if (t.length < 80) return true
  return t.length < 3000 && CHALLENGE.test(t)
}

const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/

// A third party must never be handed a URL only this machine can reach, or one carrying a login.
export function mayLeaveMachine(raw: string, skipHosts: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    if (host === 'localhost' || host.includes(':')) return false
  }
  if (PRIVATE_V4.test(host)) return false
  if (!host.includes('.')) return false // intranet single-label names
  if (/\.(local|internal|lan|home|corp|intranet|localhost)$/.test(host)) return false
  const skips = skipHosts.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !skips.some(s => host === s || host.endsWith(`.${s}`))
}

export function mayOpenInBrowser(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
