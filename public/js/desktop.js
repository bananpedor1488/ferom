/**
 * Ferom — desktop layout (Telegram Desktop style)
 */
import { isDesktop, onViewportChange } from './viewport.js';

const DESKTOP_TABS = ['chats', 'market', 'wallet', 'profile'];

export function initDesktop({ onTabSwitch, onSearchOpen }) {
  onViewportChange((desktop) => {
    document.body.classList.toggle('desktop-mode', desktop);
    if (!desktop) {
      document.body.classList.remove(
        'desktop-authenticated',
        'desktop-chat-open',
        'desktop-info-open',
        'desktop-overlay-open',
      );
      delete document.body.dataset.desktopOverlay;
    }
    syncDesktopRailVisibility();
    updateDesktopChatEmpty();
  });

  document.querySelectorAll('.desktop-rail__item[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => onTabSwitch?.(btn.dataset.tab));
  });

  document.getElementById('desktop-rail-search')?.addEventListener('click', () => {
    onTabSwitch?.('chats');
    onSearchOpen?.();
  });
}

export function syncDesktopAuthenticated(isMain) {
  document.body.classList.toggle('desktop-authenticated', isDesktop() && isMain);
  syncDesktopRailVisibility();
}

export function syncDesktopTab(tab) {
  DESKTOP_TABS.forEach((t) => document.body.classList.remove(`desktop-tab-${t}`));
  if (tab) document.body.classList.add(`desktop-tab-${tab}`);

  document.querySelectorAll('.desktop-rail__item[data-tab]').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

export function syncDesktopRailBadge(count) {
  const badge = document.getElementById('desktop-rail-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

export function updateDesktopChatEmpty() {
  const empty = document.getElementById('desktop-chat-empty');
  if (!empty) return;

  const show = isDesktop()
    && document.body.classList.contains('desktop-authenticated')
    && document.body.classList.contains('desktop-tab-chats')
    && !document.body.classList.contains('desktop-chat-open');

  empty.classList.toggle('hidden', !show);
  empty.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function syncDesktopRailVisibility() {
  const rail = document.getElementById('desktop-rail');
  if (!rail) return;
  const show = isDesktop() && document.body.classList.contains('desktop-authenticated');
  rail.hidden = !show;
}
