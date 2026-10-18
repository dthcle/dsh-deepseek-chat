export type Mode = 'harness' | 'chat'

export interface ModeAuthorization {
  status: 'pending' | 'authorized' | 'unauthorized' | 'unavailable'
  accountId: string | null
  epoch: string
  error: string | null
}

export interface ModeState {
  mode: Mode
  authorization: ModeAuthorization
  compatibilityEnabled: boolean
  error: string | null
}

/** Only public navigation and effect-scoped UI registration cross this boundary. */
export interface NavigationPort {
  readPanel(): string | null
  selectPanel(panel: string | null): void
  /** Optional: confirm (and if needed re-register) the CHAT main panel key. */
  ensureChatPanel?(): boolean
  mountChatNavigation(): () => void
  cancelAccount(accountId: string): void
}

export const CHAT_PANEL = 'dsh-deepseek-chat.chat'

/** A short, credential-free timeline of mode transitions for the CHAT settings page. */
export interface ModeTraceEntry {
  readonly at: number
  readonly event: string
  readonly detail: string
}

const TRACE_LIMIT = 24

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Every entry checks desktop compatibility; website sign-in happens inside CHAT. */
export class ModeController {
  private state: ModeState
  private readonly listeners = new Set<() => void>()
  private originalPanel: string | null = null
  private unmountChat: (() => void) | null = null
  private transitioning = false
  private disposed = false
  private lastPanel: string | null
  private readonly traceLog: ModeTraceEntry[] = []

  constructor(private readonly port: NavigationPort, compatibilityEnabled: boolean) {
    this.lastPanel = port.readPanel()
    this.state = {
      mode: 'harness', compatibilityEnabled, error: null,
      authorization: { status: 'pending', accountId: null, epoch: '', error: null },
    }
  }

  getSnapshot = (): ModeState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  /** Newest last; bounded so the settings page never grows with a session. */
  trace = (): readonly ModeTraceEntry[] => this.traceLog
  private note(event: string, detail = ''): void {
    this.traceLog.push({ at: Date.now(), event, detail: detail.slice(0, 200) })
    if (this.traceLog.length > TRACE_LIMIT) this.traceLog.splice(0, this.traceLog.length - TRACE_LIMIT)
  }

  canEnter(): boolean {
    return !this.disposed && this.state.compatibilityEnabled
  }

  updateAuthorization(authorization: ModeAuthorization): void {
    if (this.disposed) return
    const prior = this.state.authorization
    const continuous = authorization.status === 'authorized'
      && prior.status === 'authorized'
      && authorization.accountId === prior.accountId
      && authorization.epoch === prior.epoch
    // A replaced Host generation invalidates its work, without leaving the selected mode.
    if (!continuous && prior.accountId) this.port.cancelAccount(prior.accountId)
    this.state = { ...this.state, authorization }
    this.publish()
  }

  select(mode: Mode): boolean {
    if (this.disposed) return false
    if (mode === 'harness') {
      this.leave(true)
      return true
    }
    if (!this.canEnter()) {
      this.note('select.blocked', 'desktop browser capability unavailable')
      return false
    }
    if (this.state.mode === 'chat') return true
    return this.enter(this.port.readPanel())
  }

  private enter(originalPanel: string | null): boolean {
    this.originalPanel = originalPanel === CHAT_PANEL ? null : originalPanel
    this.transitioning = true
    try {
      const registered = this.port.ensureChatPanel?.()
      this.note('enter.precheck', registered === undefined ? 'unavailable' : registered ? 'panel registered' : 'panel missing')
      this.unmountChat = this.port.mountChatNavigation()
      this.state = { ...this.state, mode: 'chat', error: null }
      this.port.selectPanel(CHAT_PANEL)
      if (this.port.readPanel() !== CHAT_PANEL) {
        // The layout may reject or immediately reset an id it does not know.
        this.note('enter.reselect', 'layout did not keep ' + CHAT_PANEL)
        this.port.selectPanel(CHAT_PANEL)
      }
      this.note('enter.select', 'active=' + String(this.port.readPanel()))
      this.publish()
      return true
    } catch (error) {
      this.note('enter.fail', reason(error))
      this.cleanupNavigation()
      this.state = { ...this.state, mode: 'harness', error: 'CHAT 界面加载失败，已恢复 Harness。' }
      try { this.port.selectPanel(this.originalPanel) } catch { /* Original panel may have unloaded. */ }
      this.publish()
      return false
    } finally {
      this.transitioning = false
    }
  }

  /** The original DSH navigation remains authoritative; never overwrite its state. */
  observePanel(panel: string | null): void {
    const previous = this.lastPanel
    this.lastPanel = panel
    if (this.disposed || this.transitioning) return
    if (panel === CHAT_PANEL && this.state.mode !== 'chat') {
      this.note('observe.adopt', 'previous=' + String(previous))
      // Selecting the registered main key directly keeps the same compatibility check.
      if (!this.canEnter() || !this.enter(previous)) {
        this.transitioning = true
        try { this.port.selectPanel(previous === CHAT_PANEL ? null : previous) } finally { this.transitioning = false }
      }
    } else if (panel !== CHAT_PANEL && this.state.mode === 'chat') {
      // DSH navigation stays authoritative: any other panel (including null) is
      // the user's own destination, so follow it back to Harness.
      this.note('observe.leave', 'panel=' + String(panel))
      this.leave(false)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.leave(true)
    this.disposed = true
    if (this.state.authorization.accountId) this.port.cancelAccount(this.state.authorization.accountId)
    this.listeners.clear()
  }

  private leave(restore: boolean): void {
    if (this.state.mode !== 'chat') return
    this.transitioning = true
    this.state = { ...this.state, mode: 'harness' }
    // Recover the original panel while our own panel still exists. Do not
    // rewrite rightbar visibility/width/tab/fullscreen or a Harness Session.
    try {
      if (restore) this.port.selectPanel(this.originalPanel)
    } catch {
      this.state = { ...this.state, error: '原面板已被移除，已返回 Harness 对话区。' }
      this.port.selectPanel(null)
    } finally {
      this.cleanupNavigation()
      this.transitioning = false
      this.publish()
    }
  }

  private cleanupNavigation(): void {
    const cleanup = this.unmountChat
    this.unmountChat = null
    cleanup?.()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
