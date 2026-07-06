/**
 * Ferom — применение обоев чата (слои: фон + градиент + узор)
 */

let configCache = null;

const FALLBACK_VARIANTS = {
  light: { label: 'Светлая', bg: '#efeae2', patternColor: '#6b5c52', opacity: 0.14, dark: false },
  dark: { label: 'Тёмная', bg: '#18181b', patternColor: '#d4d4d8', opacity: 0.11, dark: true },
  night: { label: 'Ночная', bg: '#0c1222', patternColor: '#94a3b8', opacity: 0.16, dark: true },
  cream: { label: 'Крем', bg: '#faf6f0', patternColor: '#92704a', opacity: 0.13, dark: false },
  sky: { label: 'Небо', bg: '#e8f4fc', patternColor: '#0284c7', opacity: 0.12, dark: false },
  peach: { label: 'Персик', bg: '#fff0e8', patternColor: '#e11d48', opacity: 0.12, dark: false },
  lime: { label: 'Лайм', bg: '#f0fde4', patternColor: '#65a30d', opacity: 0.13, dark: false },
  ice: { label: 'Лёд', bg: '#f0f9ff', patternColor: '#0369a1', opacity: 0.11, dark: false },
  ocean: { label: 'Океан', bg: '#dbeef5', patternColor: '#2563eb', opacity: 0.13, dark: false },
  lavender: { label: 'Лаванда', bg: '#ede9fe', patternColor: '#7c3aed', opacity: 0.12, dark: false },
  mint: { label: 'Мята', bg: '#d1fae5', patternColor: '#059669', opacity: 0.13, dark: false },
  rose: { label: 'Роза', bg: '#fce7f3', patternColor: '#db2777', opacity: 0.13, dark: false },
  sand: { label: 'Песок', bg: '#fef3c7', patternColor: '#b45309', opacity: 0.12, dark: false },
  sunset: { label: 'Закат', bg: '#fff1eb', patternColor: '#ea580c', opacity: 0.12, dark: false },
  aurora: { label: 'Aurora', bg: '#ecfeff', patternColor: '#0891b2', opacity: 0.13, dark: false },
  cherry: { label: 'Вишня', bg: '#fff1f2', patternColor: '#be123c', opacity: 0.13, dark: false },
  graphite: { label: 'Графит', bg: '#27272a', patternColor: '#a1a1aa', opacity: 0.12, dark: true },
  slate: { label: 'Сланец', bg: '#1e293b', patternColor: '#64748b', opacity: 0.14, dark: true },
  forest: { label: 'Лес', bg: '#14241a', patternColor: '#4ade80', opacity: 0.13, dark: true },
  wine: { label: 'Вино', bg: '#2a1215', patternColor: '#fb7185', opacity: 0.14, dark: true },
  midnight: { label: 'Полночь', bg: '#0f0a1e', patternColor: '#818cf8', opacity: 0.15, dark: true },
  ember: { label: 'Угольки', bg: '#1c1410', patternColor: '#fb923c', opacity: 0.14, dark: true },
  cyber: { label: 'Кибер', bg: '#0a0f14', patternColor: '#22d3ee', opacity: 0.16, dark: true },
  premium_classic: {
    label: 'Классика',
    bg: '#efeae2',
    patternColor: '#7c3aed',
    opacity: 0.14,
    dark: false,
    gradientId: 'chat_wallpaper_pack',
    requiresProduct: 'chat_wallpaper_pack',
  },
  premium_space: {
    label: 'Космос',
    bg: '#0c1222',
    patternColor: '#c4b5fd',
    opacity: 0.16,
    dark: true,
    gradientId: 'wallpaper_space',
    requiresProduct: 'wallpaper_space',
  },
  premium_mesh: {
    label: 'Mesh',
    bg: '#fdf2f8',
    patternColor: '#db2777',
    opacity: 0.13,
    dark: false,
    gradientId: 'wallpaper_mesh',
    requiresProduct: 'wallpaper_mesh',
  },
  premium_sunset: {
    label: 'Закат Pro',
    bg: '#fff1eb',
    patternColor: '#ea580c',
    opacity: 0.13,
    dark: false,
    gradientId: 'wallpaper_sunset_glow',
    requiresProduct: 'wallpaper_sunset_glow',
  },
  premium_northern: {
    label: 'Сияние',
    bg: '#0a1628',
    patternColor: '#34d399',
    opacity: 0.15,
    dark: true,
    gradientId: 'wallpaper_northern',
    requiresProduct: 'wallpaper_northern',
  },
  premium_gold: {
    label: 'Золото',
    bg: '#1a1410',
    patternColor: '#fbbf24',
    opacity: 0.14,
    dark: true,
    gradientId: 'wallpaper_gold',
    requiresProduct: 'wallpaper_gold',
  },
  premium_neon: {
    label: 'Неон',
    bg: '#0a0a12',
    patternColor: '#e879f9',
    opacity: 0.16,
    dark: true,
    gradientId: 'wallpaper_neon_dream',
    requiresProduct: 'wallpaper_neon_dream',
  },
  premium_sakura: {
    label: 'Сакура',
    bg: '#fff5f7',
    patternColor: '#f472b6',
    opacity: 0.13,
    dark: false,
    gradientId: 'wallpaper_sakura',
    requiresProduct: 'wallpaper_sakura',
  },
  custom: { label: 'Свой цвет', bg: '#efeae2', patternColor: '#6b5c52', opacity: 0.14, dark: false },
};

