/**
 * Системная кнопка / жест «Назад» на Android (Capacitor)
 */
import { getTopLayer } from './nav.js';

/** @type {import('./swipeNav.js').SwipeNavOptions | null} */
let options = null;

function getOpenDismissTarget() {
  if (document.querySelector('.action-sheet.is-open')) return { kind: 'sheet' };

  if (document.querySelector('.message-menu.is-open')) return { kind: 'messageMenu' };

  const ctx = document.getElementById('chat-context-menu');
  if (ctx?.classList.contains('is-open')) return { kind: 'contextMenu' };

  const modal = document.getElementById('account-modal');
  if (modal && !modal.hidden && modal.classList.contains('is-open')) {
    return { kind: 'accountModal' };
  }

  const adminMod = document.getElementById('admin-mod-sheet');
  if (adminMod && !adminMod.hidden && adminMod.classList.contains('open')) {
    return { kind: 'adminMod' };
  }

  return null;
}

function getBackTarget() {
  if (document.body.classList.contains('search-open')) {
    return { kind: 'search' };
  }

  const layer = getTopLayer();
  if (layer) return { kind: 'layer', layer };

  const register = options?.getScreen?.('register');
  if (register?.classList.contains('active')) {
    return { kind: 'register' };
  }

  const lightbox = document.getElementById('image-lightbox');
  if (lightbox && !lightbox.classList.contains('hidden')) {
    return { kind: 'lightbox' };
  }

  return null;
}

function resolveBackAction() {
  const dismiss = getOpenDismissTarget();
  if (dismiss) return { type: 'dismiss', kind: dismiss.kind };

  const back = getBackTarget();
  if (!back) return null;

  return { type: 'back', kind: back.kind, layer: back.layer };
}

async function executeBackAction(action) {
  if (!options || !action) return;

  if (action.type === 'dismiss') {
    switch (action.kind) {
      case 'sheet':
        options.onSheetClose?.();
        break;
      case 'messageMenu':
        options.onMessageMenuClose?.();
        break;
      case 'contextMenu':
        options.onContextMenuClose?.();
        break;
      case 'accountModal':
        options.onAccountModalClose?.();
        break;
      case 'adminMod':
        options.onAdminModClose?.();
        break;
      default:
        break;
    }
    return;
  }

  switch (action.kind) {
    case 'search':
      options.onSearchClose?.();
      break;
    case 'register':
      options.onRegisterBack?.();
      break;
    case 'lightbox':
      options.onImageLightboxClose?.();
      break;
    default:
      await options.onLayerBack?.(action.layer);
  }
}

/** Назад: шторки → слои → поиск (как Android back) */
export async function navigateBack() {
  const action = resolveBackAction();
  if (!action) return false;
  await executeBackAction(action);
  return true;
}

function initAndroidBackButton() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return;

  const App = cap.Plugins?.App;
  if (!App?.addListener) return;

  App.addListener('backButton', async () => {
    const handled = await navigateBack();
    if (!handled && App.exitApp) {
      App.exitApp();
    }
  });
}

/**
 * @param {import('./swipeNav.js').SwipeNavOptions} opts
 */
export function initSwipeNav(opts) {
  options = opts;
  initAndroidBackButton();
}
