import { configureWebsiteShareCopy } from './website-share-copy.js'
import { applyWebsiteTypography } from './website-typography.js'
import { collapseWebsiteSidebar } from './website-sidebar-collapse.js'
import { performWebsiteConversationAction } from './website-conversation-actions.js'
import { adaptWebsiteHeader } from './website-header.js'
import { adaptWebsiteSettings } from './website-settings.js'
import { dismissWebsiteEnvironmentNotice } from './website-notice.js'
/** Visible website navigation/account/preferences only; no credentials, storage or request APIs. */
export interface WebsiteConversation {
  readonly href: string
  readonly title: string
  readonly group: string
}
export interface WebsiteNavigation {
  readonly status: 'loading' | 'ready' | 'sign-in' | 'unsupported'
  /** Public profile presence only; independent of layout/preferences readiness. */
  readonly authenticated?: boolean
  readonly conversations: readonly WebsiteConversation[]
  readonly selectedHref: string | null
  readonly canCreate: boolean
  readonly error: string | null
  readonly accountName?: string | null
  readonly settings?: {language: string | null; theme: string | null; error: string | null; pending?: boolean; restored?: boolean }
  /** Bounded, text-free view of the guest adapter's own state for the settings page. */
  readonly diagnostic?: WebsiteDiagnostic
}

/** Counts, enums and booleans only: never page text, titles or account values. */
export interface WebsiteDiagnostic {
  readonly status: WebsiteNavigation['status']
  readonly authenticated: boolean | undefined
  readonly profile: boolean
  readonly sidebar: boolean
  readonly newChat: boolean
  readonly conversations: number
  readonly appearanceRequest: string | null
  readonly appearancePhase: string | null
  readonly appearanceRemainingMs: number
  readonly appearanceDark: boolean
  readonly appearanceError: boolean
  readonly appearanceRestored: boolean
  /** Which public proof produced `authenticated`: the avatar/footer, the confirmed navigation column, or none. */
  readonly proof: 'avatar' | 'navigation' | 'none'
  /** `<img>` elements currently inside the confirmed navigation column. */
  readonly trackImages: number
  readonly fallback: boolean
  readonly missingSidebarMs: number
  readonly authenticatedMs: number
  /** Per-document tallies: they separate a permanently failing gate from a flapping one. */
  readonly polls: number
  readonly boundaryFailures: number
  readonly identifiedPolls: number
  readonly anonymousPolls: number
  readonly appearanceBlocks: number
  readonly fallbacks: number
  /** Main-frame documents this guest has presented; a climbing number means reloads. */
  readonly documents: number
  /**
   * Why the last projection produced nothing usable. Bounded, structural only:
   * an error class plus the failing stage, never page text or account values.
   */
  readonly failure: string | null
}

export type WebsiteCommand = { readonly type: 'snapshot'; readonly showOriginal: boolean; readonly headerInset?: number }
  | { readonly type: 'open'; readonly href: string }
  | { readonly type: 'conversation-action'; readonly href: string; readonly action: 'rename' | 'pin' | 'unpin' | 'share' | 'delete'; readonly title?: string }
  | { readonly type: 'settings-read' } | { readonly type: 'settings-close' } | { readonly type: 'setting'; readonly key: 'language' | 'theme'; readonly value: string }
  | { readonly type: 'preferences'; readonly language: string }
  | { readonly type: 'logout' }
  /** Handled by the guest owner; never a DOM-only snapshot. */
  | { readonly type: 'refresh'; readonly requestId: number; readonly authenticationRevision: number }
  | { readonly type: 'new' } | { readonly type: 'more' } | { readonly type: 'restore' }

export const emptyNavigation = (): WebsiteNavigation => ({ status: 'loading', authenticated: false, conversations: [], selectedHref: null, canCreate: false, error: null })

/**
 * The host's own frame, published as soon as it replaces a document and whenever
 * its adapter fails. CHAT settings must always have something to show: the older
 * "no diagnostic yet" placeholder hid exactly the reload loops it had to reveal.
 */
export const hostDiagnostic = (documents: number, failure: string | null = null): WebsiteDiagnostic => ({
  status: 'loading', authenticated: undefined, profile: false, sidebar: false, newChat: false, conversations: 0,
  appearanceRequest: null, appearancePhase: null, appearanceRemainingMs: 0,
  appearanceDark: false, appearanceError: false, appearanceRestored: false,
  proof: 'none', trackImages: 0, fallback: false, missingSidebarMs: 0, authenticatedMs: 0,
  polls: 0, boundaryFailures: 0, identifiedPolls: 0, anonymousPolls: 0, appearanceBlocks: 0, fallbacks: 0,
  documents: Number.isFinite(documents) && documents > 0 ? Math.round(documents) : 0,
  failure,
})