const GRADIENT_TO_VARIANT = {
  chat_wallpaper_pack: 'premium_classic',
  wallpaper_space: 'premium_space',
  wallpaper_mesh: 'premium_mesh',
  wallpaper_sunset_glow: 'premium_sunset',
  wallpaper_northern: 'premium_northern',
  wallpaper_gold: 'premium_gold',
  wallpaper_neon_dream: 'premium_neon',
  wallpaper_sakura: 'premium_sakura',
};

const FALLBACK_GRADIENTS = {
  chat_wallpaper_pack: 'radial-gradient(ellipse at 20% 0%, rgba(124,58,237,0.28), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(168,85,247,0.22), transparent 45%)',
  wallpaper_space: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.35), transparent 55%), linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,27,75,0.98) 100%)',
  wallpaper_mesh: 'radial-gradient(at 0% 0%, rgba(236,72,153,0.3), transparent 50%), radial-gradient(at 100% 100%, rgba(59,130,246,0.28), transparent 50%)',
  wallpaper_sunset_glow: 'radial-gradient(ellipse at 20% 20%, rgba(251,146,60,0.35), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(244,63,94,0.28), transparent 50%), linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)',
  wallpaper_northern: 'radial-gradient(ellipse at 30% 10%, rgba(52,211,153,0.35), transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(56,189,248,0.28), transparent 45%), radial-gradient(ellipse at 50% 90%, rgba(167,139,250,0.22), transparent 55%), linear-gradient(180deg, #0a1628 0%, #0f172a 100%)',
  wallpaper_gold: 'radial-gradient(ellipse at 25% 0%, rgba(251,191,36,0.32), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(217,119,6,0.25), transparent 45%), linear-gradient(180deg, #1a1410 0%, #292018 100%)',
  wallpaper_neon_dream: 'radial-gradient(ellipse at 15% 20%, rgba(232,121,249,0.35), transparent 50%), radial-gradient(ellipse at 85% 75%, rgba(34,211,238,0.3), transparent 50%), linear-gradient(180deg, #0a0a12 0%, #18181b 100%)',
  wallpaper_sakura: 'radial-gradient(ellipse at 20% 15%, rgba(244,114,182,0.3), transparent 50%), radial-gradient(ellipse at 75% 85%, rgba(251,207,232,0.35), transparent 55%), linear-gradient(180deg, #fff5f7 0%, #fce7f3 100%)',
};

