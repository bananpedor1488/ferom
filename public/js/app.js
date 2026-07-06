/**
 * Ferom — клиентское приложение
 */
import { api } from './api.js';
import {
  connectRealtime,
  disconnectRealtime,
  markChatRead,
  onRealtime,
  getServerNow,
  syncServerTime,
} from './realtime.js';
import {
  initNav,
  showRoot,
  pushLayer,
  popLayer,
  closeAllLayers,
  isLayerVisible,
  getTopLayer,
} from './nav.js';
import {
  initDesktop,
  syncDesktopAuthenticated,
  syncDesktopTab,
  syncDesktopRailBadge,
  updateDesktopChatEmpty,
} from './desktop.js';
import { isDesktop } from './viewport.js';
import { initSwipeNav } from './swipeNav.js';
import { ensureCoverPattern, initAllCoverPatterns, refreshCoverPatterns } from './coverPattern.js';
import { initAdmin, openAdminScreen, syncAdminButton } from './admin.js';
import {
  applyChatWallpaper,
  previewWallpaper,
  defaultWallpaperDraft,
  setWallpaperConfig,
  syncWallpaperDraftVariant,
  isPremiumWallpaperVariant,
  variantFromGradientProduct,
  isGradientWallpaperProduct,
  getWallpaperGradientCss,
  WALLPAPER_VARIANTS,
} from './wallpaper.js';
import {
  initNotifications,
  notifyIncomingMessage,
  notifyWalletEvent,
  notifySystemAlert,
  teardownNotifications,
  syncNotificationPresence,
  dismissNotificationsForChat,
} from './notifications.js';

// ─── Состояние ───
const state = {
  user: null,
  currentChat: null,
  searchTimer: null,
  selectedAvatarPreset: '/assets/avatars/preset-1.svg',
  avatarFile: null,
  editAvatarFile: null,
  editAvatarPreset: null,
  profileEditDraft: null,
  activeTab: 'chats',
  theme: 'auto',
  searchOpen: false,
  profileEditReturnTo: 'profile',
  chats: [],
  loadedMessageIds: new Set(),
  userProfileReturn: 'chat',
  viewingUser: null,
  reactionMessageId: null,
  menuMessage: null,
  menuChatId: null,
  pendingChatDeleteId: null,
  userProfileChatId: null,
  userProfileSharedTab: 'media',
  userProfileSharedCache: null,
  replyTo: null,
  chatMessages: new Map(),
  wallet: null,
  walletTopupPreset: null,
  market: null,
  marketView: 'cosmetics',
  tagsSort: 'price_asc',
  privacyPickerKey: null,
  wallpaperDraft: null,
  wallpaperConfig: null,
  ownedWallpaperIds: new Set(),
  photoCompose: null,
  activePhotoUploadTempId: null,
};

const PRIVACY_LEVEL_LABELS = {
  everyone: 'Все',
  nobody: 'Никто',
};

const PRIVACY_ROWS = [
  {
    card: 'privacy-profile-card',
    key: 'lastSeen',
    icon: 'schedule',
    color: 'blue',
    label: 'Был(а) в сети и онлайн',
    hint: 'Статус и время последнего визита',
  },
  {
    card: 'privacy-profile-card',
    key: 'avatar',
    icon: 'photo_camera',
    color: 'green',
    label: 'Фото профиля',
    hint: 'Аватар в чатах и профиле',
  },
  {
    card: 'privacy-profile-card',
    key: 'bio',
    icon: 'info',
    color: 'orange',
    label: 'Блок «О себе»',
    hint: 'Текст о себе в профиле',
  },
  {
    card: 'privacy-profile-card',
    key: 'premium',
    icon: 'diamond',
    color: 'purple',
    label: 'Premium-значок',
    hint: 'Рубиновый значок рядом с именем',
  },
  {
    card: 'privacy-interaction-card',
    key: 'messages',
    icon: 'chat',
    color: 'teal',
    label: 'Сообщения',
    hint: 'Кто может начать с вами чат',
  },
  {
    card: 'privacy-interaction-card',
    key: 'transfers',
    icon: 'payments',
    color: 'red',
    label: 'Переводы рубинов',
    hint: 'Кто может отправить вам рубины',
  },
  {
    card: 'privacy-tags-card',
    key: 'search',
    icon: 'person_search',
    color: 'green',
    label: 'Найти меня в поиске',
    hint: 'Появление в результатах по @',
  },
  {
    card: 'privacy-tags-card',
    key: 'tags',
    icon: 'verified',
    color: 'gold',
    label: 'Коллекционные @ теги',
    hint: 'Показ коллекционных тегов в профиле',
  },
];

// ─── DOM ───
const $ = (id) => document.getElementById(id);

const screens = {
  login: $('screen-login'),
  register: $('screen-register'),
  emailVerify: $('screen-email-verify'),
  profileSetup: $('screen-profile-setup'),
  main: $('screen-main'),
  chat: $('screen-chat'),
  profileEdit: $('screen-profile-edit'),
  privacy: $('screen-privacy'),
  admin: $('screen-admin'),
  myProfile: $('screen-my-profile'),
  userProfile: $('screen-user-profile'),
  walletHistory: $('screen-wallet-history'),
};

const tabPanels = {
  chats: $('tab-chats'),
  market: $('tab-market'),
  wallet: $('tab-wallet'),
  profile: $('tab-profile'),
};

const loader = $('app-loader');
const snackbar = $('snackbar');
const fab = $('fab-new-chat');

// ─── Утилиты ───

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const MESSAGE_URL_REGEX = /(https?:\/\/[^\s<>"'&]+[^\s<>"'&.,;:!?)])/gi;

function linkifyText(text) {
  if (!text) return '';
  const str = String(text);
  const parts = [];
  let lastIndex = 0;
  const re = new RegExp(MESSAGE_URL_REGEX.source, 'gi');
  let match = re.exec(str);
  while (match) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(str.slice(lastIndex, match.index)));
    }
    let url = match[0];
    const href = url.replace(/[),.!?;:]+$/g, '');
    parts.push(`<a href="${escapeHtml(href)}" class="message-link" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
    lastIndex = match.index + url.length;
    match = re.exec(str);
  }
  if (lastIndex < str.length) {
    parts.push(escapeHtml(str.slice(lastIndex)));
  }
  return parts.join('') || escapeHtml(str);
}

function getLinkHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getFieldValue(id) {
  const el = $(id);
  if (!el) return '';
  if (el.value != null && el.value !== '') return String(el.value).trim();
  const input = el.shadowRoot?.querySelector('input, textarea');
  return input ? String(input.value).trim() : String(el.value ?? '').trim();
}

function setFieldValue(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value;
  const input = el.shadowRoot?.querySelector('input, textarea');
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function avatarBasePath(url) {
  if (!url) return '';
  return url.split('?')[0];
}

const avatarUrlVersions = new Map();

/** Стабильный URL аватарки — не ломает кеш браузера при каждом рендере */
function cachedAvatarUrl(url) {
  if (!url) return '';
  const base = avatarBasePath(url);
  if (!base.startsWith('/uploads/')) return base;
  if (!avatarUrlVersions.has(base)) {
    const q = url.match(/[?&]v=([^&]+)/);
    avatarUrlVersions.set(base, q?.[1] || String(Date.now()));
  }
  return `${base}?v=${avatarUrlVersions.get(base)}`;
}

function invalidateAvatarCache(url) {
  const base = avatarBasePath(url);
  if (base.startsWith('/uploads/')) {
    avatarUrlVersions.set(base, String(Date.now()));
  }
}

function bustAvatarUrl(url) {
  return cachedAvatarUrl(url);
}

function setError(id, message) {
  const el = $(id);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function formatListTime(dateStr) {
  const date = new Date(dateStr);
  const now = getServerNow();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatMessageTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function chatDateKey(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatChatDateLabel(dateStr) {
  const date = new Date(dateStr);
  const now = getServerNow();
  if (date.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function formatVoiceDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderChatDateDivider(dateKey, label) {
  return `<div class="chat-date-divider" data-date-key="${escapeHtml(dateKey)}" data-date-label="${escapeHtml(label)}"><span>${escapeHtml(label)}</span></div>`;
}

function lastMessageDateKeyInContainer(container) {
  const rows = container?.querySelectorAll('[data-message-id]');
  if (!rows?.length) return null;
  return chatDateKey(rows[rows.length - 1].dataset.createdAt);
}

function ensureDateDividerBeforeMessage(container, createdAt) {
  const key = chatDateKey(createdAt);
  if (lastMessageDateKeyInContainer(container) === key) return;
  container.insertAdjacentHTML(
    'beforeend',
    renderChatDateDivider(key, formatChatDateLabel(createdAt)),
  );
}

function initChatDateFloat(container) {
  const float = $('chat-date-float');
  if (!float || !container) return;

  const update = () => {
    const dividers = container.querySelectorAll('.chat-date-divider');
    if (!dividers.length) {
      float.classList.add('hidden');
      return;
    }

    const scrollTop = container.scrollTop;
    let current = dividers[0];
    for (const divider of dividers) {
      if (divider.offsetTop - 8 <= scrollTop) current = divider;
      else break;
    }

    float.textContent = current.dataset.dateLabel || '';
    const containerTop = container.getBoundingClientRect().top;
    const dividerTop = current.getBoundingClientRect().top;
    const dividerVisible = dividerTop >= containerTop + 4 && dividerTop <= containerTop + 44;
    float.classList.toggle('hidden', dividerVisible || scrollTop < 8);
  };

  if (container._dateScrollHandler) {
    container.removeEventListener('scroll', container._dateScrollHandler);
  }
  container._dateScrollHandler = update;
  container.addEventListener('scroll', update, { passive: true });
  update();
}

function messageBodyHtml(msg) {
  if (msg.isDeleted) {
    return `<div class="message-bubble__text message-bubble__text--deleted">${escapeHtml(msg.content)}</div>`;
  }
  if (msg.type === 'image' && msg.mediaUrl) {
    const caption = msg.rawContent && msg.rawContent !== 'Фото' ? msg.rawContent : '';
    const isPending = Boolean(msg.isPending);
    const isFailed = msg.uploadState === 'failed';
    const openAttr = isPending ? '' : ` data-image-open="${escapeHtml(msg.mediaUrl)}"`;
    const tag = isPending ? 'div' : 'button';
    const typeAttr = isPending ? '' : ' type="button"';
    const overlay = isPending
      ? `<div class="message-bubble__upload-overlay${isFailed ? ' message-bubble__upload-overlay--failed' : ''}">
          ${isFailed
            ? '<button type="button" class="message-bubble__upload-retry" data-photo-retry aria-label="Повторить"><span class="material-symbols-rounded">refresh</span></button>'
            : '<span class="message-bubble__upload-spinner" aria-hidden="true"></span>'}
        </div>`
      : '';
    return `
      <${tag} class="message-bubble__image-btn${isPending ? ' message-bubble__image-btn--pending' : ''}"${typeAttr}${openAttr}>
        <img class="message-bubble__image" src="${escapeHtml(msg.mediaUrl)}" alt="Фото" loading="lazy">
        ${overlay}
      </${tag}>
      ${caption ? `<div class="message-bubble__text message-bubble__caption">${linkifyText(caption)}</div>` : ''}`;
  }
  if (msg.type === 'voice' && msg.mediaUrl) {
    return `
      <div class="message-voice">
        <button type="button" class="message-voice__play ripple-host" aria-label="Воспроизвести">
          <span class="material-symbols-rounded">play_arrow</span>
        </button>
        <div class="message-voice__wave" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <span class="message-voice__duration">${formatVoiceDuration(msg.duration)}</span>
        <audio class="message-voice__audio" src="${escapeHtml(msg.mediaUrl)}" preload="metadata"></audio>
      </div>`;
  }
  return `<div class="message-bubble__text">${linkifyText(msg.content)}</div>`;
}

let activeVoiceAudio = null;

function bindVoicePlayer(row) {
  const voice = row.querySelector('.message-voice');
  if (!voice || voice.dataset.bound) return;
  voice.dataset.bound = '1';
  const audio = voice.querySelector('.message-voice__audio');
  const playBtn = voice.querySelector('.message-voice__play');
  const icon = playBtn?.querySelector('.material-symbols-rounded');
  const durEl = voice.querySelector('.message-voice__duration');
  if (!audio || !playBtn) return;

  const setPlaying = (playing) => {
    voice.classList.toggle('message-voice--playing', playing);
    if (icon) icon.textContent = playing ? 'pause' : 'play_arrow';
  };

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (activeVoiceAudio && activeVoiceAudio !== audio) {
      activeVoiceAudio.pause();
      activeVoiceAudio.closest('.message-voice')?.classList.remove('message-voice--playing');
      const prevIcon = activeVoiceAudio.closest('.message-voice')?.querySelector('.message-voice__play .material-symbols-rounded');
      if (prevIcon) prevIcon.textContent = 'play_arrow';
    }
    activeVoiceAudio = audio;
    audio.play().catch(() => showSnackbar('Не удалось воспроизвести'));
  });

  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));
  audio.addEventListener('loadedmetadata', () => {
    if (!durEl || voice.closest('.message-row')?.dataset.messageId) {
      const msgId = parseInt(voice.closest('.message-row')?.dataset.messageId || '0', 10);
      const msg = state.chatMessages.get(msgId);
      if (!msg?.duration && audio.duration) {
        durEl.textContent = formatVoiceDuration(Math.round(audio.duration));
      }
    }
  });
}

function openImageLightbox(url) {
  let box = $('image-lightbox');
  if (!box) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="image-lightbox hidden" id="image-lightbox">
        <button type="button" class="image-lightbox__close ripple-host" id="image-lightbox-close" aria-label="Закрыть">
          <span class="material-symbols-rounded">close</span>
        </button>
        <img class="image-lightbox__img" id="image-lightbox-img" alt="Фото">
      </div>`);
    box = $('image-lightbox');
    $('image-lightbox-close')?.addEventListener('click', () => box?.classList.add('hidden'));
    box?.addEventListener('click', (e) => {
      if (e.target === box) box.classList.add('hidden');
    });
  }
  const img = $('image-lightbox-img');
  if (img) img.src = url;
  box?.classList.remove('hidden');
}

const chatVoiceRecording = {
  recorder: null,
  stream: null,
  chunks: [],
  startedAt: 0,
  timer: null,
  active: false,
  cancelled: false,
  startX: 0,
};