/** This function is serialized into our isolated guest. Keep all helpers inside it. */
export function adaptWebsiteNavigation(doc: Document, page: Pick<Location, 'origin' | 'pathname'>, command: WebsiteCommand): WebsiteNavigation {
  // Declared here on purpose: this function is serialized into the website guest
  // with Function.prototype.toString. A module-level reference would be undefined
  // inside the guest and abort the entire injected command.
  const FIRST_PAINT_GRACE_MS = 6_000
  const origin = 'https://chat.deepseek.com'
  const marker = 'data-dsh-chat-navigation'
  const presentedMarker = 'data-dsh-chat-presented'
  const missingSidebarMarker = 'data-dsh-chat-sidebar-missing-at'
  const authSinceMarker = 'data-dsh-chat-auth-since'
  const preparingMarker = 'data-dsh-chat-preparing'
  const fallbackMarker = 'data-dsh-chat-fallback'
  const fallbackErrorMarker = 'data-dsh-chat-fallback-error'
  const profileMarker = 'data-dsh-chat-profile'
  const profileProofMarker = 'data-dsh-chat-profile-confirmed'
  const profileAvatarMarker = 'data-dsh-chat-profile-avatar'
  const navigationWidthMarker = 'data-dsh-chat-navigation-width'
  const expandingMarker = 'data-dsh-chat-expanding'
  const compactToggleMarker = 'data-dsh-chat-compact-toggle'
  const conversationError = '该对话不在当前官网列表，请刷新列表。'
  const styleId = 'dsh-chat-website-navigation-style'
  const preparingStyleId = 'dsh-chat-website-preparing-style'
  const owned = [marker, presentedMarker, missingSidebarMarker, fallbackMarker, fallbackErrorMarker, profileMarker, profileProofMarker, profileAvatarMarker, navigationWidthMarker, expandingMarker, compactToggleMarker, 'data-dsh-chat-native-collapse-attempt', 'data-dsh-chat-action-menu', 'data-dsh-chat-conversation-error', 'data-dsh-chat-layout', 'data-dsh-chat-content', 'data-dsh-chat-web-chrome', 'data-dsh-chat-settings-dialog', 'data-dsh-chat-settings-host', 'data-dsh-chat-settings-tabs', 'data-dsh-chat-settings-pane', 'data-dsh-chat-settings-layout', 'data-dsh-chat-settings-chrome', 'data-dsh-chat-settings-appearance', 'data-dsh-chat-header-row', 'data-dsh-chat-header-title', 'data-dsh-chat-header-share', 'data-dsh-chat-header-title-host', 'data-dsh-chat-header-editor', 'data-dsh-chat-header-native-depth', authSinceMarker]
  const empty = (status: WebsiteNavigation['status']): WebsiteNavigation => ({ status, ...(status === 'sign-in' ? { authenticated: false } : {}), conversations: [], selectedHref: null, canCreate: false, error: null })
  const clearSettings = (preserveConfirmedPreferences = false) => {
    const confirmed = ['data-dsh-chat-language', 'data-dsh-chat-theme', 'data-dsh-chat-theme-complete', 'data-dsh-chat-settings-theme-target', 'data-dsh-chat-settings-restored']
    for (const attr of [...doc.documentElement.attributes]) if (/^data-dsh-chat-(settings-|language$|theme$|theme-complete$|dark-complete$)/.test(attr.name)
      && !(preserveConfirmedPreferences && confirmed.includes(attr.name))) doc.documentElement.removeAttribute(attr.name)
  }
  const restore = (preserveConfirmedPreferences = false, preserveCompactAttempt = false) => {
    clearSettings(preserveConfirmedPreferences)
    if (!preserveConfirmedPreferences) doc.documentElement.removeAttribute('data-dsh-chat-host-theme')
    doc.getElementById(styleId)?.remove()
    doc.getElementById('dsh-chat-header-style')?.remove()
    doc.getElementById('dsh-chat-website-typography')?.remove()
    doc.documentElement.style.removeProperty('--dsh-chat-title-inset')
    doc.getElementById(preparingStyleId)?.remove()
    doc.getElementById('dsh-chat-settings-view-style')?.remove()
    doc.documentElement.removeAttribute('data-dsh-chat-voice')
    doc.documentElement.removeAttribute('data-dsh-chat-preparing')
    owned.forEach(attr => {
      if (preserveCompactAttempt && (attr === expandingMarker || attr === compactToggleMarker)) return
      doc.querySelectorAll(`[${attr}]`).forEach(node => node.removeAttribute(attr))
    })
  }
  const fallback = (error: 'open' | null = null): WebsiteNavigation => {
    bump('fallback')
    // Leave confirmed public preferences intact when revealing the original
    // website. A later structural recovery must not restart completed settings.
    const preserveRecovery = page.origin === origin && !/^\/sign_in\/?$/.test(page.pathname) && command.type !== 'restore'
    restore(preserveRecovery, preserveRecovery)
    if (page.origin === origin && /^\/sign_in\/?$/.test(page.pathname)) return empty('sign-in')
    if (!(command.type === 'snapshot' && command.showOriginal)) {
      doc.documentElement.setAttribute(fallbackMarker, '')
      if (error) doc.documentElement.setAttribute(fallbackErrorMarker, error)
    }
    return { ...empty('unsupported'), error: error === 'open' ? conversationError : null }
  }
  const fallbackNavigation = (): WebsiteNavigation => ({ ...empty('unsupported'), error: doc.documentElement.getAttribute(fallbackErrorMarker) === 'open' ? conversationError : null })
  const isOriginalSnapshot = command.type === 'snapshot' && command.showOriginal
  // Per-document tallies live in plain attributes: they survive restore()/fallback
  // within one document and never carry page text.
  const diagRoot = doc.documentElement
  const diagKey = (name: string) => `data-dsh-chat-diag-${name}`
  const diagCount = (name: string): number => {
    const value = Number(diagRoot.getAttribute(diagKey(name)))
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  const bump = (name: string): void => { diagRoot.setAttribute(diagKey(name), String(diagCount(name) + 1)) }
  // Every early return publishes this frame so a failing gate stays visible in
  // CHAT settings instead of silently reporting "no diagnostic yet".
  const baseDiagnostic = (status: WebsiteNavigation['status']): WebsiteDiagnostic => {
    const since = Number(diagRoot.getAttribute(missingSidebarMarker))
    const authSince = Number(diagRoot.getAttribute(authSinceMarker))
    return {
      status, authenticated: undefined, profile: false, sidebar: sidebar !== null, newChat: newChat !== null, conversations: 0,
      proof: 'none', trackImages: track.querySelectorAll('img').length,
      appearanceRequest: diagRoot.getAttribute('data-dsh-chat-settings-request'),
      appearancePhase: diagRoot.getAttribute('data-dsh-chat-settings-phase'),
      appearanceRemainingMs: Math.max(0, Number(diagRoot.getAttribute('data-dsh-chat-settings-deadline')) - Date.now()) || 0,
      appearanceDark: diagRoot.hasAttribute('data-dsh-chat-dark-complete'),
      appearanceError: diagRoot.hasAttribute('data-dsh-chat-settings-error'),
      appearanceRestored: diagRoot.hasAttribute('data-dsh-chat-settings-restored'),
      fallback: diagRoot.hasAttribute(fallbackMarker),
      missingSidebarMs: Number.isFinite(since) && since > 0 ? Date.now() - since : 0,
      authenticatedMs: Number.isFinite(authSince) && authSince > 0 ? Date.now() - authSince : 0,
      polls: diagCount('polls'), boundaryFailures: diagCount('boundary'), identifiedPolls: diagCount('identified'),
      anonymousPolls: diagCount('anonymous'), appearanceBlocks: diagCount('appearance'), fallbacks: diagCount('fallback'),
      documents: 0, failure: null,
    }
  }
  if (page.origin !== origin) return fallback()
  bump('polls')
  if (command.type !== 'restore') dismissWebsiteEnvironmentNotice(doc)
  if (command.type === 'restore' || (command.type === 'snapshot' && command.showOriginal)) {
    doc.dispatchEvent(new Event('dsh-chat-stop-adapting'))
    if (command.type === 'restore') return fallback()
    restore()
  }
  // React can briefly remove navigation while a login/route commit is pending.
  // Keep probing a failed document without hiding it. Only a confirmed compact
  // navigation row may open its own sidebar once while waiting for that layout.
  const recovering = doc.documentElement.hasAttribute(fallbackMarker)
  // Own observer runs in the same DOM microtask checkpoint as the site's React
  // commit, before paint. No app globals or data stores cross the guest boundary.
  if (!(command.type === 'snapshot' && command.showOriginal) && !doc.documentElement.hasAttribute('data-dsh-chat-observing') && doc.defaultView) {
    doc.documentElement.setAttribute('data-dsh-chat-observing', '')
    let queued = false
    const observer = new MutationObserver(() => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (!doc.documentElement.hasAttribute('data-dsh-chat-observing')) return
        adaptWebsiteNavigation(doc, doc.defaultView!.location, { type: 'snapshot', showOriginal: false, headerInset: Number.parseInt(doc.documentElement.style.getPropertyValue('--dsh-chat-title-inset')) || 24 })
      })
    })
    // Observe site edit-mode switches, but exclude our data/style attributes
    // so setting layout markers cannot recursively trigger the adapter.
    observer.observe(doc.body, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','type','contenteditable','role']})
    doc.addEventListener('dsh-chat-stop-adapting', () => {
      observer.disconnect(); doc.documentElement.removeAttribute('data-dsh-chat-observing')
    }, {once:true})
  }
  if (/^\/sign_in\/?$/.test(page.pathname)) { restore(); return empty('sign-in') }
  // Gate only the document's first adapted paint. Later appearance checks must
  // leave the presented website and its environment/security notices visible.
  // This gate runs before the profile is identified, so it cannot know whether the
  // theme sync will ever start. It stays bounded by FIRST_PAINT_GRACE_MS in the
  // ready gate below; the opacity must never outlive that bound.
  if (!isOriginalSnapshot && !recovering && !doc.documentElement.hasAttribute(presentedMarker)) {
    if (!doc.documentElement.hasAttribute(preparingMarker)) doc.documentElement.setAttribute(preparingMarker, String(Date.now()))
    if (!doc.getElementById(preparingStyleId)) {
      const style=doc.createElement('style'); style.id=preparingStyleId
      style.textContent='html[data-dsh-chat-preparing] body{opacity:0!important}'
      doc.head.append(style)
    }
  }
  const safeHref = (value: string | null) => {
    try {
      const url = new URL(value ?? '', origin)
      return url.origin === origin && /^\/a\/chat\/s\/[a-zA-Z0-9-]+$/.test(url.pathname)
        && !url.search && !url.hash && !url.username && !url.password ? url.href : null
    } catch { return null }
  }
  const labels = /^(开启新对话|新对话|New chat|New Chat)$/
  const groups = /^(置顶|今天|昨天|前天|\d+\s*天内|\d+\s*天前|\d{4}-\d{2}|Pinned|Today|Yesterday|Previous \d+ Days)$/i
  const findNew = (root: Element) => {
    const walker = doc.createTreeWalker(root, 4)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (labels.test((node.textContent ?? '').trim()) && node.parentElement instanceof HTMLElement) return node.parentElement
    }
    return null
  }
  const isNavigationColumn = (candidate: HTMLElement) => {
    const rect = candidate.getBoundingClientRect()
    const viewportHeight = doc.defaultView?.innerHeight ?? 600
    return rect.left >= -1 && rect.left <= 16 && rect.top >= -1 && rect.top <= 32
      && rect.width >= 160 && rect.width <= 480 && rect.height >= Math.max(200, viewportHeight * .75)
      && !candidate.querySelector('textarea,[contenteditable="true"]')
  }
  const allLinks = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(link => safeHref(link.getAttribute('href')))
  let sidebar: HTMLElement | null = doc.querySelector<HTMLElement>(`[${marker}]`)
  if (sidebar && (!sidebar.isConnected || !findNew(sidebar))) sidebar = null
  if (!sidebar) {
    // Choose the narrow navigation column containing both history and New Chat,
    // never the root/main/body (which could include chat message links).
    for (const link of allLinks) {
      let candidate = link.parentElement
      for (let depth = 0; candidate && candidate !== doc.body && depth < 12; depth++, candidate = candidate.parentElement) {
        if (isNavigationColumn(candidate) && findNew(candidate)) { sidebar = candidate; break }
      }
      if (sidebar) break
    }
  }
  // An empty-history account still has a navigation column with New Chat.
  if (!sidebar) {
    for (const candidate of doc.querySelectorAll<HTMLElement>('aside,nav,[role="navigation"],div')) {
      if (isNavigationColumn(candidate) && findNew(candidate)) { sidebar = candidate; break }
    }
  }
  const newChat = sidebar ? findNew(sidebar) : null
  const structureExpired = () => {
    const now = Date.now()
    const previous = Number(doc.documentElement.getAttribute(missingSidebarMarker))
    const started = Number.isFinite(previous) && previous > 0 ? previous : now
    if (started !== previous) doc.documentElement.setAttribute(missingSidebarMarker, String(started))
    return now - started >= 5000
  }
  const iconButtonSelector = 'button,[role="button"],.ds-icon-button'
  const compactNavigation = () => {
    const toggleLabels = /^(展开侧边栏|打开侧边栏|侧边栏|切换侧边栏|Open sidebar|Expand sidebar|Toggle sidebar|Sidebar)$/i
    const openingLabels = /^(展开侧边栏|打开侧边栏|Open sidebar|Expand sidebar)$/i
    const searchLabels = /^(搜索|搜索对话|Search|Search chats|Search conversations)$/i
    const newLabels = /^(开启新对话|新对话|新建对话|New chat|New Chat)$/i
    const namedAs = (button: HTMLElement, expected: RegExp) => {
      const names = ['aria-label', 'title'].map(attr => (button.getAttribute(attr) ?? '').trim()).filter(Boolean)
      return names.length === 0 || names.every(name => expected.test(name))
    }
    for (const row of doc.querySelectorAll<HTMLElement>('div,header,nav')) {
      const bounds = row.getBoundingClientRect()
      if (bounds.top < -1 || bounds.top > 72 || bounds.left < -1 || bounds.left > 160
        || bounds.width < 72 || bounds.width > 360 || bounds.height < 24 || bounds.height > 80
        || row.textContent?.trim() || row.closest('[role="dialog"],[role="menu"],[data-dsh-chat-settings-dialog],.ds-modal-content,.ds-dropdown-menu')
        || row.querySelector('a[href],input,textarea,[contenteditable="true"]')) continue
      const rowButtons = [...row.querySelectorAll<HTMLElement>(iconButtonSelector)].filter(button => {
        const parentButton = button.parentElement?.closest(iconButtonSelector)
        return !parentButton || !row.contains(parentButton)
      })
      if (rowButtons.length !== 3) continue
      const buttons = rowButtons.filter(button => {
        const rect = button.getBoundingClientRect()
        return rect.width >= 20 && rect.width <= 64 && rect.height >= 20 && rect.height <= 64
          && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
          && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
          && !button.textContent?.trim() && !!button.querySelector('svg')
          && !button.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(button).visibility !== 'hidden'
          && button.getAttribute('aria-disabled') !== 'true' && !button.matches(':disabled')
      }).sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
      // Anonymous SVG controls are accepted only as the entire compact
      // sidebar/search/new row, never an arbitrary upper-left icon.
      if (buttons.length !== 3 || buttons[0].getAttribute('aria-expanded') === 'true' || !namedAs(buttons[0], toggleLabels)
        || !namedAs(buttons[1], searchLabels) || !namedAs(buttons[2], newLabels)) continue
      const rects = buttons.map(button => button.getBoundingClientRect())
      if (rects.some(rect => Math.abs(rect.top - rects[0].top) > 8)
        || rects[1].left < rects[0].right - 1 || rects[2].left < rects[1].right - 1) continue
      return { row, toggle: buttons[0] }
    }
    // Smaller layouts can omit search. A single/mobile control must name its
    // sidebar purpose publicly; geometry plus a generic SVG is insufficient.
    for (const toggle of doc.querySelectorAll<HTMLElement>(iconButtonSelector)) {
      const bounds = toggle.getBoundingClientRect()
      const name = (toggle.getAttribute('aria-label') || toggle.getAttribute('title') || '').trim()
      const expanded = toggle.getAttribute('aria-expanded')
      if (!toggleLabels.test(name) || expanded === 'true' || (!openingLabels.test(name) && expanded !== 'false')
        || bounds.left < 0 || bounds.left > 160 || bounds.top < 0 || bounds.top > 72
        || bounds.width < 20 || bounds.width > 64 || bounds.height < 20 || bounds.height > 64
        || toggle.textContent?.trim() || !toggle.querySelector('svg') || toggle.getAttribute('aria-disabled') === 'true'
        || toggle.matches(':disabled') || getComputedStyle(toggle).visibility === 'hidden'
        || toggle.closest('[hidden],[aria-hidden="true"],a[href],[role="dialog"],[role="menu"],[data-dsh-chat-settings-dialog],.ds-modal-content,.ds-dropdown-menu')) continue
      return { row: toggle.parentElement, toggle }
    }
    return null
  }
  if (!sidebar || !newChat) {
    // Login can return to the site's retained compact layout. The sidebar must
    // be opened before its full navigation/footer proof can become available,
    // including after fallback; do not let fallback prevent that one action.
    const compact = !isOriginalSnapshot && command.type === 'snapshot' ? compactNavigation() : null
    if (compact && !doc.documentElement.hasAttribute(expandingMarker)) {
      const started = String(Date.now())
      compact.toggle.setAttribute(compactToggleMarker, started)
      doc.documentElement.setAttribute(expandingMarker, started)
      doc.documentElement.setAttribute(missingSidebarMarker, started)
      compact.toggle.click()
      return empty('loading')
    }
    // The document guard survives fallback and a React replacement of the same
    // control. Neither a disappearing compact row nor a new node repeats clicks.
    const expandedAt = Number(doc.documentElement.getAttribute(expandingMarker))
    if (!isOriginalSnapshot && Number.isFinite(expandedAt) && expandedAt > 0 && Date.now() - expandedAt < 5000) return empty('loading')
    if (recovering) return fallbackNavigation()
    if (isOriginalSnapshot || structureExpired()) return fallback()
    // Login can enter the home route before either sidebar or compact controls
    // are mounted. Use the same fixed grace period as later route replacement.
    return empty('loading')
  }
  // The navigation's outer track can outlive an inner sidebar hidden with
  // display:none. Hide the whole bounded track and let its sibling fill it.
  let track = sidebar
  for (let depth = 0; depth < 5 && track.parentElement && track.parentElement !== doc.body; depth++) {
    const parent = track.parentElement
    const r = parent.getBoundingClientRect()
    if (parent.querySelector('textarea,[contenteditable="true"]') || r.width > 480 || r.width < 160 || r.left > 16) break
    track = parent
  }
  const layout = track.parentElement
  // A new route can mount its main track before its composer. The confirmed
  // sidebar/layout boundary identifies that sibling without reading messages.
  const siblings = layout ? [...layout.children].filter(el => el !== track
    && !el.matches('script,style,[role="dialog"],.ds-modal-content')) as HTMLElement[] : []
  const content = siblings.find(el => el.hasAttribute('data-dsh-chat-content'))
    ?? siblings.find(el => el.querySelector('textarea,[contenteditable="true"]'))
    ?? siblings.find(el => el.querySelector('._2be88ba > .the-header > ._9fcbeda'))
    ?? (siblings.length === 1 ? siblings[0] : undefined)
  // Recovery needs the full, bounded sidebar/content boundary, not only a
  // matching label. Do not hide an arbitrary ancestor during a partial commit.
  const trackRect = track.getBoundingClientRect()
  const contentRect = content?.getBoundingClientRect()
  const viewportWidth = doc.defaultView?.innerWidth ?? 0
  // Our confirmed track has display:none while adapted, so its measured width
  // is zero. Its owned layout boundary can validate a replacement main sibling
  // without briefly revealing the already hidden sidebar.
  const confirmedBoundary = track.hasAttribute(marker) && layout?.hasAttribute('data-dsh-chat-layout')
  const boundedContent = layout && content && content !== doc.body && content.isConnected
    && content.parentElement === layout && contentRect && contentRect.width > 0 && contentRect.height > 0
    && contentRect.right <= viewportWidth + 1
    && (confirmedBoundary || (trackRect.left >= -1 && trackRect.left <= 16
      && trackRect.width >= 160 && trackRect.width <= 480 && contentRect.left >= trackRect.right - 16))
  if (!boundedContent) {
    bump('boundary')
    if (recovering) return fallbackNavigation()
    if (isOriginalSnapshot || structureExpired()) return fallback()
    return { ...empty('loading'), diagnostic: baseDiagnostic('loading') }
  }
  doc.documentElement.removeAttribute(missingSidebarMarker)
  doc.documentElement.removeAttribute(expandingMarker)
  doc.querySelectorAll(`[${compactToggleMarker}]`).forEach(button => button.removeAttribute(compactToggleMarker))
  if (recovering) {
    doc.documentElement.removeAttribute(fallbackMarker)
    doc.documentElement.removeAttribute(fallbackErrorMarker)
    // The original site is already visible. Preserve that presentation while
    // layout/preferences settle; never restart the first-paint opacity gate.
    doc.documentElement.setAttribute(presentedMarker, '')
  }
  const viewportHeight = doc.defaultView?.innerHeight ?? 0
  /** Bounded leaf texts of one small row: the account row holds an avatar plus one name. */
  const textLeaves = (root: HTMLElement): { element: HTMLElement; text: string }[] => {
    const found: { element: HTMLElement; text: string }[] = []
    const texts = doc.createTreeWalker(root, 4)
    let node: Node | null
    while ((node = texts.nextNode())) {
      const parent = node.parentElement
      const excluded = parent?.closest('svg,script,style,[hidden],[aria-hidden="true"]')
      if (!parent || parent.childElementCount !== 0 || (excluded && root.contains(excluded))) continue
      const text = (node.textContent ?? '').trim()
      if (text) found.push({ element: parent, text })
    }
    return found
  }
  // The avatar is public presentation: an image, or the site's letter/CSS avatar,
  // which is a short text leaf inside a roughly square box.
  const avatarShape = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8 || rect.width > 80 || rect.height > 80) return false
    return Math.abs(rect.width - rect.height) <= Math.max(rect.width, rect.height) * .5
  }
  // The public trigger is the row's own interactive seat, never a guessed ancestor.
  const triggerOf = (row: HTMLElement): HTMLElement =>
    (row.matches('[aria-haspopup],[role="button"],[tabindex]') ? row : row.querySelector<HTMLElement>('[aria-haspopup],[role="button"],[tabindex]')) ?? row
  const checkProfile = (row: HTMLElement, seed: HTMLElement, geometry: boolean) => {
    if (!row.isConnected || !track.contains(row) || row === sidebar || row === track || row === layout
      || row.contains(newChat) || row.matches('a[href]') || seed.closest('a[href]')
      || row.querySelector('a[href],textarea,input,[contenteditable="true"],[role="menu"],[role="dialog"],.ds-dropdown-menu,.ds-modal-content')) return null
    const images = [...row.querySelectorAll<HTMLElement>('img')]
    const leaves = textLeaves(row)
    const avatar = images.length === 1 ? images[0]
      : images.length === 0 && leaves.some(leaf => leaf.element === seed) && avatarShape(seed) ? seed
        : null
    if (!avatar) return null
    // Exactly one bounded name leaf besides the avatar; never the row's aggregate text.
    const names = leaves.filter(leaf => leaf.element !== avatar && leaf.text.length <= 100 && !/[\r\n]/.test(leaf.text))
    if (names.length !== 1) return null
    if (geometry) {
      const bounds = row.getBoundingClientRect(), avatarBounds = avatar.getBoundingClientRect(), column = track.getBoundingClientRect()
      if (column.width < 160 || column.width > 480 || column.left < -1 || column.left > 16
        || bounds.top < viewportHeight * .75 || bounds.bottom > viewportHeight + 1 || bounds.height < 24 || bounds.height > 100
        || bounds.width < 80 || bounds.width > column.width + 1 || bounds.left < column.left - 1 || bounds.right > column.right + 1
        || avatarBounds.width < 8 || avatarBounds.width > 80 || avatarBounds.height < 8 || avatarBounds.height > 80
        || avatarBounds.left < bounds.left - 1 || avatarBounds.right > bounds.right + 1
        || avatarBounds.top < bounds.top - 1 || avatarBounds.bottom > bounds.bottom + 1) return null
    }
    return { row, avatar, name: names[0].text, trigger: triggerOf(row) }
  }
  type PublicProfile = NonNullable<ReturnType<typeof checkProfile>>
  let identifiedProfile: PublicProfile | null = null
  // Reuse only a row and avatar previously proven in a visible footer. Legacy
  // markers placed on whole columns carry no such proof and are removed.
  for (const candidate of doc.querySelectorAll<HTMLElement>(`[${profileMarker}]`)) {
    const avatar = candidate.querySelector<HTMLElement>(`[${profileAvatarMarker}]`)
    const valid = candidate.getAttribute(profileProofMarker) === 'footer-v1' && avatar ? checkProfile(candidate, avatar, false) : null
    if (!identifiedProfile && valid) identifiedProfile = valid
    else { candidate.removeAttribute(profileMarker); candidate.removeAttribute(profileProofMarker) }
  }
  const findVisibleProfile = (): PublicProfile | null => {
    // Seeds are real images plus the site's letter/CSS avatars (short text leaves).
    // Both stay bounded to the bottom quarter of the confirmed column.
    const seeds: HTMLElement[] = [...track.querySelectorAll<HTMLElement>('img')]
    for (const leaf of textLeaves(track)) if (leaf.text.length <= 2 && !/\s/.test(leaf.text)) seeds.push(leaf.element)
    for (const seed of seeds) {
      if (seed.closest('a[href]')) continue
      const bounds = seed.getBoundingClientRect()
      if (bounds.top < viewportHeight * .75 || bounds.height < 8 || bounds.height > 80 || bounds.width < 8 || bounds.width > 80) continue
      for (let row = seed.parentElement, depth = 0; row && row !== track && depth < 5; row = row.parentElement, depth++) {
        const valid = checkProfile(row, seed, true)
        if (valid) return valid
      }
    }
    return null
  }
  if (!identifiedProfile) identifiedProfile = findVisibleProfile()
  if (!identifiedProfile && confirmedBoundary && trackRect.width === 0 && viewportHeight > 0) {
    // A late avatar can mount after we hid the confirmed column. Measure the
    // site's natural layout invisibly within this synchronous call. Forcing a
    // fixed track changes responsive footer geometry and can reject a real
    // profile forever after reload. Restore the sheet/style before any paint.
    const sheet = (doc.getElementById(styleId) as HTMLStyleElement | null)?.sheet
    if (sheet) {
      const inlineStyle = track.getAttribute('style'), disabled = sheet.disabled
      try {
        track.style.setProperty('visibility', 'hidden', 'important')
        track.style.setProperty('pointer-events', 'none', 'important')
        sheet.disabled = true
        identifiedProfile = findVisibleProfile()
      } finally {
        sheet.disabled = disabled
        if (inlineStyle === null) track.removeAttribute('style')
        else track.setAttribute('style', inlineStyle)
      }
    }
  }
  const profile = identifiedProfile?.row ?? null
  if (identifiedProfile) {
    profile!.setAttribute(profileMarker, '')
    profile!.setAttribute(profileProofMarker, 'footer-v1')
    identifiedProfile.avatar.setAttribute(profileAvatarMarker, '')
  }
  const accountName = identifiedProfile?.name ?? null
  const settingsRoot = doc.documentElement
  const conversations: WebsiteConversation[] = []
  let group = '对话'
  const walker = doc.createTreeWalker(sidebar, 1 | 4, {
    acceptNode(node) {
      if (node instanceof Element && (node.matches('script,style,svg,input') || (node.parentElement?.closest('a[href]')))) return 2
      return 1
    },
  })
  let node: Node | null
  while ((node = walker.nextNode()) && conversations.length < 1000) {
    if (node instanceof HTMLAnchorElement) {
      const href = safeHref(node.getAttribute('href'))
      const title = (node.getAttribute('title') || node.textContent || '').trim().slice(0, 300)
      if (href && title && !conversations.some(item => item.href === href)) conversations.push({ href, title, group })
    } else if (node.nodeType === 3 && groups.test((node.textContent ?? '').trim())) group = (node.textContent ?? '').trim()
  }
  // The avatar/footer proof is the strict signal. The confirmed navigation column
  // with its New Chat control and real conversation links is the structural one:
  // a changed, hidden or background-image avatar must not hide a readable list.
  const navigationProof = identifiedProfile === null && sidebar !== null && newChat !== null && conversations.length > 0
  const authenticated = identifiedProfile !== null || navigationProof ? true : undefined
  bump(identifiedProfile !== null ? 'identified' : 'anonymous')
  // Settings automation keeps its original hard precondition (a verified
  // avatar/footer trigger) and adds a second one: a session the user actually
  // opened by visiting CHAT settings. A background poll may never reopen the
  // site's own account menu or Settings dialog.
  const settingsCommand = command.type === 'settings-read' || command.type === 'settings-close'
    || command.type === 'setting' || command.type === 'preferences' || command.type === 'logout'
  const settingsSession = settingsCommand || doc.documentElement.hasAttribute('data-dsh-chat-settings-session')
  const settings = identifiedProfile !== null && settingsSession ? adaptWebsiteSettings(doc, identifiedProfile.trigger, command) : undefined
  if (command.type === 'open') {
    const target = safeHref(command.href)
    const link = [...sidebar.querySelectorAll<HTMLAnchorElement>('a[href]')].find(item => safeHref(item.getAttribute('href')) === target)
    if (!target || !link) return fallback('open')
    link.click()
  } else if (command.type === 'new') {
    if (!newChat) return empty('unsupported')
    newChat.click()
  } else if (command.type === 'more') {
    doc.getElementById(styleId)?.remove()
    const scrollable = [...sidebar.querySelectorAll<HTMLElement>('*')].find(element => element.scrollHeight > element.clientHeight + 20
      && /auto|scroll/.test(getComputedStyle(element).overflowY))
    scrollable?.scrollTo({ top: scrollable.scrollHeight, behavior: 'instant' })
  }
  if (command.type === 'snapshot' && command.showOriginal) restore()
  else {
    if (trackRect.width >= 160 && trackRect.width <= 480) track.setAttribute(navigationWidthMarker, String(trackRect.width))
    track.setAttribute(marker, '')
    // Keep the inner navigation addressable after the track is hidden.
    sidebar.setAttribute(marker, '')
    if (content && layout) {
      layout.setAttribute('data-dsh-chat-layout', '')
      content.setAttribute('data-dsh-chat-content', '')
      for (const candidate of content.querySelectorAll<HTMLElement>('div,header')) {
        const r = candidate.getBoundingClientRect()
        if (r.top >= -1 && r.top <= 72 && r.height > 0 && r.height <= 80 && r.width <= 400
          && candidate.querySelectorAll(iconButtonSelector).length >= 2 && candidate.querySelectorAll(iconButtonSelector).length <= 3 && candidate.querySelector('svg,img')
          && !candidate.querySelector('textarea,[contenteditable="true"]') && !candidate.textContent?.trim()) candidate.setAttribute('data-dsh-chat-web-chrome', '')
      }
    }
    // Native settings shares this desktop guest; public settings requests must
    // not reveal its sidebar while the content still fills the entire layout.
    // That conflicting geometry prevents subsequent probes from advancing the
    // settings request, including its deadline, and leaves refresh waiting.
    const styleText=`[data-dsh-chat-action-menu]{visibility:hidden!important;pointer-events:none!important}
        [${marker}],[data-dsh-chat-web-chrome]{display:none!important}
        [data-dsh-chat-layout]{grid-template-columns:minmax(0,1fr)!important}
        [data-dsh-chat-content]{margin-left:0!important;min-width:0!important;width:100%!important;max-width:none!important;flex:1 1 0%!important}`
    let style=doc.getElementById(styleId)
    if(!style){style=doc.createElement('style');style.id=styleId;doc.head.append(style)}
    if(style.textContent!==styleText) style.textContent=styleText
    if(authenticated===true && command.type==='snapshot' && !command.showOriginal) collapseWebsiteSidebar(doc,track)

  }
  const selected = conversations.find(item => item.href === safeHref(page.pathname))
  if (!(command.type === 'snapshot' && command.showOriginal)) adaptWebsiteHeader(doc, content, selected?.title ?? null, command.type === 'snapshot' ? command.headerInset ?? (Number.parseInt(settingsRoot.style.getPropertyValue('--dsh-chat-title-inset')) || 24) : Number.parseInt(settingsRoot.style.getPropertyValue('--dsh-chat-title-inset')) || 24)
  // A failed appearance sync must reveal the legitimate website and its own
  // environment/security notices. Keep the error retryable; do not claim an unverified theme.
  if (authenticated === true) {
    if (!settingsRoot.hasAttribute(authSinceMarker)) settingsRoot.setAttribute(authSinceMarker, String(Date.now()))
  } else settingsRoot.removeAttribute(authSinceMarker)
  const authenticatedSince = Number(settingsRoot.getAttribute(authSinceMarker))
  const authenticatedMs = Number.isFinite(authenticatedSince) && authenticatedSince > 0 ? Date.now() - authenticatedSince : 0
  if (settings?.pending) bump('appearance')
  // The theme sync may hold the first paint, but never indefinitely: a settings UI
  // we cannot drive must reveal the real website instead of a permanently blank
  // page. Keep upstream's theme condition and add that time bound.
  const preparingSince = Number(settingsRoot.getAttribute(preparingMarker))
  const preparingMs = Number.isFinite(preparingSince) && preparingSince > 0 ? Date.now() - preparingSince : 0
  const themeSettled = settingsRoot.getAttribute('data-dsh-chat-theme-complete') === (settingsRoot.getAttribute('data-dsh-chat-host-theme') === 'light' ? 'light' : 'dark')
  // Only the account face can drive the theme sync, so the sync can only be
  // pending when a profile was identified. Waiting for it without one is a
  // deadlock: the state would stay 'loading' for as long as the page lives.
  const themeExpected = identifiedProfile !== null
  const ready = authenticated !== true || !themeExpected || themeSettled || Boolean(settings?.error)
    || preparingMs >= FIRST_PAINT_GRACE_MS || (command.type==='snapshot' && command.showOriginal)
  if (ready) {
    settingsRoot.removeAttribute(preparingMarker)
    if (!(command.type === 'snapshot' && command.showOriginal)) settingsRoot.setAttribute(presentedMarker, '')
  }
  const diagnostic: WebsiteDiagnostic = {
    ...baseDiagnostic(ready ? 'ready' : 'loading'),
    authenticated,
    profile: identifiedProfile !== null,
    proof: identifiedProfile !== null ? 'avatar' : navigationProof ? 'navigation' : 'none',
    conversations: conversations.length,
    authenticatedMs,
  }
  return { status: ready ? 'ready' : 'loading', ...(authenticated === undefined ? {} : { authenticated }), conversations, selectedHref: safeHref(page.pathname), canCreate: newChat !== null, error: doc.documentElement.getAttribute('data-dsh-chat-conversation-error'), accountName, settings, diagnostic }
}