const FALLBACK_PATTERNS = {
  wallpaper_doodle: { file: 'doodle.svg', size: '320px 320px' },
  wallpaper_geometry: { file: 'geometry.svg', size: '280px 280px' },
  wallpaper_blossom: { file: 'blossom.svg', size: '300px 300px' },
  wallpaper_waves: { file: 'waves.svg', size: '320px 160px' },
  wallpaper_cats: { file: 'cats.svg', size: '300px 300px' },
  wallpaper_retro: { file: 'retro.svg', size: '240px 240px' },
  wallpaper_night_doodle: { file: 'night-doodle.svg', size: '320px 320px' },
  wallpaper_stars: { file: 'stars.svg', size: '260px 260px' },
  wallpaper_hearts: { file: 'hearts.svg', size: '280px 280px' },
  wallpaper_hex: { file: 'hex.svg', size: '240px 240px' },
  wallpaper_bubbles: { file: 'bubbles.svg', size: '300px 300px' },
  wallpaper_dots: { file: 'dots.svg', size: '200px 200px' },
  wallpaper_leaves: { file: 'leaves.svg', size: '280px 280px' },
  wallpaper_music: { file: 'music.svg', size: '300px 300px' },
  wallpaper_coffee: { file: 'coffee.svg', size: '280px 280px' },
};

export function setWallpaperConfig(config) {
  configCache = config;
}

export function getWallpaperConfig() {
  return configCache;
}

function getPatternMeta(id) {
  const fromApi = configCache?.patterns?.find((p) => p.id === id);
  if (fromApi) return { file: fromApi.file, size: fromApi.size };
  return FALLBACK_PATTERNS[id] || null;
}

export function resolveWallpaperRender(settings) {
  if (!settings) return null;
  const variant = FALLBACK_VARIANTS[settings.variant] || FALLBACK_VARIANTS.light;
  const gradientId = settings.gradientId || variant.gradientId || null;
  const bg = settings.variant === 'custom' && settings.customBg
    ? settings.customBg
    : variant.bg;
  const patternColor = settings.variant === 'custom' && settings.customPatternColor
    ? settings.customPatternColor
    : variant.patternColor;
  const patternOpacity = settings.patternOpacity ?? variant.opacity;
  const pattern = settings.patternId ? getPatternMeta(settings.patternId) : null;
  const gradientCss = gradientId
    ? (FALLBACK_GRADIENTS[gradientId] || null)
    : null;

  return {
    bg,
    patternColor,
    patternOpacity,
    patternUrl: pattern ? `/assets/wallpapers/${pattern.file}` : null,
    patternSize: pattern?.size || '300px 300px',
    gradientCss,
    gradientOpacity: settings.gradientOpacity ?? 0.62,
    dark: variant.dark || (gradientId === 'wallpaper_space' && !settings.patternId),
  };
}

export function syncWallpaperDraftVariant(draft) {
  if (!draft) return draft;
  const variant = FALLBACK_VARIANTS[draft.variant];
  if (variant?.gradientId) {
    draft.gradientId = variant.gradientId;
  } else if (draft.variant !== 'custom') {
    draft.gradientId = null;
    draft.customBg = null;
    draft.customPatternColor = null;
  }
  return draft;
}

export function isPremiumWallpaperVariant(variantId) {
  return Boolean(FALLBACK_VARIANTS[variantId]?.requiresProduct);
}

export function variantFromGradientProduct(productId) {
  return GRADIENT_TO_VARIANT[productId] || null;
}

export function getWallpaperGradientCss(gradientId) {
  return FALLBACK_GRADIENTS[gradientId] || null;
}

export function isGradientWallpaperProduct(productId) {
  return Boolean(GRADIENT_TO_VARIANT[productId]);
}

function clearWallpaperLayers(bgEl, gradEl, patEl) {
  if (bgEl) bgEl.style.background = '';
  if (gradEl) {
    gradEl.style.background = '';
    gradEl.style.opacity = '';
    gradEl.classList.add('hidden');
  }
  if (patEl) {
    patEl.style.backgroundColor = '';
    patEl.style.maskImage = '';
    patEl.style.webkitMaskImage = '';
    patEl.style.maskSize = '';
    patEl.style.webkitMaskSize = '';
    patEl.style.opacity = '';
    patEl.classList.add('hidden');
  }
}