function formatLastSeen(user) {
  if (!user) return '';
  if (user.lastSeenHidden) return 'был(а) недавно';
  if (user.isOnline) return 'в сети';

  const lastSeenAt = user.lastSeenAt;
  if (!lastSeenAt) return 'давно не был(а) в сети';

  const seen = new Date(lastSeenAt);
  const now = getServerNow();
  const diffMs = now - seen;

  if (diffMs < 60_000) return 'был(а) только что';
  if (diffMs < 3_600_000) {
    const mins = Math.max(1, Math.floor(diffMs / 60_000));
    return `был(а) ${mins} мин. назад`;
  }
  if (seen.toDateString() === now.toDateString()) {
    return `был(а) в ${seen.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (seen.toDateString() === yesterday.toDateString()) {
    return `был(а) вчера в ${seen.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `был(а) ${seen.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

/** @deprecated use formatListTime / formatMessageTime */
function formatTime(dateStr) {
  return formatListTime(dateStr);
}

function showSnackbar(message, duration = 3000) {
  snackbar.textContent = message;
  snackbar.classList.toggle('snackbar--chat', isLayerVisible('chat'));
  snackbar.classList.add('visible');
  clearTimeout(showSnackbar._timer);
  showSnackbar._timer = setTimeout(() => snackbar.classList.remove('visible'), duration);
}

const ACCOUNT_MODAL_PRESETS = {
  banned: {
    icon: 'block',
    title: 'Аккаунт заблокирован',
    defaultMessage: 'Доступ к Ferom для этого аккаунта ограничен администратором.',
    btn: 'Понятно',
  },
  frozen: {
    icon: 'ac_unit',
    title: 'Аккаунт заморожен',
    defaultMessage: 'Вход и действия временно недоступны. Обратитесь в поддержку, если это ошибка.',
    btn: 'Понятно',
  },
  username: {
    icon: 'alternate_email',
    title: 'Смените @username',
    defaultMessage: 'Администратор запросил смену вашего обычного @username. Задайте новый в настройках профиля.',
    btn: 'Изменить профиль',
  },
  password: {
    icon: 'lock_reset',
    title: 'Пароль обновлён',
    defaultMessage: 'Новый пароль сохранён. Используйте его при следующем входе.',
    btn: 'Отлично',
  },
  passwordHelp: {
    icon: 'lock_reset',
    title: 'Сброс пароля',
    defaultMessage: 'Если администратор сбросил ваш пароль, задайте новый прямо на этом экране входа.',
    btn: 'Понятно',
  },
  session: {
    icon: 'info',
    title: 'Сессия завершена',
    defaultMessage: 'Вы были отключены от аккаунта.',
    btn: 'Понятно',
  },
};

let accountModalResolver = null;
const accountNoticeShown = { username: false };

function closeAccountModal() {
  const modal = $('account-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  const finish = () => {
    modal.hidden = true;
    modal.className = 'account-modal';
    if (accountModalResolver) {
      accountModalResolver();
      accountModalResolver = null;
    }
  };
  setTimeout(finish, 280);
}

function showAccountModal({
  type = 'banned',
  title,
  message,
  reason,
  steps,
  btnLabel,
  onAction,
} = {}) {
  const preset = ACCOUNT_MODAL_PRESETS[type] || ACCOUNT_MODAL_PRESETS.banned;
  const modal = $('account-modal');
  const icon = $('account-modal-icon');
  const titleEl = $('account-modal-title');
  const descEl = $('account-modal-desc');
  const stepsEl = $('account-modal-steps');
  const reasonEl = $('account-modal-reason');
  const btn = $('account-modal-btn');
  if (!modal || !icon || !titleEl || !descEl || !reasonEl || !btn) return Promise.resolve();

  const modalType = type === 'passwordHelp' ? 'password-help' : type;
  modal.hidden = false;
  modal.className = `account-modal account-modal--${modalType}`;
  modal.setAttribute('aria-hidden', 'false');
  icon.textContent = preset.icon;
  titleEl.textContent = title || preset.title;
  descEl.textContent = message || preset.defaultMessage;

  if (stepsEl) {
    if (steps?.length) {
      stepsEl.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
      stepsEl.classList.remove('hidden');
    } else {
      stepsEl.innerHTML = '';
      stepsEl.classList.add('hidden');
    }
  }

  const reasonText = (reason || '').trim();
  if (reasonText && reasonText !== descEl.textContent) {
    reasonEl.textContent = reasonText;
    reasonEl.classList.remove('hidden');
  } else {
    reasonEl.textContent = '';
    reasonEl.classList.add('hidden');
  }

  btn.textContent = btnLabel || preset.btn;

  const backdrop = $('account-modal-backdrop');
  const onClose = () => {
    btn.removeEventListener('click', onBtn);
    backdrop?.removeEventListener('click', onClose);
    document.removeEventListener('keydown', onKey);
    closeAccountModal();
  };
  const onBtn = () => {
    if (onAction) onAction();
    onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
  };

  btn.addEventListener('click', onBtn);
  backdrop?.addEventListener('click', onClose);
  document.addEventListener('keydown', onKey);

  requestAnimationFrame(() => modal.classList.add('is-open'));
  btn.focus();

  return new Promise((resolve) => {
    accountModalResolver = resolve;
  });
}

function showAccountStatusFromError(err) {
  if (err?.data?.banned) {
    return showAccountModal({ type: 'banned', message: err.message, reason: err.message });
  }
  if (err?.data?.frozen) {
    return showAccountModal({ type: 'frozen', message: err.message, reason: err.message });
  }
  return null;
}

function checkUsernameChangeNotice() {
  if (!state.user?.needsUsernameChange || accountNoticeShown.username) return;
  accountNoticeShown.username = true;
  showAccountModal({
    type: 'username',
    onAction: () => {
      switchTab('profile');
      requestAnimationFrame(() => openProfileEdit('profile'));
    },
  });
}

function showScreen(name) {
  closeAllLayers(false);
  Object.values(screens).forEach((s) => s?.classList.remove('active'));
  screens[name]?.classList.add('active');
  syncDesktopAuthenticated(false);
}

function renderAvatar(el, url, name = '?') {
  if (!el) return;
  const initial = (name || '?').charAt(0).toUpperCase();
  if (url) {
    const src = cachedAvatarUrl(url);
    const img = el.querySelector('img');
    if (img && img.getAttribute('src') === src && img.getAttribute('alt') === (name || '?')) return;
    el.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">`;
  } else {
    if (el.querySelector('img')) el.replaceChildren();
    if (el.textContent !== initial) el.textContent = initial;
  }
}

function avatarHtml(url, name, sizeClass = '') {
  const initial = escapeHtml((name || '?').charAt(0).toUpperCase());
  const src = url ? escapeHtml(cachedAvatarUrl(url)) : '';
  const cls = sizeClass ? `avatar ${sizeClass}` : 'avatar';
  const imgAttrs = ' loading="lazy" decoding="async"';
  if (url) return `<div class="${cls}"><img src="${src}" alt="${escapeHtml(name)}"${imgAttrs}></div>`;
  return `<div class="${cls}">${initial}</div>`;
}

function avatarWrapHtml(url, name, isOnline = false, sizeClass = '') {
  const dot = isOnline ? '<span class="avatar-online-dot"></span>' : '';
  return `<div class="avatar-wrap${sizeClass}">${avatarHtml(url, name)}${dot}</div>`;
}

function reactionsHtml(reactions) {
  if (!reactions?.length) return '';
  const chips = reactions.map((r) => `
    <button type="button" class="message-reaction${r.mine ? ' message-reaction--mine' : ''}" data-emoji="${r.emoji}" data-message-reaction>
      ${r.emoji}<span class="message-reaction__count">${r.count > 1 ? r.count : ''}</span>
    </button>`).join('');
  return `<div class="message-bubble__reactions">${chips}</div>`;
}

function readStatusHtml(m) {
  if (!m.isMine || m.isDeleted) return '';
  if (m.isPending) {
    if (m.uploadState === 'failed') {
      return '<span class="message-bubble__status message-bubble__status--failed material-symbols-rounded">error</span>';
    }
    return '<span class="message-bubble__status message-bubble__status--pending material-symbols-rounded">schedule</span>';
  }
  const isRead = m.readStatus === 'read';
  const cls = isRead ? ' message-bubble__status--read' : '';
  return `<span class="message-bubble__status material-symbols-rounded${cls}">${isRead ? 'done_all' : 'check'}</span>`;
}

function replyQuoteHtml(replyTo) {
  if (!replyTo) return '';
  const name = replyTo.isMine ? 'Вы' : replyTo.senderName;
  return `
    <div class="message-bubble__reply">
      <div class="message-bubble__reply-name">${escapeHtml(name)}</div>
      <div class="message-bubble__reply-text">${linkifyText(replyTo.content)}</div>
    </div>`;
}

function rememberMessage(m) {
  state.chatMessages.set(m.id, m);
}

function computeReadStatusForMessage(m) {
  if (!m.isMine) return m.readStatus;
  const otherRead = state.currentChat?.otherLastReadAt;
  if (!otherRead) return 'sent';
  return new Date(otherRead) >= new Date(m.createdAt) ? 'read' : 'sent';
}

function withReadStatus(m) {
  return { ...m, readStatus: computeReadStatusForMessage(m) };
}

// ─── Рубины & Premium ───

function formatRubies(amount) {
  return Math.round(Number(amount) || 0).toLocaleString('ru-RU');
}

function premiumBadgeHtml(userId = null, context = null) {
  const idAttr = userId != null ? ` data-premium-user-id="${userId}"` : '';
  const ctxCls = context === 'header' ? ' premium-ruby--header' : '';
  return `<button type="button" class="premium-ruby premium-ruby--btn${ctxCls}" data-premium-info${idAttr} aria-label="Ferom Premium"><span class="material-symbols-rounded">diamond</span></button>`;
}

function verifiedBadgeHtml(userId = null, context = null) {
  const idAttr = userId != null ? ` data-verified-user-id="${userId}"` : '';
  const ctxCls = context === 'header' ? ' verified-badge--header' : '';
  return `<button type="button" class="verified-badge verified-badge--btn${ctxCls}" data-verified-info${idAttr} aria-label="Официальный аккаунт"><span class="material-symbols-rounded">verified</span></button>`;
}

function userNameBadges(user) {
  return {
    isPremium: Boolean(user?.isPremium),
    isVerified: Boolean(user?.isVerified),
    userId: user?.id ?? null,
  };
}

function emailStatusBadgeHtml(verified) {
  if (verified) {
    return '<span class="email-status-badge email-status-badge--verified"><span class="material-symbols-rounded">mark_email_read</span>Подтверждён</span>';
  }
  return '<span class="email-status-badge email-status-badge--pending"><span class="material-symbols-rounded">schedule</span>Не подтверждён</span>';
}

function renderEmailStatus(el, verified) {
  if (!el) return;
  el.innerHTML = emailStatusBadgeHtml(verified);
}

function renderEmailField(el, email, verified) {
  if (!el) return;
  const safe = escapeHtml(email || '—');
  el.innerHTML = `${safe} ${emailStatusBadgeHtml(verified)}`;
}

function displayNameHtml(name, badges = {}, context = null) {
  const opts = typeof badges === 'boolean'
    ? { isPremium: badges, isVerified: false, userId: null }
    : {
      isPremium: Boolean(badges.isPremium),
      isVerified: Boolean(badges.isVerified),
      userId: badges.userId ?? null,
    };
  const safe = escapeHtml(name || '—');
  const parts = [
    opts.isPremium ? premiumBadgeHtml(opts.userId, context) : '',
    opts.isVerified ? verifiedBadgeHtml(opts.userId, context) : '',
  ].filter(Boolean);
  if (!parts.length) return safe;
  return `<span class="display-name-row"><span class="display-name-row__text">${safe}</span>${parts.join('')}</span>`;
}

function setDisplayName(el, name, badges = {}, context = null) {
  if (!el) return;
  const opts = typeof badges === 'boolean'
    ? userNameBadges({ isPremium: badges })
    : userNameBadges(badges);
  if (opts.isPremium || opts.isVerified) {
    el.innerHTML = displayNameHtml(name, opts, context);
  } else {
    el.textContent = name || '—';
  }
}

function resolveBadgeSheetUser(userId) {
  if (!userId) return state.user;
  const id = Number(userId);
  if (state.user?.id === id) return state.user;
  if (state.viewingUser?.id === id) return state.viewingUser;
  if (state.currentChat?.otherUser?.id === id) return state.currentChat.otherUser;
  const chat = state.chats.find((c) => c.otherUser?.id === id);
  return chat?.otherUser || null;
}

function officialAccountNoticeText(displayName) {
  const name = displayName || 'Пользователь';
  return `${name} — официальный аккаунт Ferom. Сообщения от него можно считать достоверными.`;
}

function openPremiumSheet(userId = null) {
  const user = resolveBadgeSheetUser(userId);
  const isSelf = !userId || user?.id === state.user?.id;
  const titleEl = $('premium-sheet-title');
  const descEl = $('premium-sheet-desc');
  const statusEl = $('premium-sheet-status');
  const ownerEl = $('premium-sheet-owner');
  const actionEl = $('premium-sheet-action');

  if (titleEl) titleEl.textContent = 'Ferom Premium';
  if (descEl) {
    descEl.textContent = 'Рубиновый значок рядом с именем, премиум-обои чата, эксклюзивные темы и другие привилегии подписчиков.';
  }

  if (statusEl) {
    statusEl.innerHTML = isSelf
      ? '<span class="material-symbols-rounded">verified</span> У вас активна подписка Ferom Premium'
      : `<span class="material-symbols-rounded">verified</span> ${escapeHtml(user?.displayName || 'Пользователь')} обладает подпиской Ferom Premium`;
  }

  if (ownerEl) {
    if (!isSelf && user) {
      ownerEl.classList.remove('hidden');
      ownerEl.innerHTML = `
        <div class="fragment-card__owner-avatar">${avatarHtml(user.avatarUrl, user.displayName, 'avatar--sm')}</div>
        <div class="fragment-card__owner-info">
          <div class="fragment-card__owner-name">${displayNameHtml(user.displayName, userNameBadges(user))}</div>
          <div class="fragment-card__owner-handle">${accountTagsLineHtml(user, 'compact')}</div>
        </div>`;
    } else {
      ownerEl.classList.add('hidden');
      ownerEl.innerHTML = '';
    }
  }

  const product = state.wallet?.products?.find((p) => p.id === 'premium');
  const owned = isSelf ? Boolean(state.user?.isPremium) : Boolean(user?.isPremium);
  if (actionEl) {
    if (isSelf && !owned && product) {
      actionEl.classList.remove('hidden');
      actionEl.innerHTML = `<button type="button" class="fragment-card__buy ripple-host" id="premium-sheet-buy">
        <span class="material-symbols-rounded">diamond</span>
        <span>Купить за ${formatRubies(product.price)}</span>
      </button>`;
      $('premium-sheet-buy')?.addEventListener('click', () => {
        closeSheet('premium-sheet');
        purchaseWalletProduct('premium');
      });
    } else {
      actionEl.classList.add('hidden');
      actionEl.innerHTML = '';
    }
  }

  openSheet('premium-sheet');
  bindCollectibleInfoClicks($('premium-sheet-owner'));
}

function openVerifiedSheet(userId = null) {
  const user = resolveBadgeSheetUser(userId);
  const name = user?.displayName || 'Пользователь';
  const textEl = $('verified-sheet-text');
  const ownerEl = $('verified-sheet-owner');

  if (textEl) {
    textEl.innerHTML = `
      <div class="chat-official-bubble chat-official-bubble--sheet">
        <span class="chat-official-bubble__icon material-symbols-rounded">verified</span>
        <div class="chat-official-bubble__body">
          <div class="chat-official-bubble__title">Официальный аккаунт</div>
          <p class="chat-official-bubble__text">${escapeHtml(officialAccountNoticeText(name))}</p>
        </div>
      </div>`;
  }

  if (ownerEl) {
    if (user && user.id !== state.user?.id) {
      ownerEl.classList.remove('hidden');
      ownerEl.innerHTML = `
        <div class="fragment-card__owner-avatar">${avatarHtml(user.avatarUrl, user.displayName, 'avatar--sm')}</div>
        <div class="fragment-card__owner-info">
          <div class="fragment-card__owner-name">${displayNameHtml(user.displayName, userNameBadges(user))}</div>
          <div class="fragment-card__owner-handle">${accountTagsLineHtml(user, 'compact')}</div>
        </div>`;
      bindCollectibleInfoClicks(ownerEl);
    } else {
      ownerEl.classList.add('hidden');
      ownerEl.innerHTML = '';
    }
  }

  openSheet('verified-sheet');
}

function chatEmptyStateHtml() {
  const other = state.currentChat?.otherUser;
  if (other?.isVerified) {
    return `
      <div class="chat-room__empty chat-room__empty--official">
        <div class="chat-official-bubble">
          <span class="chat-official-bubble__icon material-symbols-rounded">verified</span>
          <div class="chat-official-bubble__body">
            <div class="chat-official-bubble__title">Официальный аккаунт</div>
            <p class="chat-official-bubble__text">${escapeHtml(officialAccountNoticeText(other.displayName))}</p>
          </div>
        </div>
      </div>`;
  }
  return '<div class="chat-room__empty">Напишите первое сообщение</div>';
}

function removeChatOfficialNotice() {
  $('chat-messages')?.querySelector('.chat-room__empty--official')?.remove();
}

function profileEditUsernameInitial(user) {
  if (!user) return '';
  if (user.needsUsernameChange) return '';
  if (user.plainDuplicatesCollectible) return '';
  const ownedSlugs = new Set((user.equippedTags || [])
    .filter((t) => t.isCollectible)
    .map((t) => t.slug));
  if (user.username && ownedSlugs.has(user.username)) return '';
  return user.username || '';
}

function profileEditUsernameHint(user) {
  if (user?.needsUsernameChange || user?.plainDuplicatesCollectible) {
    return {
      text: 'Задайте новый обычный @username — старый стал коллекционным тегом',
      warn: true,
    };
  }
  return {
    text: 'Обычный @username — для поиска и переводов. Не совпадает с коллекционными тегами.',
    warn: false,
  };
}

function getPublicHandle(user) {
  if (!user) return null;
  return user.publicHandle || user.equippedCollectibleSlug || user.username || null;
}

function resolveProfileHandle(userOrUsername) {
  if (typeof userOrUsername === 'string') {
    return userOrUsername.replace(/^@/, '').trim() || null;
  }
  if (!userOrUsername) return null;
  return (
    getPublicHandle(userOrUsername)
    || userOrUsername.username
    || userOrUsername.primaryTagSlug
    || userOrUsername.equippedCollectibleSlug
    || userOrUsername.profileTags?.primary?.slug
    || userOrUsername.equippedTags?.find((t) => t.slug)?.slug
    || null
  );
}

function collectibleInlineHtml(tag, { clickable = true, size = 'sm' } = {}) {
  if (!tag?.slug) return '';
  const slug = tag.slug;
  const inner = `<span class="collectible-username collectible-username--${escapeHtml(tag.styleId || 'gold')}">@${escapeHtml(slug)}</span>`;
  const cls = `tg-line-coll${size === 'md' ? ' tg-line-coll--md' : ''}`;
  if (clickable) {
    return `<button type="button" class="collectible-tag-link ${cls}" data-collectible-info="${escapeHtml(slug)}">${inner}</button>`;
  }
  return `<span class="${cls}">${inner}</span>`;
}

let tagsExpandSeq = 0;
const tagsExpandCache = new Map();

function getUserCollectibles(user) {
  if (user?.profileTags?.collectibles?.length) return user.profileTags.collectibles;
  return (user?.equippedTags || []).filter((t) => t.isCollectible);
}

function accountLineVariantFromEl(line) {
  for (const cls of line.classList) {
    if (cls.startsWith('tg-account-line--')) return cls.slice('tg-account-line--'.length);
  }
  return 'compact';
}

/** Единый формат: @plain ✦ @collectible +N; по клику +N — все коллекционные через запятую */
function accountTagsLineHtml(user, variant = 'compact', { expanded = false, tagsId = null } = {}) {
  const h = user.headerTags;
  const parts = [];
  const collSize = variant === 'hero' || variant === 'info' ? 'md' : 'sm';
  const collectibles = getUserCollectibles(user);
  const canExpand = (h?.extraCount > 0) || expanded;

  let id = tagsId;
  if (canExpand) {
    if (!id) id = String(++tagsExpandSeq);
    tagsExpandCache.set(id, user);
  }

  if (expanded && collectibles.length) {
    if (h?.plain) {
      parts.push(`<span class="tg-line-plain">@${escapeHtml(h.plain.slug)}</span>`);
      parts.push(`<span class="tg-line-sep tg-line-sep--${variant}">✦</span>`);
    }
    collectibles.forEach((tag, i) => {
      if (i > 0) parts.push('<span class="tg-tags-comma">, </span>');
      parts.push(collectibleInlineHtml(tag, { size: collSize }));
    });
    parts.push('<button type="button" class="tg-line-more tg-line-more--collapse" data-tags-less title="Свернуть">−</button>');
  } else {
    if (h?.plain) {
      parts.push(`<span class="tg-line-plain">@${escapeHtml(h.plain.slug)}</span>`);
    }

    if (h?.secondary) {
      if (parts.length) parts.push(`<span class="tg-line-sep tg-line-sep--${variant}">✦</span>`);
      parts.push(collectibleInlineHtml(h.secondary, { size: collSize }));
    }

    if (!parts.length) {
      const first = collectibles[0];
      if (first) parts.push(collectibleInlineHtml(first, { size: collSize }));
      else if (user.username) parts.push(`<span class="tg-line-plain">@${escapeHtml(user.username)}</span>`);
    }

    if (h?.extraCount > 0) {
      parts.push(`<button type="button" class="tg-line-more" data-tags-more title="Показать все теги">+${h.extraCount}</button>`);
    }
  }

  if (!parts.length) return '—';
  const idAttr = id ? ` data-tags-id="${id}"` : '';
  const expandedCls = expanded ? ' tg-account-line--expanded' : '';
  return `<span class="tg-account-line tg-account-line--${variant}${expandedCls}"${idAttr}>${parts.join('')}</span>`;
}

function heroAccountHtml(user) {
  return accountTagsLineHtml(user, 'hero');
}

function settingsUsernameHtml(user) {
  return accountTagsLineHtml(user, 'settings');
}

function accountLineHtml(user, variant = 'compact') {
  return accountTagsLineHtml(user, variant);
}

function profileInfoTagsHtml(user) {
  return accountTagsLineHtml(user, 'info');
}

function headerTagsHtml(user) {
  return accountLineHtml(user, 'compact');
}

function profileTagsHtml(user) {
  return profileInfoTagsHtml(user);
}

function usernameDisplayHtml(user, { mode = 'compact' } = {}) {
  if (!user) return '—';
  if (mode === 'info') return profileInfoTagsHtml(user);
  if (mode === 'hero') return heroAccountHtml(user);
  if (mode === 'hint') return settingsUsernameHtml(user);
  if (user.headerTags || user.profileTags) return accountLineHtml(user, 'compact');
  const handle = getPublicHandle(user);
  return handle ? `@${escapeHtml(handle)}` : '—';
}

function formatCollectibleDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

let fragmentSheetBuySlug = null;

async function openFragmentSheet(slug) {
  const hero = $('fragment-hero');
  const handleEl = $('fragment-handle');
  const rarityEl = $('fragment-rarity');
  const rowsEl = $('fragment-rows');
  const ownerEl = $('fragment-owner');
  const actionsEl = $('fragment-actions');
  const buyLabel = $('fragment-buy-label');

  if (!hero || !handleEl) return;

  fragmentSheetBuySlug = null;
  if (actionsEl) actionsEl.classList.add('hidden');

  handleEl.innerHTML = '<div class="spinner" style="margin:0 auto"></div>';
  if (rarityEl) rarityEl.innerHTML = '';
  if (rowsEl) rowsEl.innerHTML = '';
  if (ownerEl) ownerEl.classList.add('hidden');
  openSheet('fragment-sheet');

  try {
    const { collectible: c } = await api.getCollectibleInfo(slug);
    hero.className = `fragment-card__hero fragment-card__hero--${escapeHtml(c.styleId)}`;
    handleEl.innerHTML = `<span class="collectible-username collectible-username--${escapeHtml(c.styleId)}">@${escapeHtml(c.slug)}</span>`;
    if (rarityEl) rarityEl.innerHTML = rarityPillHtml(c.rarity, c.rarityLabel);

    const rows = [
      ['Создан', formatCollectibleDate(c.mintedAt)],
      ['Стоимость минта', `<span class="fragment-row__value--ruby"><span class="material-symbols-rounded">diamond</span>${formatRubies(c.mintPrice)}</span>`],
    ];

    if (c.isResold || c.acquiredPrice > c.mintPrice) {
      rows.push(['Куплен', formatCollectibleDate(c.acquiredAt)]);
      rows.push(['Цена покупки', `<span class="fragment-row__value--ruby"><span class="material-symbols-rounded">diamond</span>${formatRubies(c.acquiredPrice)}</span>`]);
    } else {
      rows.push(['Владелец получил', formatCollectibleDate(c.acquiredAt)]);
    }

    if (c.listed && c.listPrice) {
      rows.push(['На продаже', `<span class="fragment-row__value--ruby"><span class="material-symbols-rounded">diamond</span>${formatRubies(c.listPrice)}</span>`]);
    }

    rows.push(['Оценка алгоритма', String(c.score)]);

    if (rowsEl) {
      rowsEl.innerHTML = rows.map(([label, val]) => {
        const isHtml = typeof val === 'string' && val.includes('fragment-row__value--ruby');
        return `<div class="fragment-row"><span class="fragment-row__label">${escapeHtml(label)}</span><span class="fragment-row__value">${isHtml ? val : escapeHtml(String(val))}</span></div>`;
      }).join('');
    }

    if (ownerEl && c.owner) {
      ownerEl.classList.remove('hidden');
      ownerEl.innerHTML = `
        <div class="fragment-card__owner-avatar">${avatarHtml(c.owner.avatarUrl, c.owner.displayName, 'avatar--sm')}</div>
        <div class="fragment-card__owner-info">
          <div class="fragment-card__owner-name">${escapeHtml(c.owner.displayName || 'Пользователь')}</div>
          <div class="fragment-card__owner-handle">@${escapeHtml(c.owner.username || c.slug)}</div>
        </div>`;
    }

    const canBuy = c.listed && c.listPrice && c.owner?.id !== state.user?.id;
    if (canBuy) {
      fragmentSheetBuySlug = c.slug;
      if (actionsEl) actionsEl.classList.remove('hidden');
      if (buyLabel) buyLabel.textContent = `Купить за ${formatRubies(c.listPrice)}`;
    }
  } catch (err) {
    handleEl.innerHTML = `<p class="text-error">${escapeHtml(err.message)}</p>`;
  }
}

function bindCollectibleInfoClicks(root = document) {
  root.querySelectorAll('[data-collectible-info]').forEach((btn) => {
    if (btn.dataset.boundCollectible) return;
    btn.dataset.boundCollectible = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const slug = btn.dataset.collectibleInfo;
      if (slug) openFragmentSheet(slug);
    });
  });
}

function setUsername(el, user, opts = {}) {
  if (!el) return;
  const mode = opts.mode || 'compact';
  el.innerHTML = usernameDisplayHtml(user, { mode });
  bindCollectibleInfoClicks(el);
}

function rarityPillHtml(rarity, label) {
  if (!rarity) return '';
  return `<span class="rarity-pill rarity-pill--${escapeHtml(rarity)}">${escapeHtml(label || rarity)}</span>`;
}

function applyUserUpdate(user) {
  if (!user) return;
  const prevAvatar = state.user?.avatarUrl;
  if (user.avatarUrl !== prevAvatar) {
    if (prevAvatar) invalidateAvatarCache(prevAvatar);
    if (user.avatarUrl) invalidateAvatarCache(user.avatarUrl);
  }
  state.user = user;
  applyCosmetics();
  refreshPremiumSurfaces();
  refreshUsernameSurfaces();
  if (state.wallet) {
    state.wallet.balance = user.walletBalance ?? 0;
    state.wallet.isPremium = Boolean(user.isPremium);
    renderWalletBalance();
    renderWalletStatusChip();
    const premiumProduct = state.wallet.products?.find((p) => p.id === 'premium');
    if (premiumProduct) premiumProduct.owned = user.isPremium;
    renderWalletPremiumCard();
  }
  const balanceText = $('market-balance-text');
  if (balanceText) balanceText.textContent = formatRubies(user.walletBalance ?? 0);
  syncAdminButton(user);
  if (!user.needsUsernameChange) {
    accountNoticeShown.username = false;
  }
}

function refreshPremiumSurfaces() {
  const u = state.user;
  if (!u) return;

  setDisplayName($('profile-display-name'), u.displayName, userNameBadges(u));

  if (isLayerVisible('myProfile')) loadMyProfileScreen();
  if (isLayerVisible('userProfile') && state.viewingUser?.id === u.id) {
    state.viewingUser.isPremium = u.isPremium;
    state.viewingUser.isVerified = u.isVerified;
    renderUserProfileScreen(state.viewingUser);
  }
  if (isLayerVisible('chat') && state.currentChat?.otherUser) {
    updateChatHeader(state.currentChat.otherUser);
  }
  if (tabPanels.chats?.classList.contains('active')) renderChatsList();
}

function updateMintCollectibleRow() {
  const row = $('btn-mint-collectible');
  const hint = $('profile-mint-hint');
  const u = state.user;
  if (!row) return;

  const can = Boolean(u?.canMintCollectible && u?.username);
  row.classList.toggle('hidden', !can);

  if (hint && u?.username) {
    const fee = u.mintPreview?.mintFee;
    hint.textContent = fee != null
      ? `Сделать @${u.username} коллекционным · ${formatRubies(fee)} руб.`
      : `Сделать @${u.username} коллекционным`;
  }
}

function refreshUsernameSurfaces() {
  const u = state.user;
  if (!u) return;

  setUsername($('profile-username'), u, { mode: 'hero' });
  const hintUsername = $('profile-hint-username');
  if (hintUsername) hintUsername.innerHTML = settingsUsernameHtml(u);
  updateMintCollectibleRow();

  if (isLayerVisible('privacy')) loadPrivacyScreen();
  if (isLayerVisible('myProfile')) loadMyProfileScreen();
  if (isLayerVisible('profileEdit')) {
    const usernameInput = $('edit-username');
    if (usernameInput) usernameInput.value = profileEditUsernameInitial(u);
    const hintEl = $('edit-username-hint');
    if (hintEl) {
      const hint = profileEditUsernameHint(u);
      hintEl.textContent = hint.text;
      hintEl.classList.toggle('tg-edit-hint--warn', hint.warn);
    }
  }
}

async function withButtonLoading(buttonId, fn) {
  const btn = $(buttonId);
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function emptyChatsHtml() {
  return `
    <div class="chat-list__empty">
      <span class="material-symbols-rounded">forum</span>
      <p>Нет диалогов</p>
      <p class="text-muted">Нажмите 🔍 или кнопку ниже, чтобы найти людей</p>
    </div>`;
}


// ─── Material Web: дождаться загрузки ───
function waitForMaterial() {
  return new Promise((resolve) => {
    if (window.__materialReady) return resolve();
    window.addEventListener('material-ready', resolve, { once: true });
    setTimeout(resolve, 5000);
  });
}

// ─── Auth ───

$('go-register')?.addEventListener('click', () => {
  setError('login-error', null);
  showScreen('register');
});

$('go-login')?.addEventListener('click', () => {
  setError('register-error', null);
  showScreen('login');
});

$('login-password-reset-hint')?.addEventListener('click', () => {
  showAccountModal({
    type: 'passwordHelp',
    steps: [
      'Введите email вашего аккаунта',
      'В поле «Пароль» укажите новый пароль — минимум 6 символов',
      'Нажмите «Войти» — пароль сохранится, и вы попадёте в Ferom',
    ],
  });
});

$('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('login-error', null);

  const email = getFieldValue('login-email');
  const password = getFieldValue('login-password');

  if (!email || !password) {
    setError('login-error', 'Заполните все поля');
    return;
  }

  try {
    await withButtonLoading('login-submit', async () => {
      const data = await api.login(email, password);
      state.user = data.user;
      if (data.passwordWasReset) {
        await showAccountModal({ type: 'password' });
      }
      routeAfterAuth(data);
    });
  } catch (err) {
    if (err.data?.banned || err.data?.frozen) {
      showAccountStatusFromError(err);
      return;
    }
    setError('login-error', err.message);
  }
});

$('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('register-error', null);

  const email = getFieldValue('register-email');
  const password = getFieldValue('register-password');

  if (!email || !password) {
    setError('register-error', 'Заполните все поля');
    return;
  }

  try {
    await withButtonLoading('register-submit', async () => {
      const data = await api.register(email, password);
      state.user = data.user;
      routeAfterAuth(data);
    });
  } catch (err) {
    setError('register-error', err.message);
  }
});

function routeAfterAuth(authData = {}) {
  const needsEmailVerification = Boolean(
    authData.needsEmailVerification
    || (state.user && !state.user.emailVerified)
  );

  if (needsEmailVerification) {
    showEmailVerifyScreen(authData);
    return;
  }

  enterAuthenticatedApp(authData.needsProfileSetup);
}

function showEmailVerifyScreen(authData = {}) {
  disconnectRealtime?.();
  const display = $('verify-email-display');
  if (display) {
    display.textContent = authData.maskedEmail || state.user?.email || '';
  }
  const changePanel = $('verify-email-change-panel');
  const changeToggle = $('verify-email-change-toggle');
  if (changePanel) changePanel.classList.add('hidden');
  if (changeToggle) changeToggle.textContent = 'Изменить';
  setFieldValue('verify-email-new', state.user?.email || '');
  setError('verify-email-error', authData.emailSendFailed ? (authData.emailSendError || 'Не удалось отправить письмо') : null);
  setFieldValue('verify-email-code', '');
  showDevCodeHint(authData.devCode);
  showScreen('emailVerify');

  if (authData.emailJustSent) {
    showSnackbar('Код отправлен на почту');
    startResendCooldown(authData.retryAfterSec || 60);
  } else if (authData.emailSendFailed) {
    startResendCooldown(30);
  } else if (authData.retryAfterSec) {
    startResendCooldown(authData.retryAfterSec);
  } else {
    startResendCooldown(60);
  }
}

