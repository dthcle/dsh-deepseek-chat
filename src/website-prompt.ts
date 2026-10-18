import { WEBSITE_SESSION_ORIGIN } from './protocol.js'

/** Largest accepted preference; keeps one outbound request body bounded. */
export const SYSTEM_PROMPT_LIMIT = 4000

/** Trim one plain-text preference; never interpret, rewrite or log its content. */
export function normalizeSystemPrompt(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, SYSTEM_PROMPT_LIMIT).replace(/\r\n/g, '\n') : ''
}

/**
 * Install the outbound-prompt hook in our approved Chat guest only.
 *
 * The official page has no system-prompt field, so the only public place to add
 * an instruction is the request the page itself sends. The hook prefixes the
 * configured text to the pending user message of the site's own completion
 * request. The page keeps ownership of URLs, headers, sessions, streaming and
 * rendering; nothing is read back, stored or logged, and an empty preference,
 * another origin, a foreign path or an unparsable body is left exactly as the
 * website produced it. Every helper stays inside this function: it is
 * serialized into the guest.
 */
export function installWebsitePrompt(prompt: string, origin: string): 'installed' | 'updated' | 'skipped' {
  const key = '__dshChatOutboundPrompt'
  const scope = globalThis as unknown as Record<string, any>
  const previous = scope[key]
  if (previous && typeof previous === 'object') {
    previous.prompt = prompt
    return previous.installed === true ? 'updated' : 'skipped'
  }
  const state = { prompt, installed: false }
  scope[key] = state
  const active = (): boolean => state.prompt.length > 0
  const busy = (value: string): boolean => value.length === 0 || value.length > 8_000_000
  const target = (input: unknown): boolean => {
    try {
      const raw = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : typeof input === 'object' && input !== null && typeof (input as { url?: unknown }).url === 'string' ? String((input as { url: string }).url)
        : ''
      if (raw.length === 0) return false
      const url = new URL(raw, scope.location && typeof scope.location.href === 'string' ? scope.location.href : origin)
      return url.origin === origin && url.pathname.indexOf('/api/') === 0 && url.pathname.indexOf('completion') >= 0
    } catch { return false }
  }
  const rewrite = (body: unknown): unknown => {
    if (!active() || typeof body !== 'string' || busy(body)) return body
    let payload: any
    try { payload = JSON.parse(body) } catch { return body }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return body
    if (typeof payload.prompt !== 'string' || payload.prompt.length === 0) return body
    if (payload.prompt.indexOf(state.prompt) === 0) return body
    payload.prompt = state.prompt + String.fromCharCode(10) + String.fromCharCode(10) + payload.prompt
    try { return JSON.stringify(payload) } catch { return body }
  }
  const originalFetch = scope.fetch
  if (typeof originalFetch === 'function') {
    scope.fetch = function (this: unknown, input: unknown, init?: any) {
      let next = init
      try {
        if (target(input) && next && typeof next.body === 'string') {
          const body = rewrite(next.body)
          if (body !== next.body) next = { ...next, body }
        }
      } catch { /* The website's own request must never fail because of us. */ }
      return originalFetch.call(this, input, next)
    }
  }
  const Xhr = scope.XMLHttpRequest
  if (typeof Xhr === 'function' && Xhr.prototype) {
    const open = Xhr.prototype.open
    const send = Xhr.prototype.send
    Xhr.prototype.open = function (this: any, method: string, url: string, ...rest: unknown[]) {
      try { this.__dshChatPromptTarget = target(url) } catch { this.__dshChatPromptTarget = false }
      return open.apply(this, [method, url, ...rest])
    }
    Xhr.prototype.send = function (this: any, body?: any) {
      let next = body
      try { if (this.__dshChatPromptTarget === true) next = rewrite(body) } catch { next = body }
      return send.call(this, next)
    }
  }
  state.installed = true
  return 'installed'
}

/** Serialize the hook for one guest document; the preference never enters a URL. */
export function websitePromptScript(prompt: string): string {
  return '(' + installWebsitePrompt.toString() + ')(' + JSON.stringify(prompt) + ', ' + JSON.stringify(WEBSITE_SESSION_ORIGIN) + ')'
}