export function applyChatWallpaper(user, rootEl) {
  const chatRoom = rootEl || document.getElementById('screen-chat');
  if (!chatRoom) return;

  const bgEl = document.getElementById('chat-wallpaper-bg');
  const gradEl = document.getElementById('chat-wallpaper-gradient');
  const patEl = document.getElementById('chat-wallpaper-pattern');
  const settings = user?.wallpaperSettings;
  const render = settings ? resolveWallpaperRender(settings) : null;
  const hasWallpaper = Boolean(render?.patternUrl || render?.gradientCss);

  chatRoom.classList.toggle('chat-room--wallpaper', hasWallpaper);
  chatRoom.classList.toggle('chat-room--wallpaper-dark', Boolean(hasWallpaper && render?.dark));
  chatRoom.removeAttribute('data-wallpaper');

  if (!hasWallpaper) {
    clearWallpaperLayers(bgEl, gradEl, patEl);
    return;
  }

  if (bgEl) bgEl.style.background = render.bg;

  if (gradEl) {
    if (render.gradientCss) {
      gradEl.style.background = render.gradientCss;
      gradEl.style.opacity = String(render.gradientOpacity);
      gradEl.classList.remove('hidden');
    } else {
      gradEl.style.background = '';
      gradEl.style.opacity = '';
      gradEl.classList.add('hidden');
    }
  }

  if (patEl) {
    if (render.patternUrl) {
      patEl.style.backgroundColor = render.patternColor;
      patEl.style.maskImage = `url('${render.patternUrl}')`;
      patEl.style.webkitMaskImage = `url('${render.patternUrl}')`;
      patEl.style.maskSize = render.patternSize;
      patEl.style.webkitMaskSize = render.patternSize;
      patEl.style.maskRepeat = 'repeat';
      patEl.style.webkitMaskRepeat = 'repeat';
      patEl.style.opacity = String(render.patternOpacity);
      patEl.classList.remove('hidden');
    } else {
      patEl.style.backgroundColor = '';
      patEl.style.maskImage = '';
      patEl.style.webkitMaskImage = '';
      patEl.classList.add('hidden');
    }
  }
}

export function previewWallpaper(settings, previewEl) {
  if (!previewEl) return;
  const render = resolveWallpaperRender(settings);
  if (!render) {
    previewEl.style.background = 'var(--md-sys-color-surface-container-lowest)';
    previewEl.innerHTML = '';
    return;
  }

  previewEl.innerHTML = `
    <div class="wp-preview__bg" style="background:${render.bg}"></div>
    ${render.gradientCss ? `<div class="wp-preview__grad" style="background:${render.gradientCss};opacity:${render.gradientOpacity}"></div>` : ''}
    ${render.patternUrl ? `<div class="wp-preview__pat" style="background-color:${render.patternColor};opacity:${render.patternOpacity};-webkit-mask-image:url('${render.patternUrl}');mask-image:url('${render.patternUrl}');-webkit-mask-size:${render.patternSize};mask-size:${render.patternSize};-webkit-mask-repeat:repeat;mask-repeat:repeat"></div>` : ''}
  `;
}

export function defaultWallpaperDraft(user, productId = null) {
  const base = user?.wallpaperSettings || {
    patternId: null,
    variant: 'light',
    customBg: null,
    customPatternColor: null,
    patternOpacity: null,
    gradientId: null,
    gradientOpacity: 0.62,
  };
  if (!productId) return { ...base };
  if (FALLBACK_PATTERNS[productId]) {
    return {
      ...base,
      patternId: productId,
      variant: productId === 'wallpaper_night_doodle' ? 'night' : base.variant,
    };
  }
  if (FALLBACK_GRADIENTS[productId]) {
    const variant = GRADIENT_TO_VARIANT[productId] || 'premium_classic';
    return {
      ...base,
      patternId: null,
      variant,
      gradientId: productId,
    };
  }
  return { ...base };
}

export const WALLPAPER_VARIANTS = FALLBACK_VARIANTS;
