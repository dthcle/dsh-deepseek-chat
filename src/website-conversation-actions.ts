import type { WebsiteCommand } from './website-navigation.js'

/** Drive only a verified row's public website menu. Dialogs stay owned by the site. */
export async function performWebsiteConversationAction(doc: Document, command: Extract<WebsiteCommand, {type: 'conversation-action'}>): Promise<string | null> {
  const error = '暂时无法执行该对话操作，请刷新列表后重试。'
  const labels = {rename: /^(重命名|Rename)$/i, pin: /^(置顶|Pin)$/i, unpin: /^(取消置顶|Unpin)$/i, share: /^(分享|Share)$/i, delete: /^(删除|Delete)$/i}
  if(command.action==='rename' && (typeof command.title!=='string' || !command.title.trim() || command.title.trim().length>300)) return error
  const sidebar = doc.querySelector('[data-dsh-chat-navigation]')
  const profile = doc.querySelector('[data-dsh-chat-profile-confirmed="footer-v1"]')
  if (!sidebar || !profile || doc.defaultView?.location.origin !== 'https://chat.deepseek.com'
    || !/^https:\/\/chat\.deepseek\.com\/a\/chat\/s\/[a-zA-Z0-9-]+$/.test(command.href) || !labels[command.action]) return error
  /**
   * Finish the site's own two-step deletion. Declared here on purpose: this
   * function is serialized into the guest with Function.prototype.toString, so a
   * module-level helper would be undefined there and abort the whole command.
   *
   * The menu item only opens a confirmation dialog, and that dialog's confirm
   * button repeats the same label, so it is found by its dialog container rather
   * than by text alone. Success is reported only once the site's own list no
   * longer contains the conversation.
   */
  const confirmDeletion = async (href: string): Promise<string | null> => {
    const dialogSelector = '[role="dialog"],[aria-modal="true"],.ds-modal-content'
    const titlePattern = /^(永久删除对话|删除该对话|Delete chat\??|Delete chat)$/i
    const confirmPattern = /^(删除|Delete)$/i
    const cancelPattern = /^(取消|Cancel)$/i
    const deadline = Date.now() + 5000
    let clicked = false
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50))
      if (!profile.isConnected || !profile.hasAttribute('data-dsh-chat-profile-confirmed')
        || doc.defaultView?.location.origin !== 'https://chat.deepseek.com'
        || doc.defaultView.location.pathname !== originalPath) return error
      const present = [...sidebar.querySelectorAll<HTMLAnchorElement>('a[href]')].some(el => el.href === href)
      if (!present) return null
      if (clicked) continue
      const dialogs = [...doc.querySelectorAll<HTMLElement>(dialogSelector)]
        .filter(el => !el.querySelector(dialogSelector))
        .filter(el => el.getBoundingClientRect().height > 0)
        .filter(el => titlePattern.test((el.querySelector<HTMLElement>('.ds-modal-content__title')?.textContent ?? '').trim())
          || /永久删除对话|Delete chat\?/i.test(el.textContent ?? ''))
      if (dialogs.length !== 1) continue
      const dialog = dialogs[0]!
      const confirms = [...dialog.querySelectorAll<HTMLElement>('button,[role="button"],.ds-button')]
        .filter(el => !el.matches(':disabled,[aria-disabled="true"]'))
        .filter(el => confirmPattern.test(el.textContent?.trim() ?? '') && !cancelPattern.test(el.textContent?.trim() ?? ''))
      const unique = [...new Set(confirms)].filter(el => !confirms.some(other => other !== el && el.contains(other)))
      if (unique.length !== 1) return '官网删除确认框结构已变化，请在网页中手动删除。'
      unique[0]!.click()
      clicked = true
    }
    return clicked ? '官网未确认删除结果，请刷新列表后重试。' : '官网未弹出删除确认框，请刷新列表后重试。'
  }
  if (doc.querySelector('[role="dialog"],.ds-modal-content')) return '请先关闭官网当前弹窗，再操作对话。'
  const links = [...sidebar.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(el => el.href === command.href)
  if (links.length !== 1) return error
  const link = links[0]!
  let row: Element = link
  // Some website versions put the trigger beside the anchor, others inside it.
  for (let depth = 0; depth < 2 && !row.querySelector('button,[role="button"],.ds-icon-button,.ds-dropdown-trigger'); depth++) {
    const parent = row.parentElement
    if (!parent || !sidebar.contains(parent) || parent.querySelectorAll('a[href]').length !== 1) break
    row = parent
  }
  const controls = [...row.querySelectorAll<HTMLElement>('button,[role="button"],.ds-icon-button,.ds-dropdown-trigger')]
    .filter(el => !el.matches(':disabled,[aria-disabled="true"]') && !el.querySelector('a[href]'))
  const labelled = controls.filter(el => /^(更多|更多操作|More|More options|Conversation options)$/i.test(el.getAttribute('aria-label') || el.getAttribute('title') || ''))
  const candidates = labelled.length ? labelled : controls.filter(el => !el.textContent?.trim() && el.querySelector('svg'))
  // Nested dropdown wrappers must never cause two clicks.
  const triggers = candidates.filter(el => !candidates.some(other => other !== el && el.contains(other)))
  if (triggers.length !== 1) return error
  const menuSelector = '[role="menu"],.ds-dropdown-menu'
  const existing = new Set(doc.querySelectorAll(menuSelector))
  if ([...existing].some(el => el.getBoundingClientRect().height > 0)) return '请先关闭官网当前菜单，再操作对话。'
  const originalTitle = (link.getAttribute('title') || link.textContent || '').trim()
  const editorHost = row.parentElement && row.parentElement !== sidebar && sidebar.contains(row.parentElement)
    && row.parentElement.querySelectorAll('a[href]').length === 1 ? row.parentElement : row
  const originalPath = doc.defaultView.location.pathname
  // The real sidebar is hidden in CHAT. Its portalled menu otherwise anchors
  // against a zero rect and flashes at the viewport top while we await it.
  // Mark only newly opened conversation menus before paint; visibility retains
  // their measurements and public click handlers, unlike display:none.
  const hideActionMenu = () => {
    for (const menu of doc.querySelectorAll<HTMLElement>(menuSelector)) {
      if (existing.has(menu) || ![...menu.querySelectorAll<HTMLElement>('[role="menuitem"],.ds-dropdown-menu-option,button,[role="button"]')]
        .some(el => labels[command.action].test(el.textContent?.trim() || ''))) continue
      menu.setAttribute('data-dsh-chat-action-menu', '')
    }
  }
  const observer = new MutationObserver(hideActionMenu)
  observer.observe(doc.body, {childList: true, subtree: true, characterData: true})
  try {
    triggers[0]!.click()
    hideActionMenu()
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50))
      if (!link.isConnected || !profile.isConnected || !profile.hasAttribute('data-dsh-chat-profile-confirmed')
        || doc.defaultView?.location.origin !== 'https://chat.deepseek.com' || doc.defaultView.location.pathname !== originalPath) return error
      const menus = [...doc.querySelectorAll<HTMLElement>(menuSelector)].filter(el => !existing.has(el) && el.getBoundingClientRect().height > 0)
      const matches = menus.flatMap(menu => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"],.ds-dropdown-menu-option,button,[role="button"]')])
        .filter(el => labels[command.action].test(el.textContent?.trim() || '') && !el.matches(':disabled,[aria-disabled="true"]'))
      const unique = [...new Set(matches)].filter(el => !matches.some(other => other !== el && el.contains(other)))
      if (unique.length === 1) {
        unique[0]!.click()
        // Deleting is two steps on this site: the menu item opens a confirmation
        // dialog ("永久删除对话" / "Delete chat?") whose confirm button carries the
        // same "删除"/"Delete" label. Returning here would report success while the
        // conversation stayed in place.
        if (command.action === 'delete') return await confirmDeletion(command.href)
        if(command.action!=='rename') return null
        const renameDeadline=Date.now()+3000
        let submitted=false
        while(Date.now()<renameDeadline) {
          await new Promise(resolve=>setTimeout(resolve,50))
          if(!profile.isConnected || doc.defaultView?.location.pathname!==originalPath) return error
          if(submitted) {
            const current=[...sidebar.querySelectorAll<HTMLAnchorElement>('a[href]')].find(el=>el.href===command.href)
            if((current?.getAttribute('title') || current?.textContent || '').trim()===command.title!.trim()) return null
            continue
          }
          // The website also renames inside its sidebar. We intentionally hide
          // that sidebar, so screen visibility cannot identify its editor. Prefer
          // the captured row; after React replaces it, require the exact previous
          // title and a unique editor in this already authenticated navigation.
          const inputs = [...sidebar.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])')]
            .filter(input => !input.disabled && input.type === 'text'
              && !/搜索|search/i.test([input.getAttribute('aria-label'), input.getAttribute('placeholder'), input.getAttribute('title')].join(' '))
              && !input.closest('[role="dialog"],.ds-modal-content'))
          const rowInputs = inputs.filter(input => editorHost.contains(input))
          const inline = rowInputs.length ? rowInputs : inputs.filter(input => input.value.trim() === originalTitle)
          if (inline.length === 1) {
            const input = inline[0]!
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            if (!setter) return error
            input.focus()
            setter.call(input, command.title!.trim())
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise(resolve => setTimeout(resolve, 50))
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
            submitted = true
            continue
          }
          const dialogs=[...doc.querySelectorAll<HTMLElement>('[role="dialog"],.ds-modal-content')]
            .filter(el=>/重命名|Rename/i.test(el.textContent || '') && el.querySelectorAll('input:not([type="hidden"])').length===1)
            .filter(el=>!el.querySelector('[role="dialog"],.ds-modal-content'))
          if(dialogs.length!==1) continue
          const dialog=dialogs[0]!
          const input=dialog.querySelector<HTMLInputElement>('input:not([type="hidden"])')!
          if(!['text',''].includes(input.type) || input.disabled) return error
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set
          if(!setter) return error
          setter.call(input,command.title!.trim())
          input.dispatchEvent(new Event('input',{bubbles:true}))
          input.dispatchEvent(new Event('change',{bubbles:true}))
          await new Promise(resolve=>setTimeout(resolve,50))
          const confirms=[...dialog.querySelectorAll<HTMLElement>('button,[role="button"],.ds-button')]
            .filter(el=>/^(确定|确认|保存|重命名|Confirm|Save|Rename)$/i.test(el.textContent?.trim() || '') && !el.matches(':disabled,[aria-disabled="true"]'))
          if(confirms.length!==1) return error
          confirms[0]!.click();submitted=true
        }
        return '官网未确认重命名结果，请刷新列表后重试。'
      }
    }
    // Close only the menu opened by this request; never dismiss a confirmation dialog.
    if (!doc.querySelector('[role="dialog"],.ds-modal-content')) triggers[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
    return error
  } finally {
    observer.disconnect()
    // Keep the marker on an exiting menu until the website removes its node;
    // restoring visibility here would expose its close animation at the top.
  }
}