function showDevCodeHint(devCode) {
  const hint = $('verify-email-dev-hint');
  if (!hint) return;
  if (devCode) {
    hint.textContent = `Режим разработки: код ${devCode}`;
    hint.classList.remove('hidden');
  } else {
    hint.textContent = '';
    hint.classList.add('hidden');
  }
}

let resendCooldownTimer = null;

function startResendCooldown(seconds) {
  const btn = $('verify-email-resend');
  if (!btn) return;
  clearInterval(resendCooldownTimer);
  let left = Math.max(0, Number(seconds) || 0);
  btn.disabled = left > 0;
  btn.textContent = left > 0 ? `Отправить снова (${left})` : 'Отправить снова';
  if (left <= 0) return;
  resendCooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendCooldownTimer);
      btn.disabled = false;
      btn.textContent = 'Отправить снова';
      return;
    }
    btn.textContent = `Отправить снова (${left})`;
  }, 1000);
}

function enterAuthenticatedApp(needsProfileSetup) {
  if (state.user) syncCoverGradients();
  connectRealtime();
  initNotifications({
    getState: () => state,
    isLayerVisible,
    onOpenChat: (chatId) => {
      const chat = state.chats.find((c) => c.id === chatId);
      openChat(chatId, chat?.otherUser);
    },
    onOpenWallet: () => switchTab('wallet'),
  });
  if (needsProfileSetup) {
    showScreen('profileSetup');
  } else {
    showRoot('main');
    switchTab('chats');
    syncDesktopAuthenticated(true);
    checkUsernameChangeNotice();
  }
}

$('verify-email-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('verify-email-error', null);
  const code = getFieldValue('verify-email-code').replace(/\D/g, '');
  if (code.length !== 6) {
    setError('verify-email-error', 'Введите 6-значный код');
    return;
  }
  try {
    await withButtonLoading('verify-email-submit', async () => {
      const data = await api.verifyEmail(code);
      state.user = data.user;
      showDevCodeHint(null);
      enterAuthenticatedApp(data.needsProfileSetup);
    });
  } catch (err) {
    setError('verify-email-error', err.message);
  }
});

$('verify-email-code')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});

$('verify-email-resend')?.addEventListener('click', async () => {
  setError('verify-email-error', null);
  const btn = $('verify-email-resend');
  if (btn?.disabled) return;
  try {
    btn.disabled = true;
    const data = await api.resendEmailCode();
    showDevCodeHint(data.devCode);
    if (data.maskedEmail) {
      const display = $('verify-email-display');
      if (display) display.textContent = data.maskedEmail;
    }
    showSnackbar('Код отправлен повторно');
    startResendCooldown(60);
  } catch (err) {
    if (err.data?.retryAfterSec) {
      startResendCooldown(err.data.retryAfterSec);
    } else {
      btn.disabled = false;
    }
    setError('verify-email-error', err.message);
  }
});

$('verify-email-change-toggle')?.addEventListener('click', () => {
  const panel = $('verify-email-change-panel');
  const toggle = $('verify-email-change-toggle');
  if (!panel || !toggle) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  toggle.textContent = opening ? 'Отмена' : 'Изменить';
  if (opening) {
    const input = $('verify-email-new');
    if (input) {
      input.value = state.user?.email || '';
      input.focus();
    }
  }
});

$('verify-email-change-save')?.addEventListener('click', async () => {
  setError('verify-email-error', null);
  const email = getFieldValue('verify-email-new').trim();
  if (!email) {
    setError('verify-email-error', 'Введите email');
    return;
  }
  try {
    await withButtonLoading('verify-email-change-save', async () => {
      const data = await api.changeVerifyEmail(email);
      state.user = data.user;
      const display = $('verify-email-display');
      if (display) display.textContent = data.maskedEmail || state.user?.email || '';
      $('verify-email-change-panel')?.classList.add('hidden');
      const toggle = $('verify-email-change-toggle');
      if (toggle) toggle.textContent = 'Изменить';
      showDevCodeHint(data.devCode);
      setFieldValue('verify-email-code', '');
      if (data.emailJustSent) {
        showSnackbar('Код отправлен на новый email');
        startResendCooldown(data.retryAfterSec || 60);
      } else if (data.emailSendFailed) {
        setError('verify-email-error', data.emailSendError || 'Не удалось отправить письмо');
        startResendCooldown(30);
      }
    });
  } catch (err) {
    setError('verify-email-error', err.message);
    if (err.data?.user) state.user = err.data.user;
    if (err.data?.maskedEmail) {
      const display = $('verify-email-display');
      if (display) display.textContent = err.data.maskedEmail;
    }
    if (err.data?.devCode) showDevCodeHint(err.data.devCode);
  }
});

$('verify-email-logout')?.addEventListener('click', async () => {
  try {
    await api.logout();
  } catch {
    /* ignore */
  }
  state.user = null;
  disconnectRealtime?.();
  showScreen('login');
});

// ─── Profile Setup ───

$('setup-avatar-presets')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  document.querySelectorAll('#setup-avatar-presets .avatar-presets__item').forEach((el) => el.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedAvatarPreset = btn.dataset.preset;
  state.avatarFile = null;
  $('setup-avatar-img').src = btn.dataset.preset;
  const hint = $('setup-upload-hint');
  if (hint) {
    hint.textContent = 'или выберите из готовых';
    hint.classList.remove('avatar-upload-hint--success');
  }
});

$('setup-upload-btn')?.addEventListener('click', () => $('setup-avatar-file')?.click());

$('setup-avatar-file')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showSnackbar('Файл больше 2 МБ');
    return;
  }
  state.avatarFile = file;
  state.selectedAvatarPreset = null;
  document.querySelectorAll('#setup-avatar-presets .avatar-presets__item').forEach((el) => el.classList.remove('selected'));
  $('setup-avatar-img').src = URL.createObjectURL(file);
  const hint = $('setup-upload-hint');
  if (hint) {
    hint.textContent = `Выбрано: ${file.name}`;
    hint.classList.add('avatar-upload-hint--success');
  }
});

$('profile-setup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('setup-error', null);

  const username = getFieldValue('setup-username').replace(/^@/, '');
  const displayName = getFieldValue('setup-display-name');

  if (!username || !displayName) {
    setError('setup-error', 'Заполните все поля');
    return;
  }

  try {
    await withButtonLoading('setup-submit', async () => {
      const data = await api.updateProfile({
        username,
        displayName,
        avatarFile: state.avatarFile,
        avatarPreset: state.avatarFile ? null : state.selectedAvatarPreset,
      });
      state.user = data.user;
      showRoot('main');
      switchTab('chats');
      syncDesktopAuthenticated(true);
      showSnackbar('Профиль настроен!');
    });
  } catch (err) {
    setError('setup-error', err.message);
  }
});

// ─── Навигация ───

// ─── Плавающий Tab Bar ───

const navIndicator = $('nav-indicator');
const floatingNav = $('floating-nav');
const TAB_ORDER = ['chats', 'market', 'wallet', 'profile'];

const COVER_GRADIENTS = {
  purple: 'linear-gradient(145deg, #7c3aed 0%, #a855f7 45%, #c084fc 100%)',
  ocean: 'linear-gradient(145deg, #0369a1 0%, #0ea5e9 50%, #38bdf8 100%)',
  sunset: 'linear-gradient(145deg, #ea580c 0%, #f43f5e 55%, #fbbf24 100%)',
  forest: 'linear-gradient(145deg, #166534 0%, #22c55e 50%, #86efac 100%)',
  night: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 45%, #6366f1 100%)',
  rose: 'linear-gradient(145deg, #be185d 0%, #ec4899 50%, #fda4af 100%)',
  aurora: 'linear-gradient(145deg, #06b6d4 0%, #8b5cf6 50%, #f472b6 100%)',
  fire: 'linear-gradient(145deg, #dc2626 0%, #f97316 50%, #facc15 100%)',
};

const COVER_GRADIENT_LABELS = {
  purple: 'Фиолетовый',
  ocean: 'Океан',
  sunset: 'Закат',
  forest: 'Лес',
  night: 'Ночь',
  rose: 'Роза',
  aurora: 'Аврора',
  fire: 'Огонь',
};

const COVER_GRADIENT_CLASS = 'cover-gradient--';

function applyCoverGradient(id, elementId = 'profile-hero-bg') {
  const bg = $(elementId);
  if (!bg) return;
  const gradientId = COVER_GRADIENTS[id] ? id : 'purple';
  Object.keys(COVER_GRADIENTS).forEach((key) => {
    bg.classList.remove(`${COVER_GRADIENT_CLASS}${key}`);
  });
  bg.classList.add(`${COVER_GRADIENT_CLASS}${gradientId}`);
  bg.style.background = COVER_GRADIENTS[gradientId];
  const patternVariant = elementId === 'profile-hero-bg' ? 'profile-hero' : 'profile-header';
  requestAnimationFrame(() => {
    ensureCoverPattern(bg, { variant: patternVariant, seed: elementId, force: true });
  });
}

function syncCoverGradients() {
  const id = state.user?.coverGradient || 'purple';
  applyCoverGradient(id, 'profile-hero-bg');
  applyCoverGradient(id, 'my-profile-bg');
}

function renderGradientPicker() {
  const grid = $('gradient-picker');
  if (!grid) return;

  const current = state.user?.coverGradient || 'purple';
  grid.innerHTML = Object.entries(COVER_GRADIENTS).map(([id, css]) => `
    <button type="button" class="gradient-picker__item${id === current ? ' selected' : ''}" data-gradient="${id}" aria-label="${COVER_GRADIENT_LABELS[id]}" style="background:${css}">
      <span class="gradient-picker__check material-symbols-rounded">check</span>
    </button>
  `).join('');

  grid.querySelectorAll('[data-gradient]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.gradient;
      grid.querySelectorAll('.gradient-picker__item').forEach((el) => el.classList.remove('selected'));
      btn.classList.add('selected');
      applyCoverGradient(id, 'profile-hero-bg');
      applyCoverGradient(id, 'my-profile-bg');

      try {
        const { user } = await api.updateProfile({ coverGradient: id });
        state.user = user;
        syncCoverGradients();
        showSnackbar(`Фон: ${COVER_GRADIENT_LABELS[id] || id}`);
      } catch (err) {
        showSnackbar(err.message);
        syncCoverGradients();
        grid.querySelectorAll('.gradient-picker__item').forEach((el) => {
          el.classList.toggle('selected', el.dataset.gradient === (state.user?.coverGradient || 'purple'));
        });
      }
    });
  });
}

function openCoverSheet() {
  renderGradientPicker();
  openSheet('cover-sheet');
}

function updateNavIndicator(tab, animate = true) {
  if (!navIndicator || !floatingNav) return;

  const index = TAB_ORDER.indexOf(tab);
  const items = floatingNav.querySelectorAll('.floating-nav__item');
  const item = items[index];
  if (!item) return;

  if (!animate) navIndicator.style.transition = 'none';

  const navRect = floatingNav.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const left = itemRect.left - navRect.left;

  navIndicator.style.width = `${itemRect.width}px`;
  navIndicator.style.transform = `translateX(${left}px)`;

  if (!animate) {
    requestAnimationFrame(() => {
      navIndicator.style.transition = '';
    });
  }
}

document.querySelectorAll('.floating-nav__item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  if (state.searchOpen) setSearchOpen(false);
  state.activeTab = tab;

  floatingNav?.querySelectorAll('.floating-nav__item').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });

  Object.entries(tabPanels).forEach(([key, panel]) => {
    panel?.classList.toggle('active', key === tab);
  });

  fab?.classList.toggle('hidden', tab !== 'chats');
  updateNavIndicator(tab);

  if (isDesktop()) {
    syncDesktopTab(tab);
    if (tab !== 'chats') {
      closeAllLayers(false);
    }
    updateDesktopChatEmpty();
  }

  if (tab === 'chats') loadChats();
  if (tab === 'market') loadMarketTab();
  if (tab === 'wallet') loadWalletTab();
  if (tab === 'profile') loadProfileTab();
}

// ─── Поиск пользователей ───

const searchSheet = $('search-sheet');
const searchBtn = $('btn-toggle-search');

const SEARCH_HINT = '<p class="search-sheet__hint">Введите username, чтобы найти человека</p>';

function setSearchOpen(open) {
  state.searchOpen = open;
  searchSheet?.classList.toggle('is-open', open);
  searchSheet?.setAttribute('aria-hidden', open ? 'false' : 'true');
  searchBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.classList.toggle('search-open', open);

  const input = $('user-search');
  const clearBtn = $('search-clear');
  const results = $('user-results');

  if (open) {
    setTimeout(() => input?.focus(), 280);
  } else {
    if (input) input.value = '';
    clearBtn?.classList.add('hidden');
    if (results) results.innerHTML = SEARCH_HINT;
  }
}

function toggleSearch() {
  setSearchOpen(!state.searchOpen);
}

searchBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSearch();
});

$('search-close')?.addEventListener('click', () => setSearchOpen(false));

$('search-clear')?.addEventListener('click', () => {
  const input = $('user-search');
  if (input) {
    input.value = '';
    input.focus();
  }
  $('search-clear')?.classList.add('hidden');
  const results = $('user-results');
  if (results) results.innerHTML = SEARCH_HINT;
});

$('user-search')?.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  $('search-clear')?.classList.toggle('hidden', q.length < 1);

  clearTimeout(state.searchTimer);
  const results = $('user-results');
  if (q.length < 1) {
    if (results) results.innerHTML = SEARCH_HINT;
    return;
  }

  state.searchTimer = setTimeout(() => searchUsers(q), 300);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.searchOpen) {
    setSearchOpen(false);
    return;
  }
  if ($('chat-context-menu')?.classList.contains('is-open')) {
    closeChatContextMenu();
    return;
  }
  if (isDesktop() && isLayerVisible('userProfile')) {
    closeUserProfile();
  }
});

fab?.addEventListener('click', () => {
  switchTab('chats');
  setSearchOpen(true);
});

// ─── Чаты ───

function getTotalUnread() {
  return state.chats.reduce((sum, c) => sum + (c.isMuted ? 0 : (c.unreadCount || 0)), 0);
}

function sortChatsInPlace(chats) {
  chats.sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    const at = a.lastMessage?.createdAt || a.updatedAt;
    const bt = b.lastMessage?.createdAt || b.updatedAt;
    return new Date(bt) - new Date(at);
  });
}

const CHAT_SWIPE_LEFT_W = 136;
const CHAT_SWIPE_RIGHT_W = 88;
const CHAT_SWIPE_DELETE_OPEN = 120;
let openChatSwipeEl = null;

function getChatSwipeBaseOffset(row) {
  if (row.classList.contains('is-open-right')) return -CHAT_SWIPE_RIGHT_W;
  if (row.classList.contains('is-open-left')) return CHAT_SWIPE_LEFT_W;
  return 0;
}

function closeChatSwipe(row) {
  if (!row) return;
  row.classList.remove(
    'is-open',
    'is-open-left',
    'is-open-right',
    'is-swiping-left',
    'is-swiping-right',
    'is-delete-armed',
    'chat-swipe--removing',
  );
  const track = row.querySelector('.chat-swipe__track');
  if (track) {
    track.style.transform = '';
    track.style.transition = '';
    track.style.opacity = '';
  }
  if (openChatSwipeEl === row) openChatSwipeEl = null;
}

function closeAllChatSwipes() {
  document.querySelectorAll('.chat-swipe.is-open').forEach((row) => closeChatSwipe(row));
}

function chatListMetaIconsHtml(chat) {
  const items = [];
  if (chat.isPinned) {
    items.push('<span class="list-item__pin material-symbols-rounded" title="Закреплён">push_pin</span>');
  }
  if (chat.isMuted) {
    items.push('<span class="list-item__mute material-symbols-rounded" title="Без звука">notifications_off</span>');
  }
  if (!items.length) return '';
  return `<span class="list-item__meta-icons">${items.join('')}</span>`;
}

function chatListItemInnerHtml(chat) {
  const user = chat.otherUser;
  const name = user?.displayName || 'Пользователь';
  const preview = chat.lastMessage
    ? `${chat.lastMessage.isMine ? 'Вы: ' : ''}${chat.lastMessage.content}`
    : 'Нет сообщений';
  const time = chat.lastMessage ? formatListTime(chat.lastMessage.createdAt) : '';
  const unreadClass = chat.unreadCount > 0 ? ' list-item--unread' : '';
  const activeClass = state.currentChat?.id === chat.id ? ' list-item--active' : '';
  const pinnedClass = chat.isPinned ? ' list-item--pinned' : '';
  const mutedClass = chat.isMuted ? ' list-item--muted' : '';
  const badge = chat.unreadCount > 0
    ? `<span class="list-item__badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>`
    : '';
  const onlineDot = user?.isOnline ? '<span class="avatar-online-dot"></span>' : '';

  return `
    <div class="list-item ripple-host${unreadClass}${activeClass}${pinnedClass}${mutedClass}" role="button" tabindex="0">
      <div class="avatar-wrap">
        ${avatarHtml(user?.avatarUrl, name)}
        ${onlineDot}
      </div>
      <div class="list-item__content">
        <div class="list-item__top">
          <span class="list-item__title">${displayNameHtml(name, userNameBadges(user))}${chatListMetaIconsHtml(chat)}</span>
          <span class="list-item__time">${time}</span>
        </div>
        <div class="list-item__preview">${escapeHtml(preview)}</div>
      </div>
      ${badge}
    </div>`;
}

function chatListItemHtml(chat) {
  const pinLabel = chat.isPinned ? 'Открепить' : 'Закрепить';
  const muteLabel = chat.isMuted ? 'Звук вкл' : 'Без звука';
  const pinIcon = chat.isPinned ? 'push_pin' : 'push_pin';
  const muteIcon = chat.isMuted ? 'notifications' : 'notifications_off';

  return `
    <div class="chat-swipe" data-chat-id="${chat.id}">
      <div class="chat-swipe__actions chat-swipe__actions--left">
        <button type="button" class="chat-swipe__btn chat-swipe__btn--pin" data-chat-pin="${chat.id}" aria-label="${pinLabel}">
          <span class="material-symbols-rounded">${pinIcon}</span>
        </button>
        <button type="button" class="chat-swipe__btn chat-swipe__btn--mute" data-chat-mute="${chat.id}" aria-label="${muteLabel}">
          <span class="material-symbols-rounded">${muteIcon}</span>
        </button>
      </div>
      <div class="chat-swipe__actions chat-swipe__actions--right">
        <button type="button" class="chat-swipe__delete" data-chat-delete-open="${chat.id}" aria-label="Удалить чат">
          <span class="material-symbols-rounded">delete</span>
          <span class="chat-swipe__delete-hint">Отпустите</span>
        </button>
      </div>
      <div class="chat-swipe__track">
        ${chatListItemInnerHtml(chat)}
      </div>
    </div>`;
}

function updateNavUnreadBadge() {
  const chatsNav = floatingNav?.querySelector('[data-tab="chats"]');
  const total = getTotalUnread();
  syncDesktopRailBadge(total);
  if (!chatsNav) return;

  let badge = chatsNav.querySelector('.floating-nav__badge');

  if (total > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'floating-nav__badge';
      chatsNav.appendChild(badge);
    }
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.remove('hidden');
  } else if (badge) {
    badge.remove();
  }
}

function bindChatSwipe(row) {
  const track = row.querySelector('.chat-swipe__track');
  if (!track || track.dataset.swipeBound) return;
  track.dataset.swipeBound = '1';

  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let dragging = false;
  let axisLock = null;
  let lastOffset = 0;

  const clampOffset = (value) => Math.max(-CHAT_SWIPE_DELETE_OPEN, Math.min(CHAT_SWIPE_LEFT_W, value));

  track.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    baseX = getChatSwipeBaseOffset(row);
    dragging = true;
    axisLock = null;
    lastOffset = baseX;
    row.dataset.swipeMoved = '0';
    row.classList.remove('is-swiping-left', 'is-swiping-right', 'is-delete-armed');
    track.style.transition = 'none';
    if (openChatSwipeEl && openChatSwipeEl !== row) closeChatSwipe(openChatSwipeEl);
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!axisLock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisLock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axisLock !== 'x') return;

    const next = clampOffset(baseX + dx);
    lastOffset = next;
    track.style.transform = `translateX(${next}px)`;
    row.classList.toggle('is-swiping-right', next < -4);
    row.classList.toggle('is-swiping-left', next > 4);
    row.classList.toggle('is-delete-armed', next <= -CHAT_SWIPE_DELETE_OPEN + 4);
    if (Math.abs(dx) > 6) row.dataset.swipeMoved = '1';
  }, { passive: true });

  const endSwipe = async () => {
    if (!dragging) return;
    dragging = false;
    track.style.transition = '';
    const offset = lastOffset;
    track.style.transform = '';
    row.classList.remove('is-swiping-left', 'is-swiping-right', 'is-delete-armed');

    const chatId = parseInt(row.dataset.chatId, 10);

    if (offset <= -CHAT_SWIPE_DELETE_OPEN + 4) {
      closeChatSwipe(row);
      openChatDeleteSheet(chatId);
    } else if (offset <= -CHAT_SWIPE_RIGHT_W / 2) {
      row.classList.add('is-open-right');
      openChatSwipeEl = row;
    } else if (offset >= CHAT_SWIPE_LEFT_W / 2) {
      row.classList.add('is-open-left');
      openChatSwipeEl = row;
    } else {
      closeChatSwipe(row);
    }

    setTimeout(() => { row.dataset.swipeMoved = '0'; }, 0);
  };

  track.addEventListener('touchend', endSwipe);
  track.addEventListener('touchcancel', endSwipe);
}

function openChatDeleteSheet(chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  closeAllChatSwipes();
  closeChatContextMenu();
  const name = chat.otherUser?.displayName || 'Пользователь';
  const title = $('chat-delete-sheet-title');
  const subtitle = $('chat-delete-sheet-subtitle');
  if (title) title.textContent = 'Удалить чат?';
  if (subtitle) subtitle.textContent = `Диалог с ${name}`;
  openSheet('chat-delete-sheet');
  state.pendingChatDeleteId = chatId;
}

async function animateAndRemoveChat(chatId, row) {
  if (state.currentChat?.id === chatId) {
    await closeChatProfileIfOpen();
    stopChatStatusRefresh();
    if (isLayerVisible('chat')) {
      await popLayer();
    }
    state.currentChat = null;
    if (isDesktop()) {
      updateDesktopChatEmpty();
    }
  }

  state.chats = state.chats.filter((c) => c.id !== chatId);
  closeAllChatSwipes();

  if (row?.isConnected) {
    const height = row.offsetHeight;
    row.style.height = `${height}px`;
    row.style.overflow = 'hidden';
    row.classList.add('chat-swipe--removing');
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        row.style.transition = 'height 0.34s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease, transform 0.34s cubic-bezier(0.4, 0, 0.2, 1)';
        row.style.height = '0';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-18px) scale(0.98)';
        row.addEventListener('transitionend', resolve, { once: true });
        setTimeout(resolve, 380);
      });
    });
    row.remove();
  }

  const list = $('chat-list');
  if (!state.chats.length && list) {
    list.innerHTML = emptyChatsHtml();
  }
  updateNavUnreadBadge();
}

async function performChatDelete(scope) {
  const chatId = state.pendingChatDeleteId;
  if (!chatId) return;
  closeAllSheets();
  state.pendingChatDeleteId = null;

  const row = document.querySelector(`.chat-swipe[data-chat-id="${chatId}"]`);
  try {
    await api.deleteChat(chatId, scope);
    await animateAndRemoveChat(chatId, row);
    showSnackbar(scope === 'both' ? 'Чат удалён у обоих' : 'Чат удалён у вас');
  } catch (err) {
    showSnackbar(err.message);
  }
}

