import type { WebsiteSession } from './protocol.js'

/**
 * Standard DOM storage access in our approved Chat guest only. These three
 * shapes reflect the current public website implementation; they are not a
 * stable OAuth API. No cookies, other storage, page text or app stores are read.
 */
export type WebsiteSessionCommand = { readonly type: 'capture' }
  | { readonly type: 'restore'; readonly session: WebsiteSession }
  | { readonly type: 'clear' }

export type WebsiteSessionRestoreResult = 'present' | 'restored' | 'failed'

/** Keep every runtime helper inside this function: it is serialized into the guest. */
export function adaptWebsiteSession(doc: Document, command: WebsiteSessionCommand): WebsiteSession | null | WebsiteSessionRestoreResult | boolean {
  const keys = ['userToken', '__appKit_userInfo', 'deepseek-device-id:chat'] as const
  const text = (value: unknown, limit: number): value is string => typeof value === 'string'
    && value.length > 0 && value.length <= limit && value.trim() === value
  const uuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object'
    && value !== null && !Array.isArray(value)
  const shape = (value: Record<string, unknown>, names: readonly string[]): boolean => {
    const own = Object.keys(value)
    return own.length === names.length && names.every(name => own.includes(name))
  }
  const parse = (raw: string | null): unknown => {
    if (raw === null || raw.length > 18_000) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  const wrapper = (value: unknown): value is { value: unknown; __version: '0' } => object(value)
    && shape(value, ['value', '__version']) && value.__version === '0'
  const token = (raw: string | null): string | null => {
    const value = parse(raw)
    return wrapper(value) && text(value.value, 16_384) ? value.value : null
  }
  const userId = (raw: string | null): string | null => {
    const value = parse(raw)
    return wrapper(value) && object(value.value) && shape(value.value, ['id'])
      && text(value.value.id, 512) ? value.value.id : null
  }
  const validSession = (value: unknown): value is WebsiteSession => object(value)
    && shape(value, ['token', 'userId', 'deviceId']) && text(value.token, 16_384)
    && text(value.userId, 512) && uuid(value.deviceId)
  const failure = (): null | false | 'failed' => command.type === 'capture' ? null
    : command.type === 'clear' ? false : 'failed'

  try {
    const page = doc.defaultView
    if (page === null || page.location.origin !== 'https://chat.deepseek.com') return failure()
    const storage = page.localStorage
    if (command.type === 'clear') {
      // A failed deletion must not put back a credential the user asked to forget.
      let cleared = true
      for (const key of keys) {
        try { storage.removeItem(key) } catch { cleared = false }
      }
      return cleared
    }

    const previousToken = storage.getItem(keys[0])
    const currentToken = token(previousToken)
    if (command.type === 'capture') {
      const id = userId(storage.getItem(keys[1]))
      const deviceId = storage.getItem(keys[2])
      return currentToken !== null && id !== null && uuid(deviceId)
        ? { token: currentToken, userId: id, deviceId } : null
    }
    if (!validSession(command.session)) return 'failed'
    // Preserve any valid website token already present, including another web account.
    if (currentToken !== null) return 'present'
    const previous = [previousToken, storage.getItem(keys[1]), storage.getItem(keys[2])] as const
    const next = [JSON.stringify({ value: command.session.token, __version: '0' }),
      JSON.stringify({ value: { id: command.session.userId }, __version: '0' }), command.session.deviceId] as const
    try {
      // Set identity first, token last.
      storage.setItem(keys[2], next[2])
      storage.setItem(keys[1], next[1])
      storage.setItem(keys[0], next[0])
      // The site subscribes to storage events, which a same-document write does
      // not emit. Re-dispatch the standard event so an already rendered page can
      // adopt the restored identity in place instead of forcing a full reload.
      try {
        for (const key of keys) {
          const event = new StorageEvent('storage', {
            key, newValue: storage.getItem(key), oldValue: null, url: page.location.href, storageArea: storage,
          })
          page.dispatchEvent(event)
        }
      } catch { /* A reload remains available as the caller's fallback. */ }
      return 'restored'
    } catch {
      // Web Storage has no transaction API: roll back every fixed key as a best effort.
      for (let index = 0; index < keys.length; index++) {
        try {
          const oldValue = previous[index]
          if (oldValue === null) storage.removeItem(keys[index])
          else storage.setItem(keys[index], oldValue)
        } catch { /* Report only a fixed result, never the storage value or exception. */ }
      }
      return 'failed'
    }
  } catch { return failure() }
}

/** Validate an untrusted guest result without logging or returning other fields. */
export function parseWebsiteSession(value: unknown): WebsiteSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const session = value as Record<string, unknown>
  const own = Object.keys(session)
  if (own.length !== 3 || !['token', 'userId', 'deviceId'].every(name => own.includes(name))
    || typeof session.token !== 'string' || !session.token
    || session.token.length > 16_384 || session.token.trim() !== session.token
    || typeof session.userId !== 'string' || !session.userId || session.userId.length > 512
    || session.userId.trim() !== session.userId || typeof session.deviceId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.deviceId)) return null
  return { token: session.token, userId: session.userId, deviceId: session.deviceId }
}

/** Serialize only typed, normalized arguments; never interpolate a credential as source code. */
export function websiteSessionScript(command: WebsiteSessionCommand): string {
  let normalized: WebsiteSessionCommand
  if (command.type === 'restore') {
    const session = parseWebsiteSession(command.session)
    if (session === null) throw new Error('Invalid website session')
    normalized = { type: 'restore', session }
  } else {
    normalized = { type: command.type }
  }
  const args = JSON.stringify(normalized).replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `(${adaptWebsiteSession.toString()})(document,${args})`
}

export const websiteSessionCaptureScript = (): string => websiteSessionScript({ type: 'capture' })
export const websiteSessionRestoreScript = (session: WebsiteSession): string => websiteSessionScript({ type: 'restore', session })
export const websiteSessionClearScript = (): string => websiteSessionScript({ type: 'clear' })