export function websiteCommandScript(command: WebsiteCommand, contentFontSize = 14, colorScheme: 'light' | 'dark' = 'dark'): string {
  const shareCopy = `(${configureWebsiteShareCopy.toString()})(document,${command.type !== 'restore' && !(command.type === 'snapshot' && command.showOriginal)});`
  const typography = `(${applyWebsiteTypography.toString()})(document,${command.type === 'restore' || (command.type === 'snapshot' && command.showOriginal) ? 'null' : JSON.stringify(Number.isFinite(contentFontSize) ? contentFontSize : 14)});`
  const theme = command.type === 'restore' || (command.type === 'snapshot' && command.showOriginal)
    ? "document.documentElement.removeAttribute('data-dsh-chat-host-theme');"
    : `document.documentElement.setAttribute('data-dsh-chat-host-theme',${JSON.stringify(colorScheme === 'light' ? 'light' : 'dark')});`
  if (command.type==='refresh') throw new Error('Website refresh must be handled by the guest owner')
  if (command.type === 'conversation-action') return `(async () => { ${shareCopy} ${typography} ${theme} const collapseWebsiteSidebar = ${collapseWebsiteSidebar.toString()}; const adaptWebsiteSettings = ${adaptWebsiteSettings.toString()}; const adaptWebsiteHeader = ${adaptWebsiteHeader.toString()}; const dismissWebsiteEnvironmentNotice = ${dismissWebsiteEnvironmentNotice.toString()}; const adapt = ${adaptWebsiteNavigation.toString()}; const command = ${JSON.stringify(command)}; const before = adapt(document,location,{type:'snapshot',showOriginal:false}); if (before.authenticated !== true || !before.conversations.some(item=>item.href===command.href)) return before; const error = await (${performWebsiteConversationAction.toString()})(document,command); if(error) document.documentElement.setAttribute('data-dsh-chat-conversation-error',error); else document.documentElement.removeAttribute('data-dsh-chat-conversation-error'); return adapt(document,location,{type:'snapshot',showOriginal:false}); })()`
  return `(() => { ${shareCopy} ${typography} ${theme} const collapseWebsiteSidebar = ${collapseWebsiteSidebar.toString()}; const adaptWebsiteSettings = ${adaptWebsiteSettings.toString()}; const adaptWebsiteHeader = ${adaptWebsiteHeader.toString()}; const dismissWebsiteEnvironmentNotice = ${dismissWebsiteEnvironmentNotice.toString()}; return (${adaptWebsiteNavigation.toString()})(document,location,${JSON.stringify(command)}); })()`
}