function bindChatListItem(row) {
  if (!row || row.dataset.boundChat) return;
  row.dataset.boundChat = '1';
  const chatId = parseInt(row.dataset.chatId, 10);
  const item = row.querySelector('.list-item');

  item?.addEventListener('click', () => {
    if (row.classList.contains('is-open-left') || row.classList.contains('is-open-right')) {
      closeChatSwipe(row);
      return;
    }
    if (row.dataset.swipeMoved === '1') return;
    const chat = state.chats.find((c) => c.id === chatId);
    openChat(chatId, chat?.otherUser);
  });

  row.querySelector('[data-chat-pin]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeChatSwipe(row);
    const chat = state.chats.find((c) => c.id === chatId);
    try {
      const { chat: updated } = await api.updateChatSettings(chatId, { isPinned: !chat?.isPinned });
      applyChatSettingsUpdate(updated);
      showSnackbar(updated.isPinned ? 'Чат закреплён' : 'Чат откреплён');
    } catch (err) {
      showSnackbar(err.message);
    }
  });

  row.querySelector('[data-chat-mute]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeChatSwipe(row);
    const chat = state.chats.find((c) => c.id === chatId);
    try {
      const { chat: updated } = await api.updateChatSettings(chatId, { isMuted: !chat?.isMuted });
      applyChatSettingsUpdate(updated);
      showSnackbar(updated.isMuted ? 'Уведомления отключены' : 'Уведомления включены');
    } catch (err) {
      showSnackbar(err.message);
    }
  });

  row.querySelector('[data-chat-delete-open]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openChatDeleteSheet(chatId);
  });

  if (!isDesktop()) {
    bindChatSwipe(row);
  } else {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openChatContextMenu(chatId, e.clientX, e.clientY);
    });
  }
}

function bindChatListItems(list = $('chat-list')) {
  list?.querySelectorAll('.chat-swipe[data-chat-id]').forEach((item) => {
    delete item.dataset.boundChat;
    const track = item.querySelector('.chat-swipe__track');
    if (track) delete track.dataset.swipeBound;
    bindChatListItem(item);
  });
}

function openChatContextMenu(chatId, x, y) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  closeAllChatSwipes();
  state.menuChatId = chatId;

  const preview = $('chat-context-menu-preview');
  const actions = $('chat-context-menu-actions');
  const panel = $('chat-context-menu-panel');
  if (!preview || !actions || !panel) return;

  preview.textContent = chat.otherUser?.displayName || 'Пользователь';
  actions.innerHTML = `
    <button type="button" class="chat-context-menu__action" data-chat-action="pin">
      <span class="material-symbols-rounded">push_pin</span>${chat.isPinned ? 'Открепить' : 'Закрепить'}
    </button>
    <button type="button" class="chat-context-menu__action" data-chat-action="mute">
      <span class="material-symbols-rounded">${chat.isMuted ? 'notifications' : 'notifications_off'}</span>${chat.isMuted ? 'Включить звук' : 'Без звука'}
    </button>
    <button type="button" class="chat-context-menu__action chat-context-menu__action--danger" data-chat-action="delete">
      <span class="material-symbols-rounded">delete</span>Удалить чат
    </button>
  `;

  const menu = $('chat-context-menu');
  menu?.classList.add('is-open');
  menu?.setAttribute('aria-hidden', 'false');

  const panelWidth = 240;
  const panelHeight = 168;
  const left = Math.min(Math.max(8, x), window.innerWidth - panelWidth - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - panelHeight - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function closeChatContextMenu() {
  const menu = $('chat-context-menu');
  menu?.classList.remove('is-open');
  menu?.setAttribute('aria-hidden', 'true');
  state.menuChatId = null;
}

async function handleChatMenuAction(action) {
  const chatId = state.menuChatId;
  if (!chatId) return;
  const chat = state.chats.find((c) => c.id === chatId);
  closeChatContextMenu();

  try {
    if (action === 'pin') {
      const { chat: updated } = await api.updateChatSettings(chatId, { isPinned: !chat?.isPinned });
      applyChatSettingsUpdate(updated);
      showSnackbar(updated.isPinned ? 'Чат закреплён' : 'Чат откреплён');
    } else if (action === 'mute') {
      const { chat: updated } = await api.updateChatSettings(chatId, { isMuted: !chat?.isMuted });
      applyChatSettingsUpdate(updated);
      showSnackbar(updated.isMuted ? 'Уведомления отключены' : 'Уведомления включены');
    } else if (action === 'delete') {
      openChatDeleteSheet(chatId);
    }
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function confirmDeleteChat(chatId) {
  openChatDeleteSheet(chatId);
}

function applyChatSettingsUpdate(chat) {
  const idx = state.chats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) state.chats[idx] = chat;
  else state.chats.push(chat);
  sortChatsInPlace(state.chats);
  if (tabPanels.chats?.classList.contains('active')) {
    renderChatsList();
  } else {
    updateNavUnreadBadge();
  }
}

async function removeChatFromLocalState(chatId) {
  const row = document.querySelector(`.chat-swipe[data-chat-id="${chatId}"]`);
  await animateAndRemoveChat(chatId, row);
}

function updateChatListItemEl(el, chat) {
  const inner = el.querySelector('.list-item');
  if (!inner) return;

  const user = chat.otherUser;
  const name = user?.displayName || 'Пользователь';
  const preview = chat.lastMessage
    ? `${chat.lastMessage.isMine ? 'Вы: ' : ''}${chat.lastMessage.content}`
    : 'Нет сообщений';
  const time = chat.lastMessage ? formatListTime(chat.lastMessage.createdAt) : '';

  inner.classList.toggle('list-item--unread', chat.unreadCount > 0);
  inner.classList.toggle('list-item--active', state.currentChat?.id === chat.id);
  inner.classList.toggle('list-item--pinned', Boolean(chat.isPinned));
  inner.classList.toggle('list-item--muted', Boolean(chat.isMuted));

  const titleEl = inner.querySelector('.list-item__title');
  if (titleEl) {
    titleEl.innerHTML = `${displayNameHtml(name, userNameBadges(user))}${chatListMetaIconsHtml(chat)}`;
  }

  const timeEl = inner.querySelector('.list-item__time');
  if (timeEl) timeEl.textContent = time;

  const previewEl = inner.querySelector('.list-item__preview');
  if (previewEl) previewEl.textContent = preview;

  const wrap = inner.querySelector('.avatar-wrap');
  if (wrap) {
    const dotHtml = user?.isOnline ? '<span class="avatar-online-dot"></span>' : '';
    const img = wrap.querySelector('.avatar img');
    const nextSrc = user?.avatarUrl ? cachedAvatarUrl(user.avatarUrl) : '';
    const avatarUnchanged = user?.avatarUrl
      ? img && img.getAttribute('src') === nextSrc
      : !img && wrap.querySelector('.avatar')?.textContent === (name || '?').charAt(0).toUpperCase();

    if (!avatarUnchanged) {
      wrap.innerHTML = `${avatarHtml(user?.avatarUrl, name)}${dotHtml}`;
    } else {
      const dot = wrap.querySelector('.avatar-online-dot');
      if (user?.isOnline && !dot) wrap.insertAdjacentHTML('beforeend', '<span class="avatar-online-dot"></span>');
      else if (!user?.isOnline && dot) dot.remove();
    }
  }

  let badge = inner.querySelector('.list-item__badge');
  if (chat.unreadCount > 0) {
    const text = chat.unreadCount > 99 ? '99+' : String(chat.unreadCount);
    if (badge) badge.textContent = text;
    else inner.insertAdjacentHTML('beforeend', `<span class="list-item__badge">${text}</span>`);
  } else {
    badge?.remove();
  }
}

function syncChatListOrder() {
  const list = $('chat-list');
  if (!list) return;
  for (let i = 0; i < state.chats.length; i++) {
    const el = list.querySelector(`[data-chat-id="${state.chats[i].id}"]`);
    if (!el) continue;
    const at = list.children[i];
    if (el !== at) list.insertBefore(el, at || null);
  }
}

function patchChatInList(chat) {
  const list = $('chat-list');
  if (!list) return;

  if (!state.chats.length) {
    list.innerHTML = emptyChatsHtml();
    updateNavUnreadBadge();
    return;
  }

  list.querySelector('.chat-list__empty')?.remove();

  let el = list.querySelector(`[data-chat-id="${chat.id}"]`);
  if (el) {
    updateChatListItemEl(el, chat);
  } else {
    const wrap = document.createElement('div');
    wrap.innerHTML = chatListItemHtml(chat).trim();
    el = wrap.firstElementChild;
    list.insertBefore(el, list.firstChild);
    bindChatListItem(el);
  }
  syncChatListOrder();
  updateNavUnreadBadge();
}

function renderChatsList() {
  const list = $('chat-list');
  if (!list) return;

  if (!state.chats.length) {
    list.innerHTML = emptyChatsHtml();
    updateNavUnreadBadge();
    return;
  }

  list.innerHTML = state.chats.map((chat) => chatListItemHtml(chat)).join('');
  bindChatListItems(list);
  updateNavUnreadBadge();
}

function upsertChatInList(chat) {
  const idx = state.chats.findIndex((c) => c.id === chat.id);
  const prevAvatar = idx >= 0 ? state.chats[idx].otherUser?.avatarUrl : null;
  if (idx >= 0) state.chats[idx] = chat;
  else state.chats.unshift(chat);

  if (prevAvatar && chat.otherUser?.avatarUrl && prevAvatar !== chat.otherUser.avatarUrl) {
    invalidateAvatarCache(prevAvatar);
  }

  sortChatsInPlace(state.chats);

  if (tabPanels.chats?.classList.contains('active')) {
    patchChatInList(chat);
  } else {
    updateNavUnreadBadge();
  }
}

async function loadChats() {
  const list = $('chat-list');
  if (!list) return;

  list.innerHTML = '<div class="chat-list__empty"><div class="spinner"></div></div>';

  try {
    const data = await api.getChats();
    if (data.serverTime) syncServerTime(data.serverTime);
    state.chats = data.chats || [];
    sortChatsInPlace(state.chats);
    renderChatsList();
  } catch (err) {
    list.innerHTML = `<div class="chat-list__empty"><p class="text-error">${escapeHtml(err.message)}</p></div>`;
  }
}

let statusRefreshTimer = null;

function startChatStatusRefresh() {
  clearInterval(statusRefreshTimer);
  statusRefreshTimer = setInterval(() => {
    if (state.currentChat?.otherUser && isLayerVisible('chat')) {
      updateChatHeader(state.currentChat.otherUser);
    }
  }, 30_000);
}

function stopChatStatusRefresh() {
  clearInterval(statusRefreshTimer);
  statusRefreshTimer = null;
}

function updateChatHeader(otherUser) {
  const name = otherUser?.displayName || 'Пользователь';
  setDisplayName($('chat-header-name'), name, userNameBadges(otherUser), 'header');
  renderAvatar($('chat-header-avatar'), otherUser?.avatarUrl, name);

  const statusEl = $('chat-header-status');
  const dot = $('chat-header-online-dot');
  if (statusEl) {
    statusEl.textContent = formatLastSeen(otherUser);
    statusEl.classList.toggle('chat-header__status--online', Boolean(otherUser?.isOnline && !otherUser?.lastSeenHidden));
  }
  if (dot) {
    dot.classList.toggle('hidden', !otherUser?.isOnline || otherUser?.lastSeenHidden);
  }
}

function renderMessageRow(m) {
  const msg = withReadStatus(m);
  rememberMessage(msg);
  const side = msg.isMine ? 'mine' : 'theirs';
  const mediaCls = msg.type === 'image' ? ' message-bubble--image' : msg.type === 'voice' ? ' message-bubble--voice' : '';
  const pendingCls = msg.isPending ? ' message-row--pending' : '';
  return `
    <div class="message-row message-row--${side}${pendingCls}" data-message-id="${msg.id}" data-created-at="${msg.createdAt}">
      <div class="message-bubble message-bubble--${side}${mediaCls}">
        ${replyQuoteHtml(msg.replyTo)}
        ${messageBodyHtml(msg)}
        <div class="message-bubble__footer">
          <span class="message-bubble__time">${formatMessageTime(msg.createdAt)}</span>
          ${readStatusHtml(msg)}
        </div>
      </div>
      ${reactionsHtml(msg.reactions)}
    </div>`;
}

function bindMessageRow(row) {
  if (!row) return;
  const bubble = row.querySelector('.message-bubble');
  if (!bubble || bubble.dataset.bound) return;
  bubble.dataset.bound = '1';

  const msgId = parseInt(row.dataset.messageId, 10);
  const msg = state.chatMessages.get(msgId);
  const isPending = Boolean(msg?.isPending);

  if (!isPending) {
    let pressTimer = null;
    const startPress = () => {
      pressTimer = setTimeout(() => openMessageMenu(row.dataset.messageId), 450);
    };
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    };

    bubble.addEventListener('touchstart', startPress, { passive: true });
    bubble.addEventListener('touchend', cancelPress);
    bubble.addEventListener('touchmove', cancelPress);
    bubble.addEventListener('touchcancel', cancelPress);
    bubble.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMessageMenu(row.dataset.messageId);
    });
  }

  row.querySelectorAll('[data-message-reaction]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReaction(row.dataset.messageId, btn.dataset.emoji);
    });
  });

  row.querySelector('[data-image-open]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageLightbox(e.currentTarget.dataset.imageOpen);
  });

  row.querySelector('[data-photo-retry]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    retryPendingPhoto(msgId);
  });

  bindVoicePlayer(row);
}

function bindAllMessageRows(container = $('chat-messages')) {
  container?.querySelectorAll('[data-message-id]').forEach(bindMessageRow);
}

function updateMessageRow(m) {
  rememberMessage(m);
  const row = document.querySelector(`[data-message-id="${m.id}"]`);
  if (!row) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMessageRow(m);
  const next = wrapper.firstElementChild;
  row.replaceWith(next);
  bindMessageRow(next);
}

function refreshAllReadStatuses() {
  state.chatMessages.forEach((m) => {
    if (!m.isMine) return;
    const row = document.querySelector(`[data-message-id="${m.id}"]`);
    if (!row) return;
    const status = row.querySelector('.message-bubble__status');
    if (!status) return;
    const isRead = computeReadStatusForMessage(m) === 'read';
    status.textContent = isRead ? 'done_all' : 'check';
    status.classList.toggle('message-bubble__status--read', isRead);
  });
}

function openMessageMenu(messageId) {
  const id = parseInt(messageId, 10);
  const m = state.chatMessages.get(id);
  if (!m || m.isDeleted || m.isPending) return;

  state.menuMessage = m;

  const preview = $('message-menu-preview');
  const actions = $('message-menu-actions');
  if (!preview || !actions) return;

  preview.textContent = m.content;
  preview.classList.toggle('message-menu__preview--mine', m.isMine);

  const isPinned = state.currentChat?.pinnedMessageId === id;
  const items = [];

  items.push(`
    <button type="button" class="message-menu__action" data-menu-action="reply">
      <span class="material-symbols-rounded">reply</span>Ответить
    </button>`);

  items.push(`
    <button type="button" class="message-menu__action" data-menu-action="pin">
      <span class="material-symbols-rounded">push_pin</span>${isPinned ? 'Открепить' : 'Закрепить'}
    </button>`);

  items.push(`
    <button type="button" class="message-menu__action" data-menu-action="copy">
      <span class="material-symbols-rounded">content_copy</span>Копировать
    </button>`);

  if (m.isMine) {
    items.push(`
      <button type="button" class="message-menu__action message-menu__action--danger" data-menu-action="delete">
        <span class="material-symbols-rounded">delete</span>Удалить
      </button>`);
  }

  actions.innerHTML = items.join('');

  const menu = $('message-menu');
  menu?.classList.add('is-open');
  menu?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
}

function closeMessageMenu() {
  const menu = $('message-menu');
  menu?.classList.remove('is-open');
  menu?.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.action-sheet.is-open')) {
    document.body.classList.remove('sheet-open');
  }
  state.menuMessage = null;
}

async function handleMenuAction(action) {
  const m = state.menuMessage;
  if (!m || !state.currentChat?.id) return;
  const chatId = state.currentChat.id;
  closeMessageMenu();

  try {
    if (action === 'reply') {
      setReplyTo(m);
    } else if (action === 'pin') {
      const isPinned = state.currentChat.pinnedMessageId === m.id;
      if (isPinned) {
        await api.unpinMessage(chatId);
      } else {
        await api.pinMessage(chatId, m.id);
      }
    } else if (action === 'copy') {
      if (m.type === 'voice') {
        showSnackbar('Голосовое сообщение нельзя скопировать');
        return;
      }
      const text = m.type === 'image'
        ? (m.rawContent && m.rawContent !== 'Фото' ? m.rawContent : '')
        : (m.rawContent || m.content);
      if (!text) {
        showSnackbar('Нечего копировать');
        return;
      }
      await navigator.clipboard.writeText(text);
      showSnackbar('Скопировано');
    } else if (action === 'delete') {
      if (!window.confirm('Удалить сообщение?')) return;
      await api.deleteMessage(chatId, m.id);
    }
  } catch (err) {
    showSnackbar(err.message);
  }
}

function setReplyTo(m) {
  state.replyTo = m;
  const bar = $('chat-reply-bar');
  const title = $('chat-reply-title');
  const text = $('chat-reply-text');
  if (!bar || !title || !text) return;
  title.textContent = m.isMine ? 'Вы' : (m.sender?.displayName || 'Ответ');
  text.textContent = m.content;
  bar.classList.remove('hidden');
  $('chat-input')?.focus();
}

function clearReplyTo() {
  state.replyTo = null;
  $('chat-reply-bar')?.classList.add('hidden');
}

function renderPinnedBar(pinned) {
  const bar = $('chat-pinned-bar');
  const text = $('chat-pinned-text');
  if (!bar || !text) return;

  if (!pinned) {
    bar.classList.add('hidden');
    text.textContent = '—';
    return;
  }

  text.textContent = pinned.content;
  bar.classList.remove('hidden');
}

function scrollToMessage(messageId) {
  const row = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('message-row--highlight');
  setTimeout(() => row.classList.remove('message-row--highlight'), 1200);
}

function openReactionSheet(messageId) {
  state.reactionMessageId = parseInt(messageId, 10);
  openSheet('reaction-sheet');
}

async function toggleReaction(messageId, emoji) {
  if (!state.currentChat?.id) return;
  try {
    const data = await api.toggleReaction(state.currentChat.id, parseInt(messageId, 10), emoji);
    updateMessageRow(data.message);
  } catch (err) {
    showSnackbar(err.message);
  }
}

function appendMessage(m, scroll = true) {
  const container = $('chat-messages');
  if (!container || state.loadedMessageIds.has(m.id)) return;

  state.loadedMessageIds.add(m.id);
  container.classList.remove('chat-room__messages--empty');

  const emptyEl = container.querySelector('.chat-room__empty');
  if (emptyEl) emptyEl.remove();
  removeChatOfficialNotice();

  ensureDateDividerBeforeMessage(container, m.createdAt);
  container.insertAdjacentHTML('beforeend', renderMessageRow(m));
  const row = container.querySelector(`[data-message-id="${m.id}"]`);
  bindMessageRow(row);
  initChatDateFloat(container);
  if (scroll) container.scrollTop = container.scrollHeight;
}

function revokePendingMedia(msg) {
  if (msg?.localMediaUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(msg.localMediaUrl);
  }
}

function removePendingMessage(tempId) {
  const msg = state.chatMessages.get(tempId);
  revokePendingMedia(msg);
  state.chatMessages.delete(tempId);
  state.loadedMessageIds.delete(tempId);
  document.querySelector(`[data-message-id="${tempId}"]`)?.remove();
  if (state.activePhotoUploadTempId === tempId) {
    state.activePhotoUploadTempId = null;
  }
}

