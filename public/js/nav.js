/**
 * Ferom — стек экранов с анимацией slide (как Telegram)
 */
import { isDesktop } from './viewport.js';
import { updateDesktopChatEmpty } from './desktop.js';

const LAYER_SCREENS = new Set([
  'chat',
  'userProfile',
  'privacy',
  'admin',
  'profileEdit',
  'myProfile',
  'walletHistory',
]);

const DESKTOP_INFO_LAYERS = new Set(['userProfile']);
const DESKTOP_OVERLAY_LAYERS = new Set(['privacy', 'admin', 'profileEdit', 'myProfile', 'walletHistory']);

const navState = {
  stack: [],
  root: null,
};

function notifyNavChange() {
  document.dispatchEvent(new CustomEvent('ferom:nav-change'));
}

export function initNav(screens) {
  navState.screens = screens;
}

export function isLayerVisible(name) {
  const el = navState.screens?.[name];
  return Boolean(el?.classList.contains('screen-layer--visible')
    || el?.classList.contains('desktop-layer-visible'));
}

export function getTopLayer() {
  return navState.stack[navState.stack.length - 1] || null;
}

function clearDesktopLayerState() {
  document.body.classList.remove('desktop-chat-open', 'desktop-info-open', 'desktop-overlay-open');
  delete document.body.dataset.desktopOverlay;
  updateDesktopChatEmpty();
}

function applyDesktopLayer(name, el, show) {
  if (!el) return;

  if (show) {
    el.classList.add('active', 'desktop-layer-visible');
    el.classList.remove('screen-layer', 'screen-layer--visible', 'screen-layer--under', 'screen-layer--closing');
    el.style.zIndex = '';

    if (name === 'chat') {
      document.body.classList.add('desktop-chat-open');
      document.body.classList.remove('desktop-info-open');
    } else if (DESKTOP_INFO_LAYERS.has(name)) {
      document.body.classList.add('desktop-info-open');
    } else if (DESKTOP_OVERLAY_LAYERS.has(name)) {
      document.body.classList.add('desktop-overlay-open');
      document.body.dataset.desktopOverlay = name;
    }
  } else {
    el.classList.remove('active', 'desktop-layer-visible', 'screen-layer', 'screen-layer--visible', 'screen-layer--under', 'screen-layer--closing');
    el.style.zIndex = '';

    if (name === 'chat') document.body.classList.remove('desktop-chat-open');
    if (DESKTOP_INFO_LAYERS.has(name)) document.body.classList.remove('desktop-info-open');
    if (DESKTOP_OVERLAY_LAYERS.has(name)) {
      document.body.classList.remove('desktop-overlay-open');
      if (document.body.dataset.desktopOverlay === name) {
        delete document.body.dataset.desktopOverlay;
      }
    }
  }

  updateDesktopChatEmpty();
}

export function showRoot(name) {
  closeAllLayers(false);
  navState.root = name;
  navState.stack = [];

  Object.values(navState.screens).forEach((el) => {
    if (!el) return;
    el.classList.remove(
      'screen-layer',
      'screen-layer--visible',
      'screen-layer--under',
      'screen-layer--closing',
      'desktop-layer-visible',
      'active',
    );
    el.style.zIndex = '';
  });

  navState.screens[name]?.classList.add('active');
  document.body.classList.remove('has-layers');
  clearDesktopLayerState();
  notifyNavChange();
}

export function pushLayer(name) {
  const el = navState.screens?.[name];
  if (!el || !LAYER_SCREENS.has(name)) {
    navState.screens?.[name]?.classList.add('active');
    return;
  }

  if (isDesktop()) {
    navState.stack.push(name);
    applyDesktopLayer(name, el, true);
    return;
  }

  const prev = navState.stack[navState.stack.length - 1];
  if (prev) {
    const prevEl = navState.screens[prev];
    prevEl?.classList.add('screen-layer--under');
    prevEl?.classList.remove('screen-layer--closing');
  }

  navState.stack.push(name);
  el.classList.add('screen-layer');
  el.style.zIndex = String(120 + navState.stack.length);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('screen-layer--visible');
    });
  });

  document.body.classList.add('has-layers');
  notifyNavChange();
}

export function popLayer() {
  if (isDesktop()) {
    const name = navState.stack.pop();
    if (!name) return Promise.resolve();
    applyDesktopLayer(name, navState.screens?.[name], false);
    if (navState.stack.length === 0) {
      document.body.classList.remove('has-layers');
    }
    notifyNavChange();
    return Promise.resolve();
  }

  const name = navState.stack.pop();
  if (!name) return Promise.resolve();

  const el = navState.screens?.[name];
  if (!el) return Promise.resolve();

  return new Promise((resolve) => {
    el.classList.remove('screen-layer--visible', 'screen-layer--under');
    el.classList.add('screen-layer--closing');

    const prev = navState.stack[navState.stack.length - 1];
    if (prev) {
      navState.screens[prev]?.classList.remove('screen-layer--under');
    }

    setTimeout(() => {
      el.classList.remove('screen-layer', 'screen-layer--closing', 'active');
      el.style.zIndex = '';
      if (navState.stack.length === 0) {
        document.body.classList.remove('has-layers');
      }
      notifyNavChange();
      resolve();
    }, 360);
  });
}

export function closeAllLayers(animate = true) {
  if (isDesktop()) {
    while (navState.stack.length) {
      const name = navState.stack.pop();
      applyDesktopLayer(name, navState.screens?.[name], false);
    }
    document.body.classList.remove('has-layers');
    return;
  }

  while (navState.stack.length) {
    const name = navState.stack.pop();
    const el = navState.screens?.[name];
    if (!el) continue;
    if (animate) {
      el.classList.remove('screen-layer--visible', 'screen-layer--under');
      el.classList.add('screen-layer--closing');
    }
    el.classList.remove('screen-layer', 'screen-layer--visible', 'screen-layer--under', 'screen-layer--closing', 'desktop-layer-visible', 'active');
    el.style.zIndex = '';
  }
  document.body.classList.remove('has-layers');
  clearDesktopLayerState();
  notifyNavChange();
}