/** Treat the guest response as untrusted; keep only bounded, origin-scoped list data. */
export function parseWebsiteNavigation(value: unknown): WebsiteNavigation {
  if (!value || typeof value !== 'object') throw new Error('Invalid navigation response')
  const source = value as WebsiteNavigation
  if (!['loading', 'ready', 'sign-in', 'unsupported'].includes(source.status) || !Array.isArray(source.conversations)) throw new Error('Invalid navigation response')
  const validHref = (href: unknown): href is string => typeof href === 'string' && /^https:\/\/chat\.deepseek\.com\/a\/chat\/s\/[a-zA-Z0-9-]+$/.test(href)
  const conversations = source.conversations.slice(0, 1000).filter(item => item && validHref(item.href) && typeof item.title === 'string' && typeof item.group === 'string')
    .map(item => ({ href: item.href, title: item.title.slice(0, 300), group: item.group.slice(0, 80) }))
  const authenticated = source.status === 'sign-in' ? false : source.authenticated === true ? true
    : source.authenticated === false ? false : undefined
  // The guest payload is untrusted: keep counts, enums and booleans only.
  const flag = (value: unknown): boolean => value === true
  const label = (value: unknown): string | null => typeof value === 'string' && /^[a-z0-9:._-]{1,40}$/i.test(value) ? value : null
  const span = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 86_400_000) : 0
  const raw = source.diagnostic as Partial<WebsiteDiagnostic> | undefined
  const diagnostic: WebsiteDiagnostic | undefined = raw && typeof raw === 'object'
    ? {
      status: ['loading', 'ready', 'sign-in', 'unsupported'].includes(raw.status as string) ? raw.status as WebsiteNavigation['status'] : 'loading',
      authenticated: raw.authenticated === true ? true : raw.authenticated === false ? false : undefined,
      profile: flag(raw.profile), sidebar: flag(raw.sidebar), newChat: flag(raw.newChat), conversations: span(raw.conversations),
      appearanceRequest: label(raw.appearanceRequest), appearancePhase: label(raw.appearancePhase),
      appearanceRemainingMs: span(raw.appearanceRemainingMs),
      appearanceDark: flag(raw.appearanceDark), appearanceError: flag(raw.appearanceError), appearanceRestored: flag(raw.appearanceRestored),
      proof: raw.proof === 'avatar' || raw.proof === 'navigation' ? raw.proof : 'none',
      trackImages: span(raw.trackImages),
      fallback: flag(raw.fallback), missingSidebarMs: span(raw.missingSidebarMs), authenticatedMs: span(raw.authenticatedMs),
      polls: span(raw.polls), boundaryFailures: span(raw.boundaryFailures), identifiedPolls: span(raw.identifiedPolls),
      anonymousPolls: span(raw.anonymousPolls), appearanceBlocks: span(raw.appearanceBlocks), fallbacks: span(raw.fallbacks),
      documents: span(raw.documents),
      // Structural reason only: strip anything that could carry page text.
      failure: typeof raw.failure === 'string' && raw.failure.length > 0 ? raw.failure.slice(0, 160) : null,
    }
    : undefined
  return { status: source.status, ...(authenticated === undefined ? {} : { authenticated }), conversations: authenticated === true ? conversations : [], selectedHref: validHref(source.selectedHref) ? source.selectedHref : null, ...(diagnostic === undefined ? {} : { diagnostic }),
    accountName: authenticated === true && typeof source.accountName === 'string' ? source.accountName.slice(0,100) : null,
    settings: source.settings ? {language:typeof source.settings.language === 'string' ? source.settings.language.slice(0,80) : null,theme:typeof source.settings.theme === 'string' ? source.settings.theme.slice(0,80) : null,error:typeof source.settings.error === 'string' ? source.settings.error.slice(0,200) : null,pending:source.settings.pending===true,restored:source.settings.restored===true} : undefined,
    canCreate: authenticated === true && source.canCreate === true, error: typeof source.error === 'string' ? source.error.slice(0, 300) : null }
}