function replacePendingMessage(tempId, realMessage) {
  const pending = state.chatMessages.get(tempId);
  revokePendingMedia(pending);
  state.chatMessages.delete(tempId);
  state.loadedMessageIds.delete(tempId);
  if (state.activePhotoUploadTempId === tempId) {
    state.activePhotoUploadTempId = null;
  }

  const existingReal = document.querySelector(`[data-message-id="${realMessage.id}"]`);
  if (existingReal) {
    document.querySelector(`[data-message-id="${tempId}"]`)?.remove();
    updateMessageRow(realMessage);
    return;
  }

  const row = document.querySelector(`[data-message-id="${tempId}"]`);
  rememberMessage(realMessage);
  state.loadedMessageIds.add(realMessage.id);
  if (!row) {
    appendMessage(realMessage);
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMessageRow(realMessage);
  row.replaceWith(wrapper.firstElementChild);
  bindMessageRow(wrapper.firstElementChild);
}

function createPendingImageMessage(file, caption, replyTo) {
  const objectUrl = URL.createObjectURL(file);
  const tempId = -Date.now();
  const cap = caption.trim();
  return {
    id: tempId,
    type: 'image',
    content: cap || 'Фото',
    rawContent: cap || 'Фото',
    mediaUrl: objectUrl,
    localMediaUrl: objectUrl,
    mimeType: file.type,
    createdAt: new Date().toISOString(),
    isMine: true,
    isDeleted: false,
    isPending: true,
    uploadState: 'uploading',
    readStatus: 'sending',
    reactions: [],
    replyTo: replyTo
      ? {
          id: replyTo.id,
          type: replyTo.type || 'text',
          content: replyTo.content,
          senderName: replyTo.isMine ? 'Вы' : (replyTo.sender?.displayName || 'Пользователь'),
          isMine: replyTo.isMine,
        }
      : null,
    sender: null,
    pendingFile: file,
    pendingReplyToId: replyTo?.id || null,
  };
}

function openPhotoCompose(file) {
  if (!file || !state.currentChat) return;
  closePhotoCompose();
  const objectUrl = URL.createObjectURL(file);
  state.photoCompose = { file, objectUrl, replyTo: state.replyTo };
  const panel = $('chat-photo-compose');
  const img = $('chat-photo-compose-img');
  const caption = $('chat-photo-compose-caption');
  if (img) img.src = objectUrl;
  if (caption) {
    caption.value = $('chat-input')?.value?.trim() || '';
    if ($('chat-input')) $('chat-input').value = '';
    caption.focus();
  }
  panel?.classList.remove('hidden');
  panel?.setAttribute('aria-hidden', 'false');
  $('chat-send-form')?.classList.add('hidden');
}

function closePhotoCompose() {
  const panel = $('chat-photo-compose');
  panel?.classList.add('hidden');
  panel?.setAttribute('aria-hidden', 'true');
  $('chat-send-form')?.classList.remove('hidden');
  if (state.photoCompose?.objectUrl) {
    URL.revokeObjectURL(state.photoCompose.objectUrl);
  }
  state.photoCompose = null;
  const caption = $('chat-photo-compose-caption');
  if (caption) caption.value = '';
  const img = $('chat-photo-compose-img');
  if (img) img.removeAttribute('src');
}

async function uploadPendingPhotoMessage(pending) {
  if (!pending?.pendingFile || !state.currentChat) return;
  state.activePhotoUploadTempId = pending.id;
  pending.uploadState = 'uploading';
  updateMessageRow(pending);

  try {
    const data = await api.sendMediaMessage(state.currentChat.id, pending.pendingFile, {
      type: 'image',
      content: pending.rawContent !== 'Фото' ? pending.rawContent : '',
      replyToId: pending.pendingReplyToId,
    });
    if (data.serverTime) syncServerTime(data.serverTime);
    replacePendingMessage(pending.id, data.message);
  } catch (err) {
    pending.uploadState = 'failed';
    state.activePhotoUploadTempId = null;
    updateMessageRow(pending);
    showSnackbar(err.message || 'Не удалось отправить фото');
  }
}

function confirmPhotoCompose() {
  const compose = state.photoCompose;
  if (!compose?.file || !state.currentChat) return;

  const caption = $('chat-photo-compose-caption')?.value?.trim() || '';
  const replyTo = compose.replyTo;
  closePhotoCompose();
  clearReplyTo();

  const pending = createPendingImageMessage(compose.file, caption, replyTo);
  appendMessage(pending);
  uploadPendingPhotoMessage(pending);
}

async function retryPendingPhoto(tempId) {
  const pending = state.chatMessages.get(tempId);
  if (!pending?.pendingFile || pending.uploadState !== 'failed') return;
  await uploadPendingPhotoMessage(pending);
}

function renderAllMessages(messages) {
  const container = $('chat-messages');
  if (!container) return;

  state.loadedMessageIds.clear();
  state.chatMessages.clear();

  if (!messages.length) {
    container.innerHTML = chatEmptyStateHtml();
    $('chat-date-float')?.classList.add('hidden');
    return;
  }

  state.loadedMessageIds = new Set(messages.map((m) => m.id));
  let lastDateKey = null;
  const parts = [];
  for (const m of messages) {
    const dk = chatDateKey(m.createdAt);
    if (dk !== lastDateKey) {
      parts.push(renderChatDateDivider(dk, formatChatDateLabel(m.createdAt)));
      lastDateKey = dk;
    }
    parts.push(renderMessageRow(m));
  }
  container.innerHTML = parts.join('');
  bindAllMessageRows(container);
  initChatDateFloat(container);
  container.scrollTop = container.scrollHeight;
}

function initRealtimeHandlers() {
  onRealtime('sync:time', (msg) => syncServerTime(msg.serverTime));
  onRealtime('pong', (msg) => syncServerTime(msg.serverTime));

  onRealtime('message:new', (msg) => {
    const inThisChat = state.currentChat?.id === msg.chatId && isLayerVisible('chat');

    if (inThisChat) {
      if (msg.message.isMine && state.activePhotoUploadTempId) {
        replacePendingMessage(state.activePhotoUploadTempId, msg.message);
      } else {
        appendMessage(msg.message);
      }
      markChatRead(msg.chatId);
      dismissNotificationsForChat(msg.chatId);
    }
    notifyIncomingMessage(msg);
  });

  onRealtime('message:update', (msg) => {
    if (state.currentChat?.id !== msg.chatId) return;
    if (!state.loadedMessageIds.has(msg.message.id)) return;
    updateMessageRow(msg.message);
  });

  onRealtime('pin:update', (msg) => {
    if (state.currentChat?.id !== msg.chatId) return;
    state.currentChat.pinnedMessageId = msg.pinnedMessageId;
    state.currentChat.pinnedMessage = msg.pinnedMessage;
    renderPinnedBar(msg.pinnedMessage);
  });

  onRealtime('messages:read', (msg) => {
    if (state.currentChat?.id !== msg.chatId) return;
    if (msg.userId === state.user?.id) return;
    state.currentChat.otherLastReadAt = msg.readAt;
    refreshAllReadStatuses();
  });

  onRealtime('chat:updated', (msg) => {
    if (!msg.chat) return;
    upsertChatInList(msg.chat);

    if (state.currentChat?.id === msg.chat.id) {
      state.currentChat.otherUser = msg.chat.otherUser;
      updateChatHeader(msg.chat.otherUser);
    }
  });

  onRealtime('chat:deleted', async (msg) => {
    if (!msg.chatId) return;
    const row = document.querySelector(`.chat-swipe[data-chat-id="${msg.chatId}"]`);
    await animateAndRemoveChat(msg.chatId, row);
  });

  onRealtime('reaction:update', (msg) => {
    if (state.currentChat?.id !== msg.chatId) return;
    if (!state.loadedMessageIds.has(msg.message.id)) return;
    updateMessageRow(msg.message);
  });

  onRealtime('wallet:updated', (msg) => {
    if (!msg.user || msg.user.id !== state.user?.id) return;
    applyUserUpdate(msg.user);
    notifyWalletEvent(msg);
    if (tabPanels.wallet?.classList.contains('active')) {
      loadWalletTab(true);
    }
    if (tabPanels.market?.classList.contains('active')) {
      loadMarketTab(true);
    }
  });

  onRealtime('session:logout', async (msg) => {
    const modalType = msg.banned ? 'banned' : msg.frozen ? 'frozen' : msg.passwordReset ? 'password' : null;
    if (msg.banned) {
      notifySystemAlert({ title: 'Аккаунт заблокирован', body: msg.reason || 'Аккаунт заблокирован', kind: 'banned' });
    } else if (msg.frozen) {
      notifySystemAlert({ title: 'Аккаунт заморожен', body: msg.reason || 'Аккаунт заморожен', kind: 'frozen' });
    } else if (msg.passwordReset) {
      notifySystemAlert({ title: 'Новый пароль', body: msg.reason || 'При входе задайте новый пароль', kind: 'password' });
    }
    await handleForcedLogout();
    if (modalType) {
      showAccountModal({
        type: modalType,
        message: msg.reason || undefined,
        reason: modalType === 'password' ? undefined : msg.reason,
      });
    } else if (msg.reason) {
      showAccountModal({
        type: 'session',
        message: msg.reason,
      });
    }
  });

  onRealtime('profile:updated', async () => {
    try {
      const data = await api.me();
      applyUserUpdate(data.user);
      if (data.user.needsUsernameChange) checkUsernameChangeNotice();
    } catch (err) {
      await handleForcedLogout();
      showAccountStatusFromError(err);
    }
  });

  onRealtime('inventory:updated', (msg) => {
    if (!msg.user || msg.user.id !== state.user?.id) return;
    applyUserUpdate(msg.user);
    if (tabPanels.market?.classList.contains('active')) {
      if (state.marketView === 'inventory') loadMarketInventory();
      else loadMarketTab(true);
    }
  });

  onRealtime('presence:update', (msg) => {
    let changed = false;

    state.chats = state.chats.map((chat) => {
      if (chat.otherUser?.id !== msg.userId) return chat;
      changed = true;
      return {
        ...chat,
        otherUser: {
          ...chat.otherUser,
          isOnline: msg.isOnline,
          lastSeenAt: msg.lastSeenAt,
        },
      };
    });

    if (state.viewingUser?.id === msg.userId) {
      state.viewingUser = {
        ...state.viewingUser,
        isOnline: msg.isOnline,
        lastSeenAt: msg.lastSeenAt,
      };
      if (isLayerVisible('userProfile')) {
        renderUserProfileScreen(state.viewingUser);
      }
    }

    if (changed) {
      if (tabPanels.chats?.classList.contains('active')) {
        const chat = state.chats.find((c) => c.otherUser?.id === msg.userId);
        if (chat) patchChatInList(chat);
      }
      if (state.currentChat?.otherUser?.id === msg.userId) {
        state.currentChat.otherUser = {
          ...state.currentChat.otherUser,
          isOnline: msg.isOnline,
          lastSeenAt: msg.lastSeenAt,
        };
        updateChatHeader(state.currentChat.otherUser);
      }
    }
  });
}

async function searchUsers(q) {
  const results = $('user-results');
  if (!results) return;

  results.innerHTML = '<div class="search-sheet__status"><div class="spinner" style="margin:0 auto"></div></div>';

  try {
    const { users } = await api.searchUsers(q);

    if (!users.length) {
      results.innerHTML = '<p class="search-sheet__status">Никого не найдено</p>';
      return;
    }

    results.innerHTML = users.map((user) => `
      <div class="user-results__item ripple-host" data-user-handle="${escapeHtml(getPublicHandle(user) || user.username || '')}">
        ${avatarHtml(user.avatarUrl, user.displayName)}
        <div class="user-results__info">
          <div class="user-results__name">${displayNameHtml(user.displayName, userNameBadges(user))}</div>
          <div class="user-results__username">${headerTagsHtml(user)}</div>
        </div>
        <button type="button" class="user-results__action" data-user-id="${user.id}">Написать</button>
      </div>
    `).join('');

    bindCollectibleInfoClicks(results);

    results.querySelectorAll('.user-results__item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-user-id]')) return;
        const handle = item.dataset.userHandle;
        if (!handle) return;
        setSearchOpen(false);
        openUserProfile(handle, 'main');
      });
    });

    results.querySelectorAll('[data-user-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const { chat } = await api.createChat(parseInt(btn.dataset.userId, 10));
          setSearchOpen(false);
          openChat(chat.id, chat.otherUser);
        } catch (err) {
          showSnackbar(err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    results.innerHTML = `<p class="search-sheet__status search-sheet__status--error">${escapeHtml(err.message)}</p>`;
  }
}

// ─── Комната чата ───

async function closeChatProfileIfOpen() {
  if (isLayerVisible('userProfile') && state.userProfileReturn === 'chat') {
    await closeUserProfile();
  }
}

async function openChat(chatId, otherUser = null) {
  await closeChatProfileIfOpen();
  state.currentChat = { id: chatId, otherUser, otherLastReadAt: null, pinnedMessageId: null, pinnedMessage: null };
  state.loadedMessageIds.clear();
  state.chatMessages.clear();
  clearReplyTo();
  closePhotoCompose();

  if (!otherUser) {
    const cached = state.chats.find((c) => c.id === chatId);
    otherUser = cached?.otherUser;
    state.currentChat.otherUser = otherUser;
  }

  if (!otherUser) {
    try {
      const data = await api.getChats();
      if (data.serverTime) syncServerTime(data.serverTime);
      state.chats = data.chats || [];
      const chat = state.chats.find((c) => c.id === chatId);
      otherUser = chat?.otherUser;
      state.currentChat.otherUser = otherUser;
    } catch { /* ignore */ }
  }

  updateChatHeader(otherUser);
  pushLayer('chat');
  if (isDesktop()) {
    const list = $('chat-list');
    list?.querySelectorAll('.list-item--active').forEach((el) => el.classList.remove('list-item--active'));
    list?.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('list-item--active');
    updateDesktopChatEmpty();
  }
  try {
    applyChatWallpaper(
      state.user
        ? { ...state.user, wallpaperSettings: getWallpaperSettingsForUser(state.user) }
        : null,
      $('screen-chat'),
    );
  } catch (err) {
    console.error('applyChatWallpaper failed:', err);
  }
  startChatStatusRefresh();
  await loadMessages(chatId);
  markChatRead(chatId);
  dismissNotificationsForChat(chatId);
  syncNotificationPresence();
}

$('chat-back')?.addEventListener('click', async () => {
  await closeChatProfileIfOpen();
  stopChatStatusRefresh();
  clearReplyTo();
  await popLayer();
  syncNotificationPresence();
  if (!isDesktop()) {
    switchTab('chats');
  } else {
    updateDesktopChatEmpty();
    renderChatsList();
  }
  loadChats();
});

$('chat-header-tap')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-premium-info]') || e.target.closest('[data-verified-info]')) return;
  const other = state.currentChat?.otherUser;
  if (!other) return;
  openUserProfile(other, 'chat');
});

$('user-profile-back')?.addEventListener('click', closeUserProfile);

$('user-profile-shared')?.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('[data-shared-tab]');
  if (!tabBtn) return;
  const tab = tabBtn.dataset.sharedTab;
  if (!tab || tab === state.userProfileSharedTab) return;
  loadUserProfileShared(tab);
});

$('user-profile-write')?.addEventListener('click', async () => {
  const u = state.viewingUser;
  if (!u?.id) return;
  try {
    const { chat } = await api.createChat(u.id);
    state.userProfileReturn = 'chat';
    openChat(chat.id, chat.otherUser);
  } catch (err) {
    showSnackbar(err.message);
  }
});

$('reaction-picker')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-emoji]');
  if (!btn || !state.reactionMessageId) return;
  closeAllSheets();
  await toggleReaction(state.reactionMessageId, btn.dataset.emoji);
  state.reactionMessageId = null;
});

$('message-menu-backdrop')?.addEventListener('click', closeMessageMenu);

$('message-menu-reactions')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-emoji]');
  if (!btn || !state.menuMessage) return;
  const messageId = state.menuMessage.id;
  closeMessageMenu();
  await toggleReaction(messageId, btn.dataset.emoji);
});

$('message-menu-actions')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu-action]');
  if (!btn) return;
  handleMenuAction(btn.dataset.menuAction);
});

$('chat-context-menu-backdrop')?.addEventListener('click', closeChatContextMenu);

$('chat-context-menu-actions')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-chat-action]');
  if (!btn) return;
  handleChatMenuAction(btn.dataset.chatAction);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.chat-context-menu__panel') && !e.target.closest('.chat-swipe')) {
    closeChatContextMenu();
  }
  if (!e.target.closest('.chat-swipe')) {
    closeAllChatSwipes();
  }
}, true);

$('chat-reply-close')?.addEventListener('click', clearReplyTo);

$('chat-pinned-close')?.addEventListener('click', async () => {
  if (!state.currentChat?.id) return;
  try {
    await api.unpinMessage(state.currentChat.id);
  } catch (err) {
    showSnackbar(err.message);
  }
});

$('chat-pinned-tap')?.addEventListener('click', () => {
  const id = state.currentChat?.pinnedMessageId;
  if (id) scrollToMessage(id);
});

async function loadMessages(chatId) {
  const container = $('chat-messages');
  container.innerHTML = '<div class="chat-room__loading"><div class="spinner"></div></div>';

  try {
    const data = await api.getMessages(chatId);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (state.currentChat?.id === chatId) {
      state.currentChat.otherLastReadAt = data.otherLastReadAt || null;
      state.currentChat.pinnedMessageId = data.pinnedMessageId || null;
      state.currentChat.pinnedMessage = data.pinnedMessage || null;
      renderPinnedBar(data.pinnedMessage);
    }
    renderAllMessages(data.messages || []);
    markChatRead(chatId);
    dismissNotificationsForChat(chatId);
  } catch (err) {
    container.innerHTML = `<p class="text-error chat-room__error">${escapeHtml(err.message)}</p>`;
  }
}

$('chat-send-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const content = input?.value?.trim() || '';
  if (!content || !state.currentChat) return;

  input.value = '';
  const chatId = state.currentChat.id;
  const replyToId = state.replyTo?.id || null;
  clearReplyTo();

  try {
    const data = await api.sendMessage(chatId, content, replyToId);
    if (data.serverTime) syncServerTime(data.serverTime);
    appendMessage(data.message);
  } catch (err) {
    if (input) input.value = content;
    showSnackbar(err.message);
  }
});

$('chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('chat-send-form')?.requestSubmit();
  }
});

async function sendChatPhoto(file) {
  openPhotoCompose(file);
}

$('chat-photo-compose-cancel')?.addEventListener('click', closePhotoCompose);

$('chat-photo-compose-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  confirmPhotoCompose();
});

$('chat-photo-input')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) sendChatPhoto(file);
});

function updateVoiceRecordingUi(seconds) {
  const panel = $('chat-voice-recording');
  const timeEl = $('chat-voice-recording-time');
  const micBtn = $('chat-mic-btn');
  if (timeEl) timeEl.textContent = formatVoiceDuration(seconds);
  panel?.classList.toggle('hidden', !chatVoiceRecording.active);
  micBtn?.classList.toggle('chat-input__mic--active', chatVoiceRecording.active);
}

function stopVoiceRecordingTimer() {
  clearInterval(chatVoiceRecording.timer);
  chatVoiceRecording.timer = null;
}

function cleanupVoiceRecording() {
  stopVoiceRecordingTimer();
  if (chatVoiceRecording.recorder && chatVoiceRecording.recorder.state !== 'inactive') {
    try { chatVoiceRecording.recorder.stop(); } catch { /* ignore */ }
  }
  chatVoiceRecording.stream?.getTracks().forEach((t) => t.stop());
  chatVoiceRecording.recorder = null;
  chatVoiceRecording.stream = null;
  chatVoiceRecording.chunks = [];
  chatVoiceRecording.active = false;
  chatVoiceRecording.cancelled = false;
  updateVoiceRecordingUi(0);
}

async function finishVoiceRecording(send) {
  if (!chatVoiceRecording.active) return;
  const recorder = chatVoiceRecording.recorder;
  const cancelled = chatVoiceRecording.cancelled;
  const duration = Math.max(1, Math.round((Date.now() - chatVoiceRecording.startedAt) / 1000));
  chatVoiceRecording.active = false;
  updateVoiceRecordingUi(0);

  if (!recorder || recorder.state === 'inactive') {
    cleanupVoiceRecording();
    return;
  }

  const done = new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
  });
  recorder.stop();
  await done;

  const blob = new Blob(chatVoiceRecording.chunks, { type: recorder.mimeType || 'audio/webm' });
  cleanupVoiceRecording();

  if (cancelled || blob.size < 1 || !state.currentChat) return;
  if (duration < 1) {
    showSnackbar('Слишком короткое сообщение');
    return;
  }

  const chatId = state.currentChat.id;
  const replyToId = state.replyTo?.id || null;
  clearReplyTo();
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
  try {
    const data = await api.sendMediaMessage(chatId, file, {
      type: 'voice',
      replyToId,
      duration,
    });
    if (data.serverTime) syncServerTime(data.serverTime);
    appendMessage(data.message);
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function startVoiceRecording(clientX = 0) {
  if (!state.currentChat || chatVoiceRecording.active) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    showSnackbar('Микрофон недоступен');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chatVoiceRecording.stream = stream;
    chatVoiceRecording.recorder = recorder;
    chatVoiceRecording.chunks = [];
    chatVoiceRecording.startedAt = Date.now();
    chatVoiceRecording.startX = clientX;
    chatVoiceRecording.cancelled = false;
    chatVoiceRecording.active = true;

    recorder.addEventListener('dataavailable', (e) => {
      if (e.data?.size) chatVoiceRecording.chunks.push(e.data);
    });
    recorder.start();
    updateVoiceRecordingUi(0);
    stopVoiceRecordingTimer();
    chatVoiceRecording.timer = setInterval(() => {
      const sec = Math.round((Date.now() - chatVoiceRecording.startedAt) / 1000);
      updateVoiceRecordingUi(sec);
      if (sec >= 300) finishVoiceRecording(true);
    }, 200);
  } catch {
    showSnackbar('Нет доступа к микрофону');
    cleanupVoiceRecording();
  }
}

$('chat-attach-btn')?.addEventListener('click', () => {
  $('chat-photo-input')?.click();
});

$('chat-photo-input')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) sendChatPhoto(file);
});

const micBtn = $('chat-mic-btn');
micBtn?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  micBtn.setPointerCapture(e.pointerId);
  startVoiceRecording(e.clientX);
});

micBtn?.addEventListener('pointermove', (e) => {
  if (!chatVoiceRecording.active) return;
  chatVoiceRecording.cancelled = e.clientX < chatVoiceRecording.startX - 72;
  $('chat-voice-recording')?.classList.toggle('chat-voice-recording--cancel', chatVoiceRecording.cancelled);
});

micBtn?.addEventListener('pointerup', (e) => {
  if (!chatVoiceRecording.active) return;
  e.preventDefault();
  finishVoiceRecording(!chatVoiceRecording.cancelled);
});

micBtn?.addEventListener('pointercancel', () => {
  if (!chatVoiceRecording.active) return;
  chatVoiceRecording.cancelled = true;
  finishVoiceRecording(false);
});

// ─── Профиль (вкладка + редактирование) ───

const THEME_LABELS = { auto: 'Как в системе', light: 'Светлая', dark: 'Тёмная' };
const THEME_CYCLE = ['auto', 'light', 'dark'];

function resolveThemeMode(mode) {
  if (mode === 'dark' || mode === 'light') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  state.theme = mode;
  const resolved = resolveThemeMode(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-mode', mode);
  localStorage.setItem('ferom-theme', mode);
  const label = $('theme-label');
  if (label) label.textContent = THEME_LABELS[mode];
  applyCosmetics();
}

function initTheme() {
  const saved = localStorage.getItem('ferom-theme') || 'auto';
  applyTheme(saved);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme('auto');
  });
}

function loadProfileTab() {
  if (!state.user) return;

  checkUsernameChangeNotice();

  renderAvatar($('profile-avatar'), state.user.avatarUrl, state.user.displayName);
  setDisplayName($('profile-display-name'), state.user.displayName, userNameBadges(state.user));
  setUsername($('profile-username'), state.user, { mode: 'hero' });

  syncCoverGradients();

  const bioEl = $('profile-bio');
  if (bioEl) {
    const bio = (state.user.bio || '').trim();
    if (bio) {
      bioEl.textContent = bio;
      bioEl.classList.remove('hidden');
    } else {
      bioEl.textContent = '';
      bioEl.classList.add('hidden');
    }
  }

  const hintName = $('profile-hint-name');
  const hintUsername = $('profile-hint-username');
  if (hintName) hintName.textContent = state.user.displayName || 'Не задано';
  if (hintUsername) hintUsername.innerHTML = settingsUsernameHtml(state.user);

  const profileEmailValue = $('profile-email-value');
  const profileEmailStatus = $('profile-email-status');
  if (profileEmailValue) profileEmailValue.textContent = state.user.email || '—';
  renderEmailStatus(profileEmailStatus, state.user.emailVerified);

  updateMintCollectibleRow();
  syncAdminButton(state.user);
}

function getWallpaperSettingsForUser(user) {
  if (!user) return null;
  let s = user.wallpaperSettings;
  if (typeof s === 'string') {
    try {
      s = JSON.parse(s);
    } catch {
      s = null;
    }
  }
  if (s?.patternId || s?.gradientId || (s?.variant && WALLPAPER_VARIANTS[s.variant]?.gradientId)) {
    return syncWallpaperDraftVariant({ ...s });
  }
  if (user.activeWallpaperId) return defaultWallpaperDraft(user, user.activeWallpaperId);
  return null;
}

function applyCosmetics() {
  const u = state.user;
  const root = document.documentElement;

  if (u?.activeThemeId) {
    root.setAttribute('data-app-theme', u.activeThemeId);
  } else {
    root.removeAttribute('data-app-theme');
  }

  try {
    applyChatWallpaper(
      u ? { ...u, wallpaperSettings: getWallpaperSettingsForUser(u) } : null,
      $('screen-chat'),
    );
  } catch (err) {
    console.error('applyChatWallpaper failed:', err);
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const styles = getComputedStyle(root);
    metaTheme.setAttribute('content', styles.getPropertyValue('--md-sys-color-primary').trim() || '#6750a4');
  }
}

function switchMarketView(view) {
  state.marketView = view;
  document.querySelectorAll('[data-market-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.marketView === view);
  });
  $('market-cosmetics-view')?.classList.toggle('hidden', view !== 'cosmetics');
  $('market-tags-view')?.classList.toggle('hidden', view !== 'tags');
  $('market-inventory-view')?.classList.toggle('hidden', view !== 'inventory');
  if (view === 'inventory') loadMarketInventory();
  else if (view === 'tags') {
    if (state.market?.tags) renderMarketTags(state.market.tags);
    else loadMarketTab(true);
  } else if (view === 'cosmetics') {
    if (state.market?.sections) renderMarketCosmetics(state.market.sections);
    else loadMarketTab(true);
  }
}

function loadMarketTab(silent = false) {
  if (!state.user) return;

  const balanceText = $('market-balance-text');
  if (balanceText) balanceText.textContent = formatRubies(state.user.walletBalance ?? 0);

  const sectionsEl = $('market-sections');
  const tagsEl = $('market-tags-listings');
  if (!silent) {
    if (sectionsEl && state.marketView === 'cosmetics') {
      sectionsEl.innerHTML = '<div class="inventory-empty"><div class="spinner" style="margin:0 auto"></div></div>';
    }
    if (tagsEl && state.marketView === 'tags') {
      tagsEl.innerHTML = '<div class="inventory-empty"><div class="spinner" style="margin:0 auto"></div></div>';
    }
  }

  api.getMarket({ sort: state.tagsSort })
    .then((data) => {
      if (data.serverTime) syncServerTime(data.serverTime);
      state.market = data;
      syncOwnedWallpaperIds();
      if (state.user && data.tags) {
        state.user.canMintCollectible = data.tags.canMint;
        if (data.tags.mintPreview) state.user.mintPreview = data.tags.mintPreview;
        updateMintCollectibleRow();
      }
      if (balanceText) balanceText.textContent = formatRubies(data.balance ?? 0);
      if (state.marketView === 'cosmetics') renderMarketCosmetics(data.sections || []);
      else if (state.marketView === 'tags') renderMarketTags(data.tags);
    })
    .catch((err) => {
      const target = state.marketView === 'tags' ? tagsEl : sectionsEl;
      if (target) {
        target.innerHTML = `
          <div class="inventory-empty">
            <span class="material-symbols-rounded">error</span>
            <p class="text-error">${escapeHtml(err.message)}</p>
            <button type="button" class="btn btn--primary" id="market-retry-btn" style="margin-top:12px">Повторить</button>
          </div>`;
        $('market-retry-btn')?.addEventListener('click', () => loadMarketTab());
      }
      showSnackbar(err.message);
    });
}

