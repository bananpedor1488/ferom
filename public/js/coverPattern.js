/**
 * Ferom — фоновый паттерн Material Symbols (Telegram-style, без наложений)
 */

const MESSENGER_ICONS = [
  'forum', 'chat_bubble', 'send', 'favorite', 'star', 'emoji_emotions',
  'image', 'mic', 'group', 'notifications', 'verified', 'bolt',
  'celebration', 'mood', 'thumb_up', 'alternate_email', 'tag', 'share',
];

const WALLET_ICONS = [
  'diamond', 'account_balance_wallet', 'payments', 'credit_card',
  'verified', 'bolt', 'star', 'favorite', 'savings', 'loyalty',
];

const DESKTOP_EMPTY_ICONS = [
  'forum', 'chat_bubble', 'send', 'favorite', 'emoji_emotions', 'group',
  'verified', 'star', 'share',
];

/** Компактная шапка (чужой / свой профиль) — крупнее, по всей высоте */
const PROFILE_HEADER_SLOTS = [
  { x: 7, y: 7, size: 34, rotate: -14, opacity: 0.12 },
  { x: 91, y: 5, size: 30, rotate: 16, opacity: 0.1 },
  { x: 93, y: 26, size: 36, rotate: -20, opacity: 0.11 },
  { x: 5, y: 34, size: 32, rotate: 10, opacity: 0.1 },
  { x: 80, y: 44, size: 28, rotate: -12, opacity: 0.09 },
  { x: 12, y: 54, size: 30, rotate: 18, opacity: 0.09 },
  { x: 88, y: 64, size: 32, rotate: -8, opacity: 0.1 },
  { x: 22, y: 74, size: 28, rotate: 14, opacity: 0.08 },
  { x: 58, y: 12, size: 26, rotate: -6, opacity: 0.08 },
  { x: 48, y: 82, size: 30, rotate: 20, opacity: 0.08 },
];

/** Шапка профиля на вкладке настроек */
const PROFILE_HERO_SLOTS = [
  { x: 6, y: 6, size: 38, rotate: -12, opacity: 0.12 },
  { x: 92, y: 4, size: 34, rotate: 15, opacity: 0.11 },
  { x: 95, y: 32, size: 40, rotate: -22, opacity: 0.12 },
  { x: 4, y: 38, size: 34, rotate: 8, opacity: 0.1 },
  { x: 74, y: 50, size: 30, rotate: -16, opacity: 0.1 },
  { x: 10, y: 62, size: 36, rotate: 12, opacity: 0.09 },
  { x: 52, y: 14, size: 28, rotate: -8, opacity: 0.08 },
  { x: 32, y: 78, size: 32, rotate: 20, opacity: 0.09 },
  { x: 86, y: 72, size: 34, rotate: -10, opacity: 0.09 },
  { x: 60, y: 88, size: 28, rotate: 16, opacity: 0.08 },
];

const COVER_TARGETS = [
  { id: 'profile-hero-bg', variant: 'profile-hero' },
  { id: 'my-profile-bg', variant: 'profile-header' },
  { id: 'user-profile-bg', variant: 'profile-header' },
  { selector: '.wallet-hero', variant: 'wallet', seed: 'wallet-hero' },
  { id: 'desktop-chat-empty', variant: 'desktop', seed: 'desktop-empty' },
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIcons(pool, count, rand) {
  const bag = [...pool];
  const picked = [];
  while (picked.length < count && bag.length) {
    picked.push(bag.splice(Math.floor(rand() * bag.length), 1)[0]);
  }
  return picked;
}

function slotsForVariant(variant) {
  if (variant === 'profile-header') return PROFILE_HEADER_SLOTS;
  if (variant === 'profile-hero') return PROFILE_HERO_SLOTS;
  if (variant === 'wallet') return PROFILE_HERO_SLOTS.slice(0, 7);
  if (variant === 'desktop') return PROFILE_HEADER_SLOTS;
  return PROFILE_HERO_SLOTS;
}

function iconPoolForVariant(variant) {
  if (variant === 'wallet') return WALLET_ICONS;
  if (variant === 'desktop') return DESKTOP_EMPTY_ICONS;
  return MESSENGER_ICONS;
}

export function ensureCoverPattern(container, options = {}) {
  if (!container) return;

  const variant = options.variant
    || container.dataset.coverPattern
    || (container.id === 'profile-hero-bg' ? 'profile-hero' : 'profile-header');
  const seedKey = options.seed || container.id || container.dataset.coverPatternSeed || variant;
  const dimKey = `${container.offsetWidth}x${container.offsetHeight}`;
  const cacheKey = `${seedKey}:${variant}:${dimKey}`;

  const existing = container.querySelector('.cover-icon-pattern');
  if (!options.force && existing?.dataset.cacheKey === cacheKey) return;
  existing?.remove();

  const rand = mulberry32(hashString(`${seedKey}-${variant}`));
  const slots = slotsForVariant(variant);
  const icons = pickIcons(iconPoolForVariant(variant), slots.length, rand);

  const layer = document.createElement('div');
  layer.className = `cover-icon-pattern cover-icon-pattern--${variant}`;
  layer.dataset.cacheKey = cacheKey;
  layer.dataset.variant = variant;
  layer.setAttribute('aria-hidden', 'true');

  slots.forEach((slot, i) => {
    const icon = document.createElement('span');
    icon.className = 'cover-icon-pattern__icon material-symbols-rounded';
    icon.textContent = icons[i] || icons[0];

    const jitter = variant === 'profile-header' ? 3 : 4;
    const w = container.offsetWidth || 360;
    const sizeScale = Math.min(1.12, Math.max(0.95, w / 340));
    const x = slot.x + (rand() - 0.5) * jitter;
    const y = slot.y + (rand() - 0.5) * jitter;
    const size = Math.round(slot.size * sizeScale);

    icon.style.setProperty('--x', `${x}%`);
    icon.style.setProperty('--y', `${y}%`);
    icon.style.setProperty('--rotate', `${slot.rotate}deg`);
    icon.style.setProperty('--size', `${size}px`);
    icon.style.setProperty('--opacity', String(slot.opacity));

    if (variant === 'wallet' && i % 3 === 0) {
      icon.classList.add('cover-icon-pattern__icon--filled');
    }

    layer.appendChild(icon);
  });

  container.prepend(layer);
}

export function initAllCoverPatterns() {
  COVER_TARGETS.forEach(({ id, selector, variant, seed }) => {
    const el = id ? document.getElementById(id) : document.querySelector(selector);
    if (el) ensureCoverPattern(el, { variant, seed: seed || id || selector, force: true });
  });
}

export function refreshCoverPatterns() {
  document.querySelectorAll('.cover-icon-pattern').forEach((el) => el.remove());
  initAllCoverPatterns();
}
