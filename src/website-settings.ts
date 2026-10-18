import type { WebsiteCommand } from './website-navigation.js'

/** One document may begin only this many settings runs before it stops trying. */
const MAX_SETTINGS_ATTEMPTS = 6

/** Public account menu and General controls only; no site APIs or storage. */
export function adaptWebsiteSettings(doc: Document, trigger: HTMLElement | null, command: WebsiteCommand) {
  const root = doc.documentElement
  const attr = (name: string) => `data-dsh-chat-settings-${name}`
  const desiredTheme = root.getAttribute('data-dsh-chat-host-theme') === 'light' ? 'light' : 'dark'
  const complete = 'data-dsh-chat-theme-complete'
  // Migrate the old fixed-dark marker; each completion now names the verified scheme.
  root.removeAttribute('data-dsh-chat-dark-complete')
  if (root.getAttribute(attr('theme-target')) !== desiredTheme) {
    root.setAttribute(attr('theme-target'), desiredTheme)
    root.removeAttribute(complete); root.removeAttribute(attr('restored'))
    if (root.getAttribute(attr('request'))?.startsWith('theme:')) {
      root.removeAttribute(attr('request')); root.removeAttribute(attr('phase')); root.removeAttribute(attr('deadline'))
    }
    if (root.getAttribute(attr('error-goal'))?.startsWith('theme:')) {
      root.removeAttribute(attr('error')); root.removeAttribute(attr('error-goal'))
    }
  }
  // Remove the discarded embedded-settings presentation on an existing guest.
  root.removeAttribute(attr('view'))
  doc.getElementById('dsh-chat-settings-view-style')?.remove()
  doc.querySelectorAll('[data-dsh-chat-settings-host],[data-dsh-chat-settings-tabs],[data-dsh-chat-settings-pane],[data-dsh-chat-settings-layout],[data-dsh-chat-settings-chrome],[data-dsh-chat-settings-appearance]').forEach(el => {
    for (const a of [...el.attributes]) if (/^data-dsh-chat-settings-(host|tabs|pane|layout|chrome|appearance)$/.test(a.name)) el.removeAttribute(a.name)
  })
  const exact = (parent: Element, re: RegExp) => {
    const selectors = 'button,[role="menuitem"],[role="option"],[role="button"],label,.ds-button,.ds-dropdown-menu-option,.ds-select-option,.ds-dropdown-menu div,.ds-dropdown-menu span,.ds-select-dropdown div'
    const semantic = [...parent.querySelectorAll<HTMLElement>(selectors)].find(el => re.test(el.textContent?.trim() ?? '') || re.test(el.getAttribute('aria-label') ?? ''))
    if (semantic) return semantic
    if (!parent.closest('[role="dialog"],.ds-modal-content')) return undefined
    return [...parent.querySelectorAll<HTMLElement>('div,span')].find(el => re.test(el.textContent?.trim() ?? '') && !el.querySelector('input,textarea,[contenteditable="true"]'))
  }
  const general = /^(General|通用设置|常规|通用)$/i
  const isModal = (el: HTMLElement) => !el.closest('[hidden],[aria-hidden="true"]')
    && /Settings|系统设置|设置/i.test(el.textContent ?? '') && !!exact(el, general)
    && !el.querySelector('textarea,[contenteditable="true"]')
  const dialog = [...doc.querySelectorAll<HTMLElement>('[role="dialog"],.ds-modal-content')].find(isModal)
  const closeDialog = () => dialog && [...dialog.querySelectorAll<HTMLElement>('button,[role="button"],.ds-icon-button')].find(el => !el.textContent?.trim() && el.querySelector('svg'))?.click()
  // The caller hands us the exact row element it verified as the public account
  // trigger, so opening the menu never guesses an ancestor or a random image.
  const openProfileMenu = () => { trigger?.click() }
  // A settings session exists only because the user opened CHAT settings and it
  // asked the guest to read or change the site's own public controls. The mark is
  // what lets the multi-poll state machine continue; nothing else may start one.
  const sessionMarker = 'data-dsh-chat-settings-session'
  const attemptsMarker = 'data-dsh-chat-settings-attempts'
  const explicit = command.type === 'settings-read' || command.type === 'setting'
    || command.type === 'preferences' || command.type === 'logout'
  if (explicit) root.setAttribute(sessionMarker, '')
  const request = (goal: string) => {
    // This state machine clicks the site's own account menu and Settings dialog.
    // A target that never answers must stop after a few bounded runs instead of
    // reopening that UI forever.
    const used = Number(root.getAttribute(attemptsMarker))
    const attempts = Number.isFinite(used) && used > 0 ? used : 0
    if (attempts >= MAX_SETTINGS_ATTEMPTS) {
      root.setAttribute(attr('error'), '官网设置多次未响应，已停止自动同步；可点「显示官网原界面」手动修改后收起。')
      return
    }
    root.setAttribute(attemptsMarker, String(attempts + 1))
    root.setAttribute(sessionMarker, '')
    root.setAttribute(attr('request'), goal); root.removeAttribute(attr('phase')); root.removeAttribute(attr('error')); root.removeAttribute(attr('error-goal'))
    root.setAttribute(attr('deadline'), String(Date.now() + 12000))
  }
  const loggingOut=root.getAttribute(attr('request'))==='logout'
  if (command.type === 'settings-close' && !loggingOut) {closeDialog(); root.removeAttribute(sessionMarker);root.removeAttribute(attemptsMarker); root.removeAttribute(attr('request'));root.removeAttribute(attr('phase'));root.removeAttribute(attr('deadline'));root.removeAttribute(attr('error'))}
  if (command.type === 'settings-read' && !root.hasAttribute(attr('request'))) request('read')
  if (command.type === 'setting' && !loggingOut) request(`${command.key}:${command.value}`)
  if (command.type === 'preferences' && !loggingOut) {
    root.removeAttribute(attr('restored'))
    root.removeAttribute(complete)
    if (command.language) root.setAttribute(attr('restore-language'), command.language)
  }
  if (command.type === 'logout') {root.removeAttribute(attr('restore-language'));root.removeAttribute(attr('restored'));request('logout')}
  const rowFor = (re: RegExp) => {
    if (!dialog) return undefined
    const walker = doc.createTreeWalker(dialog, 4); let node: Node | null
    while ((node = walker.nextNode())) {
      if (!re.test(node.textContent?.trim() ?? '')) continue
      const label = node.parentElement
      for (let row = label, i = 0; row && row !== dialog && i < 5; row = row.parentElement, i++) {
        if (row.querySelector('button,[role="combobox"],.ds-select,.ds-button,[tabindex]') || (row.querySelector('svg') && (row.textContent?.trim().length ?? 0) > (label?.textContent?.trim().length ?? 0))) return row
      }
    }
  }
  const languageRow = rowFor(/^(Language|System language|语言|系统语言)$/i)
  const control = languageRow?.querySelector<HTMLElement>('[role="combobox"],.ds-select')
    ?? languageRow?.querySelector<HTMLElement>('.ds-button,[tabindex],button')
    ?? (languageRow ? [...languageRow.children].find(el => el.querySelector('svg')) as HTMLElement | undefined : undefined)
  const language = control?.textContent?.trim().slice(0, 80) || null
  const themeRow = rowFor(/^(Theme|Appearance|主题|外观)$/i)
  const themeButtons = themeRow ? [...themeRow.querySelectorAll<HTMLElement>('button,[role="button"],.ds-button')].filter(el => /^(Light|Dark|System|浅色|浅色模式|深色|深色模式|跟随系统|系统)$/i.test(el.textContent?.trim() ?? '')) : []
  const selectedTheme = themeButtons.find(el => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-state') === 'active')
    ?? (themeButtons.length === 3 ? themeButtons.find(el => themeButtons.filter(other => getComputedStyle(other).backgroundColor === getComputedStyle(el).backgroundColor).length === 1) : undefined)
  const theme = selectedTheme?.textContent?.trim().slice(0, 80) || null
  if (language) root.setAttribute('data-dsh-chat-language', language)
  if (theme) root.setAttribute('data-dsh-chat-theme', theme)
  const desiredThemeLabel = desiredTheme === 'light' ? /^(Light|浅色|浅色模式)$/i : /^(Dark|深色|深色模式)$/i
  if (theme && !desiredThemeLabel.test(theme)) root.removeAttribute(complete)
  // Continue an open settings session only. This chain used to run on every
  // background poll, which reopened the site's account menu and Settings dialog
  // forever and made the CHAT page flash; it is now confined to a session the
  // user opened, and bounded by MAX_SETTINGS_ATTEMPTS.
  if (root.hasAttribute(sessionMarker) && !root.hasAttribute(attr('request')) && !root.hasAttribute(attr('error')) && command.type !== 'settings-close') {
    if (root.getAttribute(complete) !== desiredTheme) request(`theme:${desiredTheme}`)
    else if (root.hasAttribute(attr('restore-language'))) request(`language:${root.getAttribute(attr('restore-language'))}`)
  }
  const goal = root.getAttribute(attr('request')), phase = root.getAttribute(attr('phase'))
  const finish = (error?: string) => {
    root.removeAttribute(attr('request'));root.removeAttribute(attr('phase'));root.removeAttribute(attr('deadline'))
    if (error) { root.setAttribute(attr('error'), error); root.setAttribute(attr('error-goal'), goal ?? '') }
    if (goal?.startsWith('theme:') && !error) root.setAttribute(complete, goal.slice(6))
    if (goal?.startsWith('language:')) {
      root.removeAttribute(attr('restore-language'))
      // Language changes can remount the appearance controls; recheck the current host scheme.
      root.removeAttribute(complete)
    }
    if (goal !== 'logout') closeDialog()
  }
  if (goal) {
    if (Date.now() > Number(root.getAttribute(attr('deadline')))) finish('官网设置暂未响应，请重试。')
    else if (goal === 'logout') {
      // The exact current-session item, never the all-device settings action.
      const logout = [...doc.querySelectorAll('[role="menu"],.ds-dropdown-menu')].map(menu => exact(menu, /^(Log out|Logout|退出登录|登出)$/i)).find(Boolean)
      if (logout && phase!=='logout-clicked') {root.setAttribute(attr('phase'),'logout-clicked');logout.click()}
      else if (!phase) {closeDialog();root.setAttribute(attr('phase'), 'menu');openProfileMenu()}
    } else if (!dialog) {
      // Wait for the site's pending open/selection commit, bounded by the deadline.
      if (phase !== 'opening' && phase !== 'verify') {
        const settings = exact(doc.body, /^(Settings|设置|系统设置)$/i)
        if (settings) {root.setAttribute(attr('phase'), 'opening');settings.click()}
        else if (!phase) {root.setAttribute(attr('phase'), 'menu');openProfileMenu()}
      }
    } else if (!languageRow) {
      if (phase !== 'general' && phase !== 'verify') {root.setAttribute(attr('phase'), 'general');exact(dialog, general)?.click()}
    } else if (goal === 'read') {
      if (language) finish()
    } else {
      const split = goal.indexOf(':'), key = goal.slice(0, split), value = goal.slice(split + 1)
      const values: Record<string, RegExp> = {'zh-CN':/^(简体中文|中文|Chinese|中文（简体）|Chinese \(Simplified\))$/i,en:/^(English|英语)$/i,light:/^(Light|浅色|浅色模式)$/i,dark:/^(Dark|深色|深色模式)$/i,system:/^(System|跟随系统|系统|Follow system)$/i}
      const regex = values[value], current = key === 'language' ? language : theme
      if (regex && current && regex.test(current)) finish()
      // After one option click, only observe the visible value or fixed timeout.
      else if (key === 'theme' && phase !== 'verify') {const option = themeButtons.find(el => regex?.test(el.textContent?.trim() ?? ''));if (option) {root.setAttribute(attr('phase'), 'verify');option.click()}}
      else if (regex && control && phase !== 'verify') {
        // Preserve the previously verified global public-option lookup: the site's
        // language options can be portalled outside its settings modal.
        const option = [...doc.querySelectorAll<HTMLElement>('[role="option"],.ds-select-option,.ds-dropdown-menu-option,.ds-dropdown-menu div,.ds-dropdown-menu span,.ds-select-dropdown div,label,button,[role="button"],.ds-button')].find(el => regex.test(el.textContent?.trim() ?? '') && el !== control && !control.contains(el) && !themeButtons.includes(el))
        if (option) {root.setAttribute(attr('phase'), 'verify');option.click()}
        else if (phase !== 'options' && phase !== 'verify') {
          let trigger = control;const walker = doc.createTreeWalker(control,4);let node:Node|null
          while ((node=walker.nextNode())) if(node.textContent?.trim()===current){trigger=node.parentElement ?? control;break}
          if (phase==='pointer') {root.setAttribute(attr('phase'), 'options');trigger.click()}
          else {root.setAttribute(attr('phase'), 'pointer');trigger.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'mouse',button:0,isPrimary:true}));trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}))}
        }
      }
    }
  }
  if (root.getAttribute(complete) === desiredTheme && !root.hasAttribute(attr('restore-language'))) root.setAttribute(attr('restored'),'')
  return {language:root.getAttribute('data-dsh-chat-language'),theme:root.getAttribute('data-dsh-chat-theme'),error:root.getAttribute(attr('error')),pending:root.hasAttribute(attr('request')),restored:root.hasAttribute(attr('restored'))}
}