function tileBtn(full, short, className, attrs = '') {
  const s = short || full;
  return `<button type="button" class="${className}" ${attrs}><span class="tile-btn-full">${escapeHtml(full)}</span><span class="tile-btn-short">${escapeHtml(s)}</span></button>`;
}

function inventoryCollectibleSlug(el) {
  const row = el?.closest?.('.inventory-item--collectible');
  return row?.getAttribute('data-collectible-slug')
    || el?.getAttribute?.('data-collectible-slug')
    || null;
}

function marketCardHtml(p) {
  const previewCls = p.preview || p.iconColor || 'purple';
  const isAppTheme = p.category === 'themes';
  const isPremiumStyle = p.premiumStyle || isGradientWallpaperProduct(p.id);
  const isPatternWallpaper = p.category === 'wallpapers' && previewCls && !isPremiumStyle;
  const cardCls = [
    'market-card',
    'ripple-host',
    p.owned ? 'market-card--owned' : '',
    p.equipped ? 'market-card--equipped' : '',
    isPremiumStyle ? 'market-card--premium-style' : '',
  ].filter(Boolean).join(' ');

  let footer = '';
  if (p.owned && p.equippable) {
    const customizeBtn = p.category === 'wallpapers'
      ? tileBtn('Настроить', '⚙', 'market-card__action market-card__action--settings', `data-wallpaper-customize="${p.id}"`)
      : '';
    footer = p.equipped
      ? `${customizeBtn}${tileBtn('Снять', 'Снять', 'market-card__action market-card__action--secondary', `data-unequip-product="${p.id}"`)}`
      : `${customizeBtn}${tileBtn('Применить', 'Взять', 'market-card__action market-card__action--secondary', `data-equip-product="${p.id}"`)}`;
  } else if (p.owned) {
    footer = '<span class="market-card__owned-label">В инвентаре</span>';
  } else {
    const priceHtml = p.free || p.price === 0
      ? '<span class="market-card__price market-card__price--free">Бесплатно</span>'
      : `<span class="market-card__price"><span class="material-symbols-rounded">diamond</span>${formatRubies(p.price)}</span>`;
    const buyLabel = p.free || p.price === 0 ? 'Применить' : 'Купить';
    const buyShort = p.free || p.price === 0 ? 'Взять' : 'Купить';
    footer = `${priceHtml}${tileBtn(buyLabel, buyShort, 'market-card__action', `data-buy-product="${p.id}"`)}`;
  }

  const premiumBadge = isPremiumStyle ? '<span class="market-card__premium-badge">✦ Premium</span>' : '';
  const previewIcon = isAppTheme
    ? `<span class="theme-preview-swatch theme-preview-swatch--${previewCls}"></span>`
    : isPatternWallpaper
      ? ''
      : `<span class="material-symbols-rounded">${escapeHtml(p.icon)}</span>`;

  return `
    <div class="${cardCls}" data-product-id="${p.id}" id="market-product-${p.id}">
      <div class="market-card__preview market-card__preview--${previewCls}${isAppTheme ? ' market-card__preview--theme' : ''}${isPatternWallpaper ? ' market-card__preview--pattern' : ''}${isPremiumStyle ? ' market-card__preview--premium-style' : ''}">
        ${previewIcon}
        ${premiumBadge}
        ${p.equipped ? '<span class="market-card__badge">ON</span>' : ''}
      </div>
      <div class="market-card__body">
        <div class="market-card__title">${escapeHtml(p.title)}</div>
        <div class="market-card__desc">${escapeHtml(p.description)}</div>
        <div class="market-card__footer">${footer}</div>
      </div>
    </div>`;
}

function listingCardHtml(c) {
  const handleHtml = `<span class="collectible-username collectible-username--${escapeHtml(c.styleId)}">@${escapeHtml(c.slug)}</span>`;
  const seller = c.owner ? escapeHtml(c.owner.displayName || c.owner.username) : '';
  return `
    <div class="collectible-card collectible-card--listing ripple-host">
      <div class="collectible-card__hero collectible-card__hero--${escapeHtml(c.styleId)}">
        <span class="collectible-card__rarity">${rarityPillHtml(c.rarity, c.rarityLabel)}</span>
        <button type="button" class="collectible-card__handle collectible-tag-link" data-collectible-info="${escapeHtml(c.slug)}">${handleHtml}</button>
      </div>
      <div class="collectible-card__body">
        ${seller ? `<div class="collectible-card__owner" title="Продавец: ${seller}">${seller}</div>` : ''}
        <div class="collectible-card__footer">
          <span class="market-card__price"><span class="material-symbols-rounded">diamond</span>${formatRubies(c.listPrice || c.price)}</span>
          ${tileBtn('Купить', 'Купить', 'market-card__action', `data-buy-collectible="${escapeHtml(c.slug)}"`)}
        </div>
      </div>
    </div>`;
}

function renderMarketCosmetics(sections) {
  const el = $('market-sections');
  if (!el) return;

  if (!sections.length) {
    el.innerHTML = '<div class="inventory-empty">Каталог пуст</div>';
    return;
  }

  el.innerHTML = sections.map((sec) => {
    if (sec.id !== 'wallpapers') {
      return `
        <section class="market-section">
          <div class="market-section__head">
            <div class="market-section__icon"><span class="material-symbols-rounded">${escapeHtml(sec.icon)}</span></div>
            <div>
              <h2 class="market-section__title">${escapeHtml(sec.title)}</h2>
              <p class="market-section__subtitle">${escapeHtml(sec.subtitle)}</p>
            </div>
          </div>
          <div class="market-grid">
            ${(sec.products || []).map(marketCardHtml).join('')}
          </div>
        </section>`;
    }

    const products = sec.products || [];
    const premiumStyles = products.filter((p) => p.premiumStyle || isGradientWallpaperProduct(p.id));
    const patterns = products.filter((p) => !p.premiumStyle && !isGradientWallpaperProduct(p.id));

    return `
      <section class="market-section">
        <div class="market-section__head">
          <div class="market-section__icon"><span class="material-symbols-rounded">${escapeHtml(sec.icon)}</span></div>
          <div>
            <h2 class="market-section__title">${escapeHtml(sec.title)}</h2>
            <p class="market-section__subtitle">${escapeHtml(sec.subtitle)}</p>
          </div>
        </div>

        <div class="market-subsection">
          <h3 class="market-subsection__title">Премиум-фоны ✦</h3>
          <p class="market-subsection__hint">Градиентные фоны — покупаются один раз, настраиваются с любым узором</p>
          <div class="market-grid market-grid--premium">
            ${premiumStyles.length ? premiumStyles.map(marketCardHtml).join('') : '<p class="market-subsection__empty">Скоро появятся</p>'}
          </div>
        </div>

        <div class="market-subsection">
          <h3 class="market-subsection__title">Узоры</h3>
          <p class="market-subsection__hint">Паттерны поверх выбранного фона чата</p>
          <div class="market-grid">
            ${patterns.map(marketCardHtml).join('')}
          </div>
        </div>
      </section>`;
  }).join('');
}

function renderMarketTags(tags) {
  const toolbar = $('market-tags-toolbar');
  const el = $('market-tags-listings');
  if (!toolbar || !el) return;

  const sort = tags?.sort || state.tagsSort;
  const sortOptions = tags?.sortOptions || [];

  let toolbarHtml = '<div class="market-tags-bar">';
  toolbarHtml += '<div class="market-sort-chips">';
  toolbarHtml += sortOptions.map((opt) =>
    `<button type="button" class="market-sort-chip ripple-host${opt.id === sort ? ' active' : ''}" data-tags-sort="${escapeHtml(opt.id)}">${escapeHtml(opt.label)}</button>`
  ).join('');
  toolbarHtml += '</div>';

  const listings = tags?.listings || [];
  const canMint = tags?.canMint || state.user?.canMintCollectible;

  if (canMint && state.user?.username) {
    toolbarHtml += `<button type="button" class="market-mint-btn market-mint-btn--prominent ripple-host" id="btn-open-mint-sheet">
      <span class="material-symbols-rounded">verified</span>
      <span>Сделать @${escapeHtml(state.user.username)} коллекционным</span>
    </button>`;
  }

  toolbarHtml += '</div>';
  toolbar.innerHTML = toolbarHtml;

  $('btn-open-mint-sheet')?.addEventListener('click', openMintSheet);
  toolbar.querySelectorAll('[data-tags-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tagsSort;
      if (next === state.tagsSort) return;
      state.tagsSort = next;
      loadMarketTab(true);
    });
  });

  if (!listings.length) {
    el.innerHTML = `
      <div class="inventory-empty">
        <span class="material-symbols-rounded">sell</span>
        <p>Пока никто не выставил @ теги</p>
        ${canMint ? '' : '<p class="text-muted" style="margin-top:6px;font-size:0.875rem">Купите коллекционный @ на маркете</p>'}
      </div>`;
    return;
  }

  el.innerHTML = `<div class="collectible-grid">${listings.map(listingCardHtml).join('')}</div>`;
}

async function loadMarketInventory() {
  const el = $('market-inventory');
  if (!el) return;

  el.innerHTML = '<div class="inventory-empty"><div class="spinner" style="margin:0 auto"></div></div>';

  try {
    const data = await api.getInventory();
    if (data.serverTime) syncServerTime(data.serverTime);
    renderMarketInventory(data);
  } catch (err) {
    el.innerHTML = `<div class="inventory-empty"><p class="text-error">${escapeHtml(err.message)}</p></div>`;
  }
}

function renderMarketInventory(data) {
  const el = $('market-inventory');
  if (!el) return;

  const grouped = data.grouped || [];
  if (!grouped.length) {
    el.innerHTML = `
      <div class="inventory-empty">
        <span class="material-symbols-rounded">inventory_2</span>
        <p>Пока пусто</p>
        <p class="text-muted" style="margin-top:6px;font-size:0.875rem">Купите товары в магазине</p>
      </div>`;
    return;
  }

  const maxEquipped = data.maxEquipped || 16;
  const equippedCount = data.equippedTagSlugs?.length
    || data.collectibles?.filter((c) => c.equipped).length
    || 0;

  let headerHtml = '';
  if (data.collectibles?.length) {
    headerHtml = `<p class="inventory-tags-hint">Применено ${equippedCount} из ${maxEquipped} коллекционных @ · обычный username задаётся в профиле</p>`;
  }

  el.innerHTML = headerHtml + grouped.map((g) => `
    <section class="inventory-group">
    <h3 class="inventory-group__title">${escapeHtml(g.title)}</h3>
    <div class="inventory-list">
      ${g.items.map((item) => {
        if (item.slug) {
          const handle = `<button type="button" class="collectible-tag-link" data-collectible-info="${escapeHtml(item.slug)}"><span class="collectible-username collectible-username--${escapeHtml(item.styleId)}">@${escapeHtml(item.slug)}</span></button>`;
          let meta = '';
          if (item.isPrimary) meta = 'Основной';
          else if (item.equipped) meta = 'Применён';
          else meta = 'В инвентаре';
          if (item.listed) meta = `Продажа · ${formatRubies(item.listPrice)}`;

          const badges = [
            item.equipped ? '<span class="inventory-tile__badge">ON</span>' : '',
            item.isPrimary ? '<span class="inventory-tile__badge inventory-tile__badge--star">★</span>' : '',
            item.listed ? '<span class="inventory-tile__badge inventory-tile__badge--sale">$</span>' : '',
          ].filter(Boolean).join('');

          const actions = [];
          if (item.listed) {
            actions.push(tileBtn('Снять с маркета', 'Снять', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-unlist-collectible="${escapeHtml(item.slug)}"`));
          } else {
            actions.push(tileBtn('На маркет', 'Маркет', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-open-list-collectible="${escapeHtml(item.slug)}"`));
          }
          if (item.equipped) {
            if (!item.isPrimary) {
              actions.push(tileBtn('Основной', '★', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-set-primary-collectible="${escapeHtml(item.slug)}"`));
            }
            actions.push(tileBtn('Снять', 'Снять', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-unequip-collectible="${escapeHtml(item.slug)}"`));
          } else {
            actions.push(tileBtn('Применить', 'Взять', 'inventory-item__btn ripple-host', `data-equip-collectible="${escapeHtml(item.slug)}"`));
          }

          return `
        <div class="inventory-item inventory-item--collectible${item.equipped ? ' inventory-item--equipped' : ''}${item.isPrimary ? ' inventory-item--primary' : ''}" data-collectible-slug="${escapeHtml(item.slug)}">
          <div class="inventory-item__thumb">
            <div class="inventory-collectible-icon collectible-card__hero--${escapeHtml(item.styleId)}">${handle}</div>
            ${badges}
          </div>
          <div class="inventory-item__body">
            <div class="inventory-item__title"><span class="inventory-item__slug-label">@${escapeHtml(item.slug)}</span> ${rarityPillHtml(item.rarity, item.rarityLabel)}</div>
            <div class="inventory-item__meta">${escapeHtml(meta)}</div>
          </div>
          <div class="inventory-item__actions">${actions.join('')}</div>
        </div>`;
        }
        const previewCls = item.preview || item.iconColor || 'purple';
        const isAppTheme = item.category === 'themes';
        const previewInner = isAppTheme
          ? `<span class="theme-preview-swatch theme-preview-swatch--${previewCls}"></span>`
          : `<span class="material-symbols-rounded">${escapeHtml(item.icon)}</span>`;
        const equippedBadge = item.equipped ? '<span class="inventory-tile__badge">ON</span>' : '';
        return `
        <div class="inventory-item inventory-item--product${item.equipped ? ' inventory-item--equipped' : ''}">
          <div class="inventory-item__thumb">
            <div class="inventory-item__icon market-card__preview market-card__preview--${previewCls}${isAppTheme ? ' market-card__preview--theme' : ''}">
              ${previewInner}
            </div>
            ${equippedBadge}
          </div>
          <div class="inventory-item__body">
            <div class="inventory-item__title">${escapeHtml(item.title)}</div>
            <div class="inventory-item__meta">${item.equipped ? 'Применено' : 'В коллекции'}</div>
          </div>
          ${item.equippable
            ? (item.category === 'wallpapers'
              ? `<div class="inventory-item__actions">
                  ${tileBtn('Настроить', '⚙', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-wallpaper-customize="${item.id}"`)}
                  ${item.equipped
                    ? tileBtn('Снять', 'Снять', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-unequip-product="${item.id}"`)
                    : tileBtn('Применить', 'Взять', 'inventory-item__btn ripple-host', `data-equip-product="${item.id}"`)}
                </div>`
              : `<div class="inventory-item__actions">${item.equipped
                ? tileBtn('Снять', 'Снять', 'inventory-item__btn inventory-item__btn--ghost ripple-host', `data-unequip-product="${item.id}"`)
                : tileBtn('Применить', 'Взять', 'inventory-item__btn ripple-host', `data-equip-product="${item.id}"`)}</div>`)
            : '<div class="inventory-item__actions"><span class="inventory-item__btn inventory-item__btn--ghost inventory-item__btn--disabled">—</span></div>'}
        </div>`;
      }).join('')}
    </div>
    </section>
  `).join('');

  bindCollectibleInfoClicks(el);
}

async function purchaseMarketProduct(productId) {
  const product = state.market?.sections
    ?.flatMap((s) => s.products || [])
    .find((p) => p.id === productId);

  if (product?.free || product?.price === 0) {
    return equipMarketProduct(productId);
  }

  try {
    const data = await api.purchaseProduct(productId);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();

    if (isGradientWallpaperProduct(productId)) {
      await equipMarketProduct(productId);
      if (isLayerVisible('chat') || $('wallpaper-customize-sheet')?.classList.contains('is-open')) {
        openWallpaperCustomize(productId);
      }
      showSnackbar('Премиум-фон куплен и применён');
      return;
    }

    showSnackbar('Покупка успешна — предмет в инвентаре');
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function equipMarketProduct(productId) {
  try {
    const data = await api.equipProduct(productId);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar('Применено');
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function unequipMarketProduct(productId) {
  try {
    const data = await api.unequipProduct(productId);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar('Снято');
  } catch (err) {
    showSnackbar(err.message);
  }
}

function syncOwnedWallpaperIds() {
  const ids = new Set();
  (state.market?.sections || []).forEach((section) => {
    if (section.id !== 'wallpapers') return;
    (section.products || []).forEach((p) => {
      if (p.owned || p.free) ids.add(p.id);
    });
  });
  state.ownedWallpaperIds = ids;
}

function readWallpaperDraftFromForm() {
  const d = state.wallpaperDraft;
  if (!d) return null;
  const isCustom = d.variant === 'custom';
  const bgInput = $('wallpaper-custom-bg');
  const patInput = $('wallpaper-custom-pattern');
  const patOp = $('wallpaper-pattern-opacity');
  const gradOp = $('wallpaper-gradient-opacity');
  const draft = {
    ...d,
    customBg: isCustom ? (bgInput?.value || null) : null,
    customPatternColor: isCustom ? (patInput?.value || null) : null,
    patternOpacity: patOp ? Number(patOp.value) / 100 : d.patternOpacity,
    gradientOpacity: gradOp ? Number(gradOp.value) / 100 : d.gradientOpacity,
  };
  return syncWallpaperDraftVariant(draft);
}

function wallpaperVariantCircleHtml(variantId, label, { active = false, locked = false, productId = null, premium = false } = {}) {
  const meta = WALLPAPER_VARIANTS[variantId];
  let circleInner = '';

  if (variantId === 'custom') {
    circleInner = `<span class="wallpaper-variant-dot__circle">
      <span class="wallpaper-variant-dot__bg wallpaper-variant-dot__bg--custom"></span>
      <span class="wallpaper-variant-dot__ring"></span>
    </span>`;
  } else if (meta?.gradientId) {
    const grad = getWallpaperGradientCss(meta.gradientId);
    const bgStyle = grad ? `background:${grad}` : `background-color:${meta.bg}`;
    circleInner = `<span class="wallpaper-variant-dot__circle wallpaper-variant-dot__circle--gradient">
      <span class="wallpaper-variant-dot__bg" style="${bgStyle}"></span>
      <span class="wallpaper-variant-dot__dots" style="--wp-accent:${meta.patternColor};--wp-alpha:${meta.opacity ?? 0.14}"></span>
    </span>`;
  } else if (meta) {
    const alpha = meta.opacity ?? 0.14;
    circleInner = `<span class="wallpaper-variant-dot__circle">
      <span class="wallpaper-variant-dot__bg" style="background-color:${meta.bg}"></span>
      <span class="wallpaper-variant-dot__dots" style="--wp-accent:${meta.patternColor};--wp-alpha:${alpha}"></span>
      <span class="wallpaper-variant-dot__ring" style="--wp-accent:${meta.patternColor}"></span>
    </span>`;
  } else {
    circleInner = '<span class="wallpaper-variant-dot__circle"><span class="wallpaper-variant-dot__bg"></span></span>';
  }

  const cls = [
    'wallpaper-variant-dot',
    active ? 'is-active' : '',
    premium ? 'wallpaper-variant-dot--premium' : '',
    locked ? 'wallpaper-variant-dot--locked' : '',
  ].filter(Boolean).join(' ');
  const attrs = locked && productId
    ? `data-wp-buy-style="${productId}" type="button"`
    : `data-wp-variant="${variantId}" type="button"`;
  const labelHtml = locked
    ? `<span class="wallpaper-variant-dot__label">${escapeHtml(label)}<span class="wallpaper-variant-dot__buy">Купить</span></span>`
    : `<span class="wallpaper-variant-dot__label">${escapeHtml(label)}</span>`;
  return `<button class="${cls}" ${attrs}>${circleInner}${labelHtml}</button>`;
}

function renderWallpaperCustomizeSheet() {
  const d = state.wallpaperDraft;
  if (!d) return;

  syncWallpaperDraftVariant(d);

  const variant = WALLPAPER_VARIANTS[d.variant] || WALLPAPER_VARIANTS.light;
  const isPremium = isPremiumWallpaperVariant(d.variant);
  const isCustom = d.variant === 'custom';
  const bgInput = $('wallpaper-custom-bg');
  const patInput = $('wallpaper-custom-pattern');
  const patOp = $('wallpaper-pattern-opacity');
  const gradOp = $('wallpaper-gradient-opacity');
  const customRow = $('wallpaper-custom-row');
  const gradRow = $('wallpaper-gradient-row');
  if (bgInput) bgInput.value = d.customBg || variant.bg;
  if (patInput) patInput.value = d.customPatternColor || variant.patternColor;
  if (patOp) patOp.value = String(Math.round((d.patternOpacity ?? variant.opacity) * 100));
  if (gradOp) gradOp.value = String(Math.round((d.gradientOpacity ?? 0.62) * 100));
  customRow?.classList.toggle('hidden', !isCustom);
  gradRow?.classList.toggle('hidden', !isPremium);

  previewWallpaper(readWallpaperDraftFromForm(), $('wallpaper-preview'));

  const variantLabels = state.wallpaperConfig?.variants || Object.entries(WALLPAPER_VARIANTS).map(([id, v]) => ({
    id,
    label: v.label || id,
    premium: Boolean(v.requiresProduct),
    requiresProduct: v.requiresProduct || null,
  }));

  const patternChips = $('wallpaper-pattern-chips');
  if (patternChips) {
    const patterns = state.wallpaperConfig?.patterns || [];
    patternChips.innerHTML = [
      `<button type="button" class="wallpaper-chip${!d.patternId ? ' is-active' : ''}" data-wp-pattern="">Без узора</button>`,
      ...patterns.map((p) => {
        const owned = state.ownedWallpaperIds.has(p.id);
        return `<button type="button" class="wallpaper-chip${d.patternId === p.id ? ' is-active' : ''}" data-wp-pattern="${p.id}" ${owned ? '' : 'disabled'}>${escapeHtml(p.label || p.id)}</button>`;
      }),
    ].join('');
  }

  const variantChipsBasic = $('wallpaper-variant-chips-basic');
  const variantChipsPremium = $('wallpaper-variant-chips-premium');

  const renderVariantGrid = (el, items) => {
    if (!el) return;
    el.innerHTML = items.map((v) => {
      const productId = v.requiresProduct || WALLPAPER_VARIANTS[v.id]?.requiresProduct || null;
      const owned = !productId || state.ownedWallpaperIds.has(productId);
      return wallpaperVariantCircleHtml(v.id, v.label, {
        active: d.variant === v.id,
        locked: !owned && Boolean(productId),
        productId,
        premium: Boolean(productId),
      });
    }).join('');
  };

  const basicVariants = variantLabels.filter((v) => {
    const productId = v.requiresProduct || WALLPAPER_VARIANTS[v.id]?.requiresProduct;
    return !productId && v.id !== 'custom';
  });
  const premiumVariants = variantLabels.filter((v) => {
    const productId = v.requiresProduct || WALLPAPER_VARIANTS[v.id]?.requiresProduct;
    return Boolean(productId);
  });
  const customVariants = variantLabels.filter((v) => v.id === 'custom');

  renderVariantGrid(variantChipsBasic, [...basicVariants, ...customVariants]);
  renderVariantGrid(variantChipsPremium, premiumVariants);

  const premiumSection = $('wallpaper-variant-premium-section');
  premiumSection?.classList.toggle('hidden', !premiumVariants.length);
}

function openWallpaperCustomize(productId = null) {
  syncOwnedWallpaperIds();
  const base = state.user?.wallpaperSettings
    || defaultWallpaperDraft(state.user, productId || state.user?.activeWallpaperId);
  const premiumVariant = productId ? variantFromGradientProduct(productId) : null;
  state.wallpaperDraft = syncWallpaperDraftVariant({
    ...base,
    patternId: productId && state.ownedWallpaperIds.has(productId) && !premiumVariant
      ? productId
      : base.patternId,
    variant: premiumVariant || base.variant || 'light',
    gradientOpacity: base.gradientOpacity ?? 0.62,
  });
  renderWallpaperCustomizeSheet();
  openSheet('wallpaper-customize-sheet');
}

async function saveWallpaperSettings() {
  const payload = syncWallpaperDraftVariant(readWallpaperDraftFromForm());
  if (!payload?.patternId && !payload?.gradientId) {
    showSnackbar('Выберите узор или премиум-фон');
    return;
  }
  if (payload.variant !== 'custom') {
    payload.customBg = null;
    payload.customPatternColor = null;
  } else {
    payload.customBg = $('wallpaper-custom-bg')?.value || null;
    payload.customPatternColor = $('wallpaper-custom-pattern')?.value || null;
  }
  try {
    const data = await api.updateWallpaperSettings(payload);
    if (data.user) applyUserUpdate(data.user);
    closeAllSheets();
    state.wallpaperDraft = null;
    await loadMarketTab(true);
    showSnackbar('Обои сохранены');
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function loadWallpaperConfig() {
  try {
    const { config } = await api.getWallpaperConfig();
    state.wallpaperConfig = config;
    setWallpaperConfig(config);
  } catch {
    /* fallback in wallpaper.js */
  }
}

async function buyCollectibleUsername(slug) {
  try {
    const data = await api.buyCollectible(slug);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar(`@${slug} — ваш!`);
  } catch (err) {
    showSnackbar(err.message);
  }
}

let mintPreviewData = null;

async function openMintSheet() {
  const content = $('mint-preview-content');
  const confirmBtn = $('mint-confirm-btn');
  if (!content) return;

  content.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';
  confirmBtn?.classList.add('hidden');
  mintPreviewData = null;
  openSheet('mint-sheet');

  try {
    const data = await api.previewCollectibleMint();
    mintPreviewData = data.analysis;
    const a = data.analysis;
    const handleHtml = `<span class="collectible-username collectible-username--${escapeHtml(a.styleId)}">@${escapeHtml(a.slug)}</span>`;

    content.innerHTML = `
      <p class="text-muted" style="font-size:0.875rem">Алгоритм оценил ваш @</p>
      <div class="mint-preview__handle">${handleHtml}</div>
      <div>${rarityPillHtml(a.rarity, a.rarityLabel)}</div>
      <div class="mint-preview__score">Оценка: ${a.score} · рекомендуемая цена ${formatRubies(a.suggestedPrice)}</div>
      <ul class="mint-preview__factors">
        ${(a.factors || []).map((f) => `<li><span>${escapeHtml(f.text)}</span><span>+${f.pts}</span></li>`).join('')}
      </ul>
      <div class="mint-preview__fee">Стоимость минта: <strong>${formatRubies(a.mintFee)}</strong> рубинов</div>
      <p class="mint-preview__warn">После создания @ станет коллекционным. Вы сможете выставить его на маркет или носить с особым стилем.</p>`;

    confirmBtn?.classList.remove('hidden');
  } catch (err) {
    content.innerHTML = `<p class="text-error">${escapeHtml(err.message)}</p>`;
  }
}

async function confirmMintCollectible() {
  if (!mintPreviewData) return;
  const btn = $('mint-confirm-btn');
  if (btn) btn.disabled = true;
  try {
    const data = await api.mintCollectible();
    if (data.user) applyUserUpdate(data.user);
    closeAllSheets();
    switchMarketView('inventory');
    await loadMarketTab(true);
    await loadMarketInventory();
    showSnackbar(`@${mintPreviewData.slug} в инвентаре — задайте новый обычный @username в профиле`);
  } catch (err) {
    showSnackbar(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

let listCollectibleSlug = null;

async function listCollectibleOnMarket() {
  const slug = listCollectibleSlug;
  if (!slug) {
    showSnackbar('Не выбран @ тег');
    return;
  }
  const input = $('list-price-input');
  const price = Math.round(Number(input?.value));
  if (!price || price < 10) {
    showSnackbar('Минимум 10 рубинов');
    return;
  }
  try {
    await api.listCollectible(price, slug);
    listCollectibleSlug = null;
    closeAllSheets();
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar(`@${slug} выставлен на маркет`);
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function unlistCollectibleFromMarket(slug) {
  if (!slug) {
    showSnackbar('Не выбран @ тег');
    return;
  }
  try {
    await api.unlistCollectible(slug);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar(`@${slug} снят с маркета`);
  } catch (err) {
    showSnackbar(err.message);
  }
}

function openListCollectibleSheet(slug) {
  if (!slug) return;
  listCollectibleSlug = slug;
  const input = $('list-price-input');
  const handleEl = $('list-collectible-handle');
  if (input) input.value = '';
  if (handleEl) handleEl.textContent = `@${slug}`;
  openSheet('list-collectible-sheet');
}

async function equipCollectibleUsername(slug) {
  if (!slug) {
    showSnackbar('Не выбран @ тег');
    return;
  }
  try {
    const data = await api.equipCollectible(slug);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar(`Коллекционный @${slug} надет`);
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function unequipCollectibleUsername(slug) {
  if (!slug) return;
  try {
    const data = await api.unequipCollectible(slug);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar('Тег снят');
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function setPrimaryCollectibleUsername(slug) {
  if (!slug) return;
  try {
    const data = await api.setPrimaryCollectible(slug);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadMarketTab(true);
    if (state.marketView === 'inventory') await loadMarketInventory();
    showSnackbar(`@${slug} — основной тег`);
  } catch (err) {
    showSnackbar(err.message);
  }
}

function loadWalletTab(silent = false) {
  if (!state.user) return;

  renderWalletBalanceFromUser();
  renderWalletStatusChipFallback();

  const recentEl = $('wallet-recent-tx');
  const premiumEl = $('wallet-premium-card');

  if (!silent) {
    if (recentEl) {
      recentEl.innerHTML = '<div class="wallet-empty"><div class="spinner" style="margin:0 auto"></div></div>';
    }
    if (premiumEl) premiumEl.innerHTML = '<div class="wallet-empty"><div class="spinner" style="margin:0 auto"></div></div>';
  }

  api.getWallet()
    .then((data) => {
      if (data.serverTime) syncServerTime(data.serverTime);
      if (data.user) {
        state.user = data.user;
        applyCosmetics();
      }
      state.wallet = data;
      renderWalletBalance();
      renderWalletStatusChip();
      renderWalletPremiumCard();
      renderWalletTransactions(data.recentTransactions || [], 'wallet-recent-tx');
    })
    .catch((err) => {
      const msg = escapeHtml(err.message || 'Ошибка загрузки кошелька');
      if (recentEl) {
        recentEl.innerHTML = `
          <div class="wallet-empty">
            <span class="material-symbols-rounded">error</span>
            <p class="text-error">${msg}</p>
            <button type="button" class="btn btn--primary" id="wallet-retry-btn" style="margin-top:12px">Повторить</button>
          </div>`;
        $('wallet-retry-btn')?.addEventListener('click', () => loadWalletTab());
      }
      if (premiumEl) premiumEl.innerHTML = `<div class="wallet-empty"><p class="text-error">${msg}</p></div>`;
      showSnackbar(err.message || 'Ошибка загрузки кошелька');
    });
}

function renderWalletBalanceFromUser() {
  const el = $('wallet-balance');
  if (!el || !state.user) return;
  el.textContent = formatRubies(state.user.walletBalance ?? 0);
}

function renderWalletStatusChipFallback() {
  const meta = $('wallet-hero-meta');
  if (!meta || !state.user) return;
  if (state.wallet) return;

  const isPremium = Boolean(state.user.isPremium);
  meta.innerHTML = isPremium
    ? `<span class="wallet-hero__chip wallet-hero__chip--premium"><span class="material-symbols-rounded">diamond</span>Premium</span>`
    : `<span class="wallet-hero__chip"><span class="material-symbols-rounded">verified</span>Счёт активен</span>`;
}

function renderWalletBalance() {
  const el = $('wallet-balance');
  if (!el) return;
  const balance = state.wallet?.balance ?? state.user?.walletBalance ?? 0;
  el.textContent = formatRubies(balance);
}

function renderWalletStatusChip() {
  const meta = $('wallet-hero-meta');
  if (!meta || !state.wallet) return;

  const isPremium = Boolean(state.wallet.isPremium ?? state.user?.isPremium);
  const recent = state.wallet.recentTransactions || [];
  const income = recent.filter((t) => t.isCredit).reduce((s, t) => s + t.amount, 0);
  const expense = recent.filter((t) => !t.isCredit).reduce((s, t) => s + Math.abs(t.amount), 0);

  const chips = [];

  if (isPremium) {
    chips.push(`
      <span class="wallet-hero__chip wallet-hero__chip--premium">
        <span class="material-symbols-rounded">diamond</span>
        Premium
      </span>`);
  } else {
    chips.push(`
      <span class="wallet-hero__chip">
        <span class="material-symbols-rounded">verified</span>
        Счёт активен
      </span>`);
  }

  if (recent.length) {
    chips.push(`
      <span class="wallet-hero__chip">
        <span class="material-symbols-rounded">south_west</span>
        +${formatRubies(income)}
      </span>
      <span class="wallet-hero__chip">
        <span class="material-symbols-rounded">north_east</span>
        −${formatRubies(expense)}
      </span>`);
  }

  meta.innerHTML = chips.join('');
}

function walletTxHtml(tx) {
  const iconCls = tx.type === 'premium'
    ? 'wallet-tx__icon--premium'
    : tx.isCredit ? 'wallet-tx__icon--credit' : 'wallet-tx__icon--debit';
  const sign = tx.isCredit ? '+' : '−';
  const amountCls = tx.isCredit ? 'wallet-tx__amount--credit' : '';

  return `
    <div class="wallet-tx">
      <div class="wallet-tx__icon ${iconCls}">
        <span class="material-symbols-rounded">${escapeHtml(tx.icon)}</span>
      </div>
      <div class="wallet-tx__body">
        <div class="wallet-tx__title">${escapeHtml(tx.title)}</div>
        <div class="wallet-tx__sub">${escapeHtml(tx.subtitle || tx.note || '')}</div>
      </div>
      <div class="wallet-tx__right">
        <div class="wallet-tx__amount ${amountCls}">
          ${sign}${formatRubies(Math.abs(tx.amount))}
          <span class="material-symbols-rounded">diamond</span>
        </div>
        <div class="wallet-tx__date">${formatListTime(tx.createdAt)}</div>
      </div>
    </div>`;
}

function walletTxListHtml(transactions) {
  if (!transactions?.length) {
    return `
      <div class="wallet-empty">
        <span class="material-symbols-rounded">receipt_long</span>
        Пока нет операций
      </div>`;
  }
  return `<div class="wallet-tx-list">${transactions.map(walletTxHtml).join('')}</div>`;
}

function renderWalletTransactions(transactions, containerId) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = walletTxListHtml(transactions);
}

function renderWalletPremiumCard() {
  const el = $('wallet-premium-card');
  const product = state.wallet?.products?.find((p) => p.id === 'premium');
  if (!el || !product) return;

  const owned = product.owned || state.user?.isPremium;
  el.classList.toggle('wallet-premium-card--owned', owned);

  el.innerHTML = `
    <div class="wallet-premium-card__icon"><span class="material-symbols-rounded">diamond</span></div>
    <div class="wallet-premium-card__body">
      <div class="wallet-premium-card__title">${escapeHtml(product.title)}</div>
      <div class="wallet-premium-card__desc">${escapeHtml(product.description)}</div>
      ${owned ? '' : `
        <div class="wallet-premium-card__price">
          <span class="material-symbols-rounded">diamond</span>${formatRubies(product.price)}
        </div>`}
    </div>
    ${owned
      ? `<span class="wallet-premium-card__badge-owned"><span class="material-symbols-rounded">verified</span>Активен</span>`
      : `<button type="button" class="wallet-premium-card__action ripple-host" data-buy-product="premium">Купить за ${formatRubies(product.price)}</button>`}
  `;
}

async function purchaseWalletProduct(productId) {
  try {
    const data = await api.purchaseProduct(productId);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    await loadWalletTab(true);
    if (tabPanels.market?.classList.contains('active')) await loadMarketTab(true);
    if (productId === 'premium') {
      showSnackbar('Premium активирован — рубин видят все');
    } else {
      showSnackbar('Покупка успешна');
    }
  } catch (err) {
    showSnackbar(err.message);
  }
}

function openWalletTopupSheet() {
  const presetsEl = $('wallet-topup-presets');
  const presets = state.wallet?.topupPresets || [100, 300, 500, 1000, 2500];
  state.walletTopupPreset = null;

  if (presetsEl) {
    presetsEl.innerHTML = presets.map((amount) => `
      <button type="button" class="wallet-sheet-preset" data-topup-preset="${amount}">
        <span class="material-symbols-rounded">diamond</span>${formatRubies(amount)}
      </button>
    `).join('');
  }

  const custom = $('wallet-topup-custom');
  if (custom) custom.value = '';
  openSheet('wallet-topup-sheet');
}

async function submitWalletTopup() {
  const custom = parseInt($('wallet-topup-custom')?.value, 10);
  const amount = custom || state.walletTopupPreset;
  if (!amount || amount < 10) {
    showSnackbar('Минимум 10 рубинов');
    return;
  }

  const btn = $('wallet-topup-submit');
  if (btn) btn.disabled = true;

  try {
    const data = await api.topupWallet(amount);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    closeAllSheets();
    await loadWalletTab(true);
    showSnackbar(`+${formatRubies(amount)} рубинов`);
  } catch (err) {
    showSnackbar(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openWalletTransferSheet() {
  setFieldValue('wallet-transfer-user', '');
  setFieldValue('wallet-transfer-amount', '');
  setFieldValue('wallet-transfer-note', '');
  openSheet('wallet-transfer-sheet');
}

async function submitWalletTransfer() {
  const toUsername = getFieldValue('wallet-transfer-user');
  const amount = parseInt(getFieldValue('wallet-transfer-amount'), 10);
  const note = getFieldValue('wallet-transfer-note');

  if (!toUsername) {
    showSnackbar('Укажите @username');
    return;
  }
  if (!amount || amount < 1) {
    showSnackbar('Минимум 1 рубин');
    return;
  }

  const btn = $('wallet-transfer-submit');
  if (btn) btn.disabled = true;

  try {
    const data = await api.transferWallet(toUsername, amount, note || undefined);
    if (data.serverTime) syncServerTime(data.serverTime);
    if (data.user) applyUserUpdate(data.user);
    closeAllSheets();
    await loadWalletTab(true);
    showSnackbar(`Переведено ${formatRubies(amount)} рубинов`);
  } catch (err) {
    showSnackbar(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openWalletHistory() {
  pushLayer('walletHistory');
  loadWalletHistory();
}

async function loadWalletHistory() {
  const list = $('wallet-history-list');
  if (!list) return;

  list.innerHTML = '<div class="wallet-empty"><div class="spinner" style="margin:0 auto"></div></div>';

  try {
    const data = await api.getWalletTransactions(100, 0);
    if (data.serverTime) syncServerTime(data.serverTime);
    list.innerHTML = walletTxListHtml(data.transactions || []);
  } catch (err) {
    list.innerHTML = `<div class="wallet-empty"><p class="text-error">${escapeHtml(err.message)}</p></div>`;
  }
}

function loadPrivacyScreen() {
  if (!state.user) return;

  const emailEl = $('privacy-email');
  const emailStatusEl = $('privacy-email-status');
  const usernameEl = $('privacy-username');
  if (emailEl) emailEl.textContent = state.user.email || '—';
  renderEmailStatus(emailStatusEl, state.user.emailVerified);
  if (usernameEl) usernameEl.innerHTML = profileInfoTagsHtml(state.user);

  const privacy = state.user.privacy || {};
  const cards = {};

  PRIVACY_ROWS.forEach((row) => {
    if (!cards[row.card]) cards[row.card] = [];
    cards[row.card].push(row);
  });

  Object.entries(cards).forEach(([cardId, rows]) => {
    const card = $(cardId);
    if (!card) return;
    card.innerHTML = rows.map((row, index) => {
      const level = privacy[row.key] || 'everyone';
      const isLast = index === rows.length - 1;
      return `
        <button type="button" class="settings-row ripple-host${isLast ? ' settings-row--last' : ''}" data-privacy-key="${row.key}" data-privacy-title="${escapeHtml(row.label)}">
          <span class="settings-row__icon settings-row__icon--${row.color}"><span class="material-symbols-rounded">${row.icon}</span></span>
          <span class="settings-row__body">
            <span class="settings-row__label">${escapeHtml(row.label)}</span>
            <span class="settings-row__hint">${escapeHtml(row.hint)}</span>
          </span>
          <span class="settings-row__value settings-row__value--privacy">${PRIVACY_LEVEL_LABELS[level] || 'Все'}</span>
          <span class="material-symbols-rounded settings-row__chevron">chevron_right</span>
        </button>`;
    }).join('');
  });

  const plainToggle = $('privacy-plain-username-toggle');
  if (plainToggle) {
    plainToggle.classList.toggle('is-on', privacy.showPlainUsername !== false);
  }
}

function openPrivacyPicker(key, title) {
  const privacy = state.user?.privacy || {};
  const current = privacy[key] || 'everyone';
  state.privacyPickerKey = key;

  const titleEl = $('privacy-picker-title');
  const optionsEl = $('privacy-picker-options');
  if (titleEl) titleEl.textContent = title || 'Кто видит';
  if (!optionsEl) return;

  const options = [
    { id: 'everyone', label: 'Все', desc: 'Любой пользователь Ferom' },
    { id: 'nobody', label: 'Никто', desc: 'Скрыто от других пользователей' },
  ];

  optionsEl.innerHTML = options.map((opt) => `
    <button type="button" class="privacy-picker-option${current === opt.id ? ' is-selected' : ''}" data-privacy-level="${opt.id}">
      <span>
        <span class="privacy-picker-option__label">${opt.label}</span>
        <span class="privacy-picker-option__desc">${opt.desc}</span>
      </span>
      <span class="material-symbols-rounded privacy-picker-option__check">check</span>
    </button>
  `).join('');

  openSheet('privacy-picker-sheet');
}

async function savePrivacyPatch(patch) {
  try {
    const data = await api.updatePrivacy(patch);
    if (data.user) applyUserUpdate(data.user);
    else if (data.privacy && state.user) state.user.privacy = data.privacy;
    loadPrivacyScreen();
    return true;
  } catch (err) {
    showSnackbar(err.message);
    return false;
  }
}

async function openPrivacyScreen() {
  if (!state.user) return;
  try {
    const data = await api.getPrivacy();
    if (data.privacy) state.user.privacy = data.privacy;
  } catch {
    /* use cached privacy from profile */
  }
  loadPrivacyScreen();
  pushLayer('privacy');
}

function loadMyProfileScreen() {
  if (!state.user) return;
  const u = state.user;

  renderAvatar($('my-profile-avatar'), u.avatarUrl, u.displayName);
  setDisplayName($('my-profile-name'), u.displayName, userNameBadges(u));

  const usernameEl = $('my-profile-username');
  if (usernameEl) setUsername(usernameEl, u, { mode: 'info' });

  applyCoverGradient(u.coverGradient || 'purple', 'my-profile-bg');

  const bioRow = $('my-profile-bio-row');
  const bioEl = $('my-profile-bio');
  const bio = (u.bio || '').trim();

  if (bioRow && bioEl) {
    if (bio) {
      bioEl.textContent = bio;
      bioRow.classList.remove('hidden');
    } else {
      bioEl.textContent = '';
      bioRow.classList.add('hidden');
    }
  }

  const scroll = $('my-profile-scroll');
  if (scroll) scroll.scrollTop = 0;
}

function openMyProfileScreen() {
  loadMyProfileScreen();
  pushLayer('myProfile');
}

async function closeMyProfileScreen() {
  await popLayer();
  switchTab('profile');
}

function resolveProfileChatId(user) {
  if (state.userProfileReturn === 'chat' && state.currentChat?.id) {
    return state.currentChat.id;
  }
  if (user?.id) {
    const chat = state.chats.find((c) => c.otherUser?.id === user.id);
    if (chat) return chat.id;
  }
  return null;
}

function setUserProfileSharedTab(tab) {
  state.userProfileSharedTab = tab;
  document.querySelectorAll('#user-profile-shared .tg-profile-tab').forEach((btn) => {
    const active = btn.dataset.sharedTab === tab;
    btn.classList.toggle('tg-profile-tab--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function renderUserProfileSharedPanel(items, kind) {
  const panel = $('user-profile-shared-panel');
  if (!panel) return;

  if (!items?.length) {
    const labels = { media: 'Нет фото', voice: 'Нет голосовых', links: 'Нет ссылок' };
    panel.innerHTML = `<div class="tg-profile-shared-status">${labels[kind] || 'Пусто'}</div>`;
    return;
  }

  if (kind === 'media') {
    panel.innerHTML = `
      <div class="tg-profile-media-grid">
        ${items.map((item) => `
          <button type="button" class="tg-profile-media-item" data-image-open="${escapeHtml(item.mediaUrl)}" aria-label="Открыть фото">
            <img src="${escapeHtml(item.mediaUrl)}" alt="" loading="lazy" decoding="async">
          </button>
        `).join('')}
      </div>`;
    panel.querySelectorAll('[data-image-open]').forEach((btn) => {
      btn.addEventListener('click', () => openImageLightbox(btn.dataset.imageOpen));
    });
    return;
  }

  if (kind === 'voice') {
    panel.innerHTML = `<div class="tg-profile-voice-list">${items.map((item) => `
      <div class="tg-profile-voice-item" data-voice-id="${item.id}">
        <button type="button" class="tg-profile-voice-item__play ripple-host" aria-label="Воспроизвести">
          <span class="material-symbols-rounded">play_arrow</span>
        </button>
        <div class="tg-profile-voice-item__meta">
          <div class="tg-profile-voice-item__title">${item.isMine ? 'Вы' : escapeHtml(state.viewingUser?.displayName || 'Собеседник')}</div>
          <div class="tg-profile-voice-item__time">${formatVoiceDuration(item.duration)} · ${formatListTime(item.createdAt)}</div>
        </div>
        <audio preload="metadata" src="${escapeHtml(item.mediaUrl)}"></audio>
      </div>
    `).join('')}</div>`;

    panel.querySelectorAll('.tg-profile-voice-item').forEach((row) => {
      const btn = row.querySelector('.tg-profile-voice-item__play');
      const audio = row.querySelector('audio');
      const icon = btn?.querySelector('.material-symbols-rounded');
      btn?.addEventListener('click', () => {
        if (!audio) return;
        if (activeVoiceAudio && activeVoiceAudio !== audio) {
          activeVoiceAudio.pause();
          document.querySelectorAll('.tg-profile-voice-item__play .material-symbols-rounded').forEach((el) => {
            el.textContent = 'play_arrow';
          });
        }
        if (audio.paused) {
          audio.play().catch(() => showSnackbar('Не удалось воспроизвести'));
          activeVoiceAudio = audio;
          if (icon) icon.textContent = 'pause';
        } else {
          audio.pause();
          if (icon) icon.textContent = 'play_arrow';
        }
        audio.onended = () => { if (icon) icon.textContent = 'play_arrow'; };
      });
    });
    return;
  }

  if (kind === 'links') {
    panel.innerHTML = `<div class="tg-profile-links-list">${items.map((item) => `
      <a class="tg-profile-link-item ripple-host" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        <span class="tg-profile-link-item__icon"><span class="material-symbols-rounded">link</span></span>
        <span class="tg-profile-link-item__body">
          <span class="tg-profile-link-item__url">${escapeHtml(item.url)}</span>
          <span class="tg-profile-link-item__meta">${escapeHtml(getLinkHostname(item.url))} · ${formatListTime(item.createdAt)}</span>
        </span>
      </a>
    `).join('')}</div>`;
  }
}

async function loadUserProfileShared(tab = state.userProfileSharedTab) {
  const chatId = state.userProfileChatId;
  const section = $('user-profile-shared');
  const panel = $('user-profile-shared-panel');
  if (!chatId || !section || !panel) return;

  section.classList.remove('hidden');
  setUserProfileSharedTab(tab);

  if (!state.userProfileSharedCache) {
    state.userProfileSharedCache = { media: null, voice: null, links: null };
  }
  if (state.userProfileSharedCache[tab]) {
    renderUserProfileSharedPanel(state.userProfileSharedCache[tab], tab);
    return;
  }

  panel.innerHTML = '<div class="tg-profile-shared-status"><div class="spinner"></div></div>';

  try {
    const data = await api.getChatShared(chatId, tab);
    state.userProfileSharedCache[tab] = data.items || [];
    renderUserProfileSharedPanel(state.userProfileSharedCache[tab], tab);
  } catch (err) {
    panel.innerHTML = `<div class="tg-profile-shared-status">${escapeHtml(err.message)}</div>`;
  }
}

function renderUserProfileScreen(u) {
  if (!u) return;

  renderAvatar($('user-profile-avatar'), u.avatarUrl, u.displayName);
  setDisplayName($('user-profile-name'), u.displayName, userNameBadges(u));

  const statusEl = $('user-profile-status');
  if (statusEl) {
    statusEl.textContent = formatLastSeen(u);
    statusEl.classList.toggle('tg-profile-header__status--online', Boolean(u.isOnline));
  }

  const dot = $('user-profile-online-dot');
  if (dot) dot.classList.toggle('hidden', !u.isOnline || u.lastSeenHidden);

  const usernameEl = $('user-profile-username');
  if (usernameEl) {
    setUsername(usernameEl, u, { mode: 'info' });
  }

  applyCoverGradient(u.coverGradient || 'purple', 'user-profile-bg');

  const bioRow = $('user-profile-bio-row');
  const bioEl = $('user-profile-bio');
  const bio = (u.bio || '').trim();

  if (bioRow && bioEl) {
    if (bio && !u.bioHidden) {
      bioEl.textContent = bio;
      bioRow.classList.remove('hidden');
    } else {
      bioEl.textContent = '';
      bioRow.classList.add('hidden');
    }
  }

  const writeBtn = $('user-profile-write');
  if (writeBtn) {
    const hide = u.id === state.user?.id
      || state.userProfileReturn === 'chat'
      || u.canMessage === false;
    writeBtn.classList.toggle('hidden', hide);
  }

  const scroll = $('user-profile-scroll');
  if (scroll) scroll.scrollTop = 0;

  const sharedSection = $('user-profile-shared');
  if (sharedSection) {
    if (state.userProfileChatId) {
      sharedSection.classList.remove('hidden');
      loadUserProfileShared(state.userProfileSharedTab);
    } else {
      sharedSection.classList.add('hidden');
    }
  }
}

async function openUserProfile(userOrUsername, returnTo = 'chat') {
  const username = resolveProfileHandle(userOrUsername);

  if (!username) {
    showSnackbar('Профиль недоступен');
    return;
  }

  const myHandle = getPublicHandle(state.user);
  const isSelf = state.user && (
    username === state.user.username
    || username === myHandle
    || username === state.user.equippedCollectibleSlug
    || username === state.user.primaryTagSlug
    || (typeof userOrUsername === 'object' && userOrUsername?.id === state.user.id)
  );
  if (isSelf) {
    openMyProfileScreen();
    return;
  }

  state.userProfileReturn = returnTo;
  state.userProfileChatId = null;
  state.userProfileSharedCache = null;
  state.userProfileSharedTab = 'media';

  try {
    const { user } = await api.getUserProfile(username);
    state.viewingUser = user;
    state.userProfileChatId = resolveProfileChatId(user);
    renderUserProfileScreen(user);
    pushLayer('userProfile');
  } catch (err) {
    showSnackbar(err.message);
  }
}

async function closeUserProfile() {
  state.userProfileChatId = null;
  state.userProfileSharedCache = null;
  await popLayer();
}

// ─── Редактирование профиля (Telegram) ───

function setProfileError(message) {
  const el = $('profile-error');
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function renderEditAvatarPreview(url, name, isBlob = false) {
  const img = $('edit-avatar-img');
  const ph = $('edit-avatar-placeholder');
  if (!img || !ph) return;

  if (url) {
    img.src = isBlob ? url : bustAvatarUrl(url);
    img.classList.remove('hidden');
    ph.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    ph.classList.remove('hidden');
    ph.textContent = (name || '?').charAt(0).toUpperCase();
  }
}

function updateRemovePhotoVisibility() {
  const btn = $('sheet-remove-photo');
  const d = state.profileEditDraft;
  if (!btn || !d) return;
  const hasUpload = state.user?.avatarUrl?.startsWith('/uploads/') || d.avatarFile;
  btn.classList.toggle('hidden', !hasUpload);
}

function openSheet(sheetId) {
  closeAllSheets();
  const sheet = $(sheetId);
  sheet?.classList.add('is-open');
  sheet?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
}

function closeAllSheets() {
  document.querySelectorAll('.action-sheet').forEach((s) => {
    s.classList.remove('is-open');
    s.setAttribute('aria-hidden', 'true');
  });
  state.pendingChatDeleteId = null;
  closeMessageMenu();
  if (!document.querySelector('.message-menu.is-open')) {
    document.body.classList.remove('sheet-open');
  }
}

function isProfileEditDirty() {
  const d = state.profileEditDraft;
  const u = state.user;
  if (!d || !u) return false;
  return (
    d.displayName !== (u.displayName || '')
    || d.username !== (u.username || '')
    || d.bio !== (u.bio || '')
    || d.avatarFile !== null
    || d.removeAvatar
    || (d.avatarPreset && d.avatarPreset !== u.avatarUrl)
  );
}

function openProfileEdit(returnTo = 'profile') {
  if (!state.user) return;

  state.profileEditReturnTo = returnTo;

  const u = state.user;
  state.profileEditDraft = {
    displayName: u.displayName || '',
    username: profileEditUsernameInitial(u),
    bio: u.bio || '',
    avatarFile: null,
    avatarPreset: null,
    removeAvatar: false,
    previewUrl: u.avatarUrl || null,
  };

  const nameInput = $('edit-display-name');
  const bioInput = $('edit-bio');
  const usernameInput = $('edit-username');
  if (nameInput) nameInput.value = state.profileEditDraft.displayName;
  if (bioInput) bioInput.value = state.profileEditDraft.bio;
  if (usernameInput) usernameInput.value = state.profileEditDraft.username;

  const hintEl = $('edit-username-hint');
  if (hintEl) {
    const hint = profileEditUsernameHint(u);
    hintEl.textContent = hint.text;
    hintEl.classList.toggle('tg-edit-hint--warn', hint.warn);
  }

  renderEmailField($('edit-email-display'), u.email, u.emailVerified);

  renderEditAvatarPreview(u.avatarUrl, u.displayName);
  updateRemovePhotoVisibility();
  setProfileError(null);
  closeAllSheets();
  pushLayer('profileEdit');
}

async function finishProfileEditNavigation() {
  closeAllSheets();
  await popLayer();
  if (state.profileEditReturnTo === 'myProfile') {
    loadMyProfileScreen();
  } else {
    switchTab('profile');
  }
}

async function closeProfileEdit(skipConfirm = false) {
  if (!skipConfirm && isProfileEditDirty()) {
    if (!window.confirm('Отменить изменения?')) return;
  }
  state.profileEditDraft = null;
  state.editAvatarFile = null;
  closeAllSheets();
  await finishProfileEditNavigation();
}

async function saveProfileEdit() {
  const d = state.profileEditDraft;
  if (!d || !state.user) return false;

  const displayName = $('edit-display-name')?.value?.trim() || '';
  const bio = $('edit-bio')?.value?.trim() || '';
  const username = $('edit-username')?.value?.replace(/^@/, '').toLowerCase().trim() || '';

  if (!displayName) {
    setProfileError('Введите имя');
    return false;
  }

  if (!username) {
    setProfileError('Введите username');
    return false;
  }

  if (username !== state.user.username) {
    const ownedSlugs = new Set((state.user.equippedTags || [])
      .filter((t) => t.isCollectible)
      .map((t) => t.slug));
    if (ownedSlugs.has(username)) {
      setProfileError('Этот @ уже ваш коллекционный тег — выберите другой обычный username');
      return false;
    }
  }

  setProfileError(null);
  const doneBtn = $('profile-edit-done');
  if (doneBtn) doneBtn.disabled = true;

  try {
    const payload = { displayName, bio, username };

    if (d.removeAvatar) {
      payload.removeAvatar = true;
    } else if (d.avatarFile) {
      payload.avatarFile = d.avatarFile;
    } else if (d.avatarPreset && d.avatarPreset !== state.user.avatarUrl) {
      payload.avatarPreset = d.avatarPreset;
    }

    const { user } = await api.updateProfile(payload);
    if (payload.avatarFile || payload.avatarPreset || payload.removeAvatar) {
      if (state.user?.avatarUrl) invalidateAvatarCache(state.user.avatarUrl);
      if (user.avatarUrl) invalidateAvatarCache(user.avatarUrl);
    }
    state.user = user;
    state.profileEditDraft = null;
    syncCoverGradients();
    loadProfileTab();
    if (isLayerVisible('myProfile')) loadMyProfileScreen();
    return true;
  } catch (err) {
    setProfileError(err.message);
    return false;
  } finally {
    if (doneBtn) doneBtn.disabled = false;
  }
}

$('btn-cover-gradient')?.addEventListener('click', openCoverSheet);
$('btn-edit-profile-row')?.addEventListener('click', openProfileEdit);
$('btn-my-profile')?.addEventListener('click', openMyProfileScreen);

$('my-profile-back')?.addEventListener('click', closeMyProfileScreen);

$('profile-edit-back')?.addEventListener('click', () => closeProfileEdit());

$('profile-edit-done')?.addEventListener('click', async () => {
  const ok = await saveProfileEdit();
  if (ok) {
    finishProfileEditNavigation();
    showSnackbar('Профиль сохранён');
  }
});

const openAvatarSheet = () => openSheet('avatar-sheet');
$('edit-avatar-tap')?.addEventListener('click', openAvatarSheet);
$('edit-avatar-action')?.addEventListener('click', openAvatarSheet);

$('sheet-upload-photo')?.addEventListener('click', () => {
  closeAllSheets();
  $('edit-avatar-file')?.click();
});

$('sheet-choose-preset')?.addEventListener('click', () => openSheet('presets-sheet'));

$('sheet-remove-photo')?.addEventListener('click', () => {
  if (!state.profileEditDraft) return;
  state.profileEditDraft.removeAvatar = true;
  state.profileEditDraft.avatarFile = null;
  state.profileEditDraft.avatarPreset = '/assets/avatars/preset-1.svg';
  renderEditAvatarPreview('/assets/avatars/preset-1.svg', state.profileEditDraft.displayName);
  closeAllSheets();
});

document.querySelectorAll('[data-close-sheet]').forEach((el) => {
  el.addEventListener('click', closeAllSheets);
});

$('edit-presets-grid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn || !state.profileEditDraft) return;

  state.profileEditDraft.avatarPreset = btn.dataset.preset;
  state.profileEditDraft.avatarFile = null;
  state.profileEditDraft.removeAvatar = false;
  renderEditAvatarPreview(btn.dataset.preset, state.profileEditDraft.displayName);
  updateRemovePhotoVisibility();
  closeAllSheets();
});

$('edit-avatar-file')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file || !state.profileEditDraft) return;

  if (file.size > 2 * 1024 * 1024) {
    showSnackbar('Файл больше 2 МБ');
    e.target.value = '';
    return;
  }

  state.profileEditDraft.avatarFile = file;
  state.profileEditDraft.avatarPreset = null;
  state.profileEditDraft.removeAvatar = false;
  renderEditAvatarPreview(URL.createObjectURL(file), state.profileEditDraft.displayName, true);
  updateRemovePhotoVisibility();
  e.target.value = '';
});

$('edit-display-name')?.addEventListener('input', (e) => {
  if (state.profileEditDraft) state.profileEditDraft.displayName = e.target.value;
});

$('edit-bio')?.addEventListener('input', (e) => {
  if (state.profileEditDraft) state.profileEditDraft.bio = e.target.value;
});

$('btn-copy-username')?.addEventListener('click', async () => {
  const handle = state.user?.username || getPublicHandle(state.user);
  if (!handle) return;
  const text = `@${handle}`;
  try {
    await navigator.clipboard.writeText(text);
    showSnackbar('Username скопирован');
  } catch {
    showSnackbar(text);
  }
});

$('btn-mint-collectible')?.addEventListener('click', () => openMintSheet());

$('btn-theme')?.addEventListener('click', () => {
  const idx = THEME_CYCLE.indexOf(state.theme);
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  applyTheme(next);
  showSnackbar(`Тема: ${THEME_LABELS[next]}`);
});

$('btn-notifications')?.addEventListener('click', () => showSnackbar('Уведомления — скоро'));
$('btn-privacy')?.addEventListener('click', openPrivacyScreen);
$('btn-admin')?.addEventListener('click', () => openAdminScreen());

$('privacy-back')?.addEventListener('click', async () => {
  await popLayer();
  switchTab('profile');
});

document.getElementById('screen-privacy')?.addEventListener('click', (e) => {
  const row = e.target.closest('[data-privacy-key]');
  if (row) {
    openPrivacyPicker(row.dataset.privacyKey, row.dataset.privacyTitle);
    return;
  }

  const toggleBtn = e.target.closest('[data-privacy-toggle="showPlainUsername"]');
  if (toggleBtn && state.user?.privacy) {
    const next = !(state.user.privacy.showPlainUsername !== false);
    savePrivacyPatch({ showPlainUsername: next });
  }
});

$('privacy-picker-options')?.addEventListener('click', async (e) => {
  const opt = e.target.closest('[data-privacy-level]');
  if (!opt || !state.privacyPickerKey) return;
  const key = state.privacyPickerKey;
  const level = opt.dataset.privacyLevel;
  closeAllSheets();
  state.privacyPickerKey = null;
  await savePrivacyPatch({ [key]: level });
});

$('wallet-topup')?.addEventListener('click', openWalletTopupSheet);
$('wallet-transfer')?.addEventListener('click', openWalletTransferSheet);
$('wallet-history')?.addEventListener('click', openWalletHistory);
$('wallet-history-quick')?.addEventListener('click', openWalletHistory);
$('wallet-all-history')?.addEventListener('click', openWalletHistory);
$('wallet-history-back')?.addEventListener('click', () => popLayer());

$('wallet-topup-presets')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-topup-preset]');
  if (!btn) return;
  state.walletTopupPreset = parseInt(btn.dataset.topupPreset, 10);
  $('wallet-topup-presets')?.querySelectorAll('.wallet-sheet-preset').forEach((b) => {
    b.classList.toggle('selected', b === btn);
  });
  const custom = $('wallet-topup-custom');
  if (custom) custom.value = '';
});

$('wallet-topup-submit')?.addEventListener('click', submitWalletTopup);
$('wallet-transfer-submit')?.addEventListener('click', submitWalletTransfer);

$('wallet-premium-card')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy-product]');
  if (btn) purchaseWalletProduct(btn.dataset.buyProduct);
});

document.querySelectorAll('[data-market-view]').forEach((btn) => {
  btn.addEventListener('click', () => switchMarketView(btn.dataset.marketView));
});

$('market-sections')?.addEventListener('click', (e) => {
  const customize = e.target.closest('[data-wallpaper-customize]');
  const buy = e.target.closest('[data-buy-product]');
  const equip = e.target.closest('[data-equip-product]');
  const unequip = e.target.closest('[data-unequip-product]');

  if (customize) {
    e.stopPropagation();
    openWallpaperCustomize(customize.dataset.wallpaperCustomize);
  } else if (buy) {
    e.stopPropagation();
    purchaseMarketProduct(buy.dataset.buyProduct);
  } else if (equip) {
    e.stopPropagation();
    equipMarketProduct(equip.dataset.equipProduct);
  } else if (unequip) {
    e.stopPropagation();
    unequipMarketProduct(unequip.dataset.unequipProduct);
  }
});

$('market-tags-listings')?.addEventListener('click', (e) => {
  const buyColl = e.target.closest('[data-buy-collectible]');
  if (buyColl) {
    e.stopPropagation();
    buyCollectibleUsername(buyColl.dataset.buyCollectible);
  }
});

$('market-inventory')?.addEventListener('click', (e) => {
  const customize = e.target.closest('[data-wallpaper-customize]');
  const equip = e.target.closest('[data-equip-product]');
  const unequip = e.target.closest('[data-unequip-product]');
  const equipColl = e.target.closest('[data-equip-collectible]');
  const unequipColl = e.target.closest('[data-unequip-collectible]');
  const primaryColl = e.target.closest('[data-set-primary-collectible]');
  const unlistColl = e.target.closest('[data-unlist-collectible]');
  const openList = e.target.closest('[data-open-list-collectible]');

  if (customize) openWallpaperCustomize(customize.dataset.wallpaperCustomize);
  else if (equip) equipMarketProduct(equip.dataset.equipProduct);
  else if (unequip) unequipMarketProduct(unequip.dataset.unequipProduct);
  else if (equipColl) {
    const slug = equipColl.getAttribute('data-equip-collectible') || inventoryCollectibleSlug(equipColl);
    equipCollectibleUsername(slug);
  } else if (unequipColl) {
    const slug = unequipColl.getAttribute('data-unequip-collectible') || inventoryCollectibleSlug(unequipColl);
    unequipCollectibleUsername(slug);
  } else if (primaryColl) {
    const slug = primaryColl.getAttribute('data-set-primary-collectible') || inventoryCollectibleSlug(primaryColl);
    setPrimaryCollectibleUsername(slug);
  } else if (unlistColl) {
    const slug = unlistColl.getAttribute('data-unlist-collectible') || inventoryCollectibleSlug(unlistColl);
    unlistCollectibleFromMarket(slug);
  } else if (openList) {
    const slug = openList.getAttribute('data-open-list-collectible') || inventoryCollectibleSlug(openList);
    openListCollectibleSheet(slug);
  }
});

$('mint-confirm-btn')?.addEventListener('click', confirmMintCollectible);
$('list-collectible-submit')?.addEventListener('click', listCollectibleOnMarket);

$('chat-delete-self-btn')?.addEventListener('click', () => performChatDelete('self'));
$('chat-delete-both-btn')?.addEventListener('click', () => performChatDelete('both'));

$('fragment-buy-btn')?.addEventListener('click', async () => {
  const slug = fragmentSheetBuySlug;
  if (!slug) return;
  closeAllSheets();
  await buyCollectibleUsername(slug);
});

async function handleForcedLogout(clearFields = false) {
  try {
    await api.logout();
  } catch {
    /* session may already be invalid */
  }
  disconnectRealtime();
  await teardownNotifications();
  closeAllLayers(false);
  accountNoticeShown.username = false;
  state.user = null;
  state.currentChat = null;
  state.chats = [];
  state.loadedMessageIds.clear();
  if (clearFields) {
    setFieldValue('login-email', '');
    setFieldValue('login-password', '');
  }
  showScreen('login');
}

$('btn-logout')?.addEventListener('click', async () => {
  try {
    await handleForcedLogout(true);
  } catch (err) {
    showSnackbar(err.message);
  }
});

// ─── Инициализация ───

document.addEventListener('click', (e) => {
  const moreBtn = e.target.closest('[data-tags-more]');
  const lessBtn = e.target.closest('[data-tags-less]');
  if (moreBtn || lessBtn) {
    e.stopPropagation();
    e.preventDefault();
    const line = (moreBtn || lessBtn).closest('.tg-account-line');
    if (!line) return;
    const user = tagsExpandCache.get(line.dataset.tagsId);
    if (!user) return;
    const variant = accountLineVariantFromEl(line);
    const parent = line.parentElement;
    line.outerHTML = accountTagsLineHtml(user, variant, {
      expanded: Boolean(moreBtn),
      tagsId: line.dataset.tagsId,
    });
    bindCollectibleInfoClicks(parent);
    return;
  }

  const tag = e.target.closest('[data-collectible-info]');
  if (tag) {
    e.stopPropagation();
    e.preventDefault();
    openFragmentSheet(tag.dataset.collectibleInfo);
    return;
  }

  const premiumBtn = e.target.closest('[data-premium-info]');
  if (premiumBtn) {
    e.stopPropagation();
    e.preventDefault();
    openPremiumSheet(premiumBtn.dataset.premiumUserId || null);
    return;
  }

  const verifiedBtn = e.target.closest('[data-verified-info]');
  if (verifiedBtn) {
    e.stopPropagation();
    e.preventDefault();
    openVerifiedSheet(verifiedBtn.dataset.verifiedUserId || null);
  }
});

$('wallpaper-save-btn')?.addEventListener('click', () => saveWallpaperSettings());

document.getElementById('wallpaper-customize-sheet')?.addEventListener('click', (e) => {
  const pat = e.target.closest('[data-wp-pattern]');
  const buyStyle = e.target.closest('[data-wp-buy-style]');
  const variant = e.target.closest('[data-wp-variant]');
  if (!state.wallpaperDraft && !buyStyle) return;

  if (buyStyle) {
    purchaseMarketProduct(buyStyle.dataset.wpBuyStyle);
    return;
  }

  if (!state.wallpaperDraft) return;

  if (pat) {
    state.wallpaperDraft.patternId = pat.dataset.wpPattern || null;
    renderWallpaperCustomizeSheet();
  } else if (variant) {
    state.wallpaperDraft.variant = variant.dataset.wpVariant;
    if (variant.dataset.wpVariant === 'custom') {
      /* keep custom colors */
    } else {
      state.wallpaperDraft.customBg = null;
      state.wallpaperDraft.customPatternColor = null;
    }
    syncWallpaperDraftVariant(state.wallpaperDraft);
    renderWallpaperCustomizeSheet();
  }
});

['wallpaper-custom-bg', 'wallpaper-custom-pattern', 'wallpaper-pattern-opacity', 'wallpaper-gradient-opacity'].forEach((id) => {
  $(id)?.addEventListener('input', () => {
    if (state.wallpaperDraft) {
      if (id === 'wallpaper-gradient-opacity') {
        syncWallpaperDraftVariant(state.wallpaperDraft);
      } else {
        state.wallpaperDraft.variant = 'custom';
      }
      previewWallpaper(readWallpaperDraftFromForm(), $('wallpaper-preview'));
    }
  });
});

async function handleLayerBack(layer = getTopLayer()) {
  if (!layer) return;

  switch (layer) {
    case 'chat':
      await closeChatProfileIfOpen();
      stopChatStatusRefresh();
      clearReplyTo();
      await popLayer();
      syncNotificationPresence();
      if (!isDesktop()) {
        switchTab('chats');
      } else {
        updateDesktopChatEmpty();
        renderChatsList();
      }
      loadChats();
      break;
    case 'userProfile':
      await closeUserProfile();
      break;
    case 'privacy':
      await popLayer();
      switchTab('profile');
      break;
    case 'admin': {
      const detail = $('admin-detail');
      if (detail?.classList.contains('open')) {
        $('admin-detail-close')?.click();
      } else {
        await popLayer();
        switchTab('profile');
      }
      break;
    }
    case 'profileEdit':
      await closeProfileEdit();
      break;
    case 'myProfile':
      await closeMyProfileScreen();
      break;
    case 'walletHistory':
      await popLayer();
      break;
    default:
      await popLayer();
  }
}

async function init() {
  initTheme();
  initNav(screens);
  initSwipeNav({
    getScreen: (name) => screens[name],
    onLayerBack: handleLayerBack,
    onSearchClose: () => setSearchOpen(false),
    onSheetClose: () => closeAllSheets(),
    onMessageMenuClose: () => closeMessageMenu(),
    onContextMenuClose: () => closeChatContextMenu(),
    onAccountModalClose: () => closeAccountModal(),
    onAdminModClose: () => $('admin-mod-sheet-cancel')?.click(),
    onRegisterBack: () => showScreen('login'),
    onImageLightboxClose: () => $('image-lightbox')?.classList.add('hidden'),
  });
  initAdmin({
    pushLayer,
    popLayer,
    switchTab,
    showSnackbar,
    getUser: () => state.user,
  });
  initDesktop({
    onTabSwitch: switchTab,
    onSearchOpen: () => setSearchOpen(true),
  });
  initRealtimeHandlers();
  await waitForMaterial();
  await loadWallpaperConfig();

  try {
    const data = await api.me();
    state.user = data.user;
    syncAdminButton(state.user);
    syncCoverGradients();
    applyCosmetics();
    routeAfterAuth(data);
  } catch (err) {
    showScreen('login');
    showAccountStatusFromError(err);
  }

  loader?.classList.add('hidden');

  initAllCoverPatterns();

  requestAnimationFrame(() => {
    updateNavIndicator(state.activeTab, false);
    syncDesktopTab(state.activeTab);
    updateDesktopChatEmpty();
  });

  let coverPatternResizeTimer;
  window.addEventListener('resize', () => {
    updateNavIndicator(state.activeTab, false);
    updateDesktopChatEmpty();
    clearTimeout(coverPatternResizeTimer);
    coverPatternResizeTimer = setTimeout(refreshCoverPatterns, 200);
  });
}

init();
