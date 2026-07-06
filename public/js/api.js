/**
 * Ferom — HTTP-клиент для API
 */

const API_BASE = '/api';

/** Базовый fetch с credentials (JWT cookie) */
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || 'Ошибка запроса');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  register: (email, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),

  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  me: () => request('/auth/me'),

  verifyEmail: (code) =>
    request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ code }) }),

  resendEmailCode: () =>
    request('/auth/verify-email/resend', { method: 'POST', body: JSON.stringify({}) }),

  changeVerifyEmail: (email) =>
    request('/auth/verify-email/change', { method: 'POST', body: JSON.stringify({ email }) }),

  // Profile
  getProfile: () => request('/profile'),

  updateProfile: (data) => {
    if (data.avatarFile) {
      const formData = new FormData();
      if (data.username != null) formData.append('username', data.username);
      if (data.displayName != null) formData.append('displayName', data.displayName);
      formData.append('bio', data.bio ?? '');
      formData.append('avatar', data.avatarFile);
      if (data.avatarPreset) formData.append('avatarPreset', data.avatarPreset);
      if (data.removeAvatar) formData.append('removeAvatar', 'true');
      if (data.coverGradient) formData.append('coverGradient', data.coverGradient);
      return request('/profile', { method: 'PUT', body: formData });
    }

    const body = {};
    if (data.username != null) body.username = data.username;
    if (data.displayName != null) body.displayName = data.displayName;
    if ('bio' in data) body.bio = data.bio ?? '';
    if (data.avatarPreset) body.avatarPreset = data.avatarPreset;
    if (data.removeAvatar) body.removeAvatar = true;
    if ('coverGradient' in data) body.coverGradient = data.coverGradient;

    return request('/profile', { method: 'PUT', body: JSON.stringify(body) });
  },

  getAvatarPresets: () => request('/profile/avatars'),

  searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),

  getChats: () => request('/chats'),

  createChat: (userId) =>
    request('/chats', { method: 'POST', body: JSON.stringify({ userId }) }),

  getMessages: (chatId) => request(`/chats/${chatId}/messages`),

  getChatShared: (chatId, kind = 'media') =>
    request(`/chats/${chatId}/shared?kind=${encodeURIComponent(kind)}`),

  sendMessage: (chatId, content, replyToId = null) =>
    request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, replyToId }),
    }),

  sendMediaMessage: (chatId, file, { type = 'image', content = '', replyToId = null, duration = null } = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (type) formData.append('type', type);
    if (content) formData.append('content', content);
    if (replyToId) formData.append('replyToId', String(replyToId));
    if (duration != null) formData.append('duration', String(duration));
    return request(`/chats/${chatId}/messages`, { method: 'POST', body: formData });
  },

  deleteMessage: (chatId, messageId) =>
    request(`/chats/${chatId}/messages/${messageId}`, { method: 'DELETE' }),

  pinMessage: (chatId, messageId) =>
    request(`/chats/${chatId}/pin`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),

  unpinMessage: (chatId) =>
    request(`/chats/${chatId}/pin`, {
      method: 'POST',
      body: JSON.stringify({ messageId: null }),
    }),

  updateChatSettings: (chatId, data) =>
    request(`/chats/${chatId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteChat: (chatId, scope = 'self') =>
    request(`/chats/${chatId}`, {
      method: 'DELETE',
      body: JSON.stringify({ scope }),
    }),

  toggleReaction: (chatId, messageId, emoji) =>
    request(`/chats/${chatId}/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  getUserProfile: (username) =>
    request(`/users/${encodeURIComponent(username.replace(/^@/, ''))}`),

  getWallet: () => request('/wallet'),

  getWalletTransactions: (limit = 50, offset = 0) =>
    request(`/wallet/transactions?limit=${limit}&offset=${offset}`),

  topupWallet: (amount) =>
    request('/wallet/topup', { method: 'POST', body: JSON.stringify({ amount }) }),

  transferWallet: (toUsername, amount, note) =>
    request('/wallet/transfer', {
      method: 'POST',
      body: JSON.stringify({ toUsername, amount, note }),
    }),

  purchaseProduct: (productId) =>
    request('/wallet/purchase', { method: 'POST', body: JSON.stringify({ productId }) }),

  getMarket: (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.sort) params.set('sort', opts.sort);
    const q = params.toString();
    return request(`/market${q ? `?${q}` : ''}`);
  },

  getInventory: () => request('/market/inventory'),

  equipProduct: (productId) =>
    request('/market/equip', { method: 'POST', body: JSON.stringify({ productId }) }),

  unequipProduct: (productId) =>
    request('/market/unequip', { method: 'POST', body: JSON.stringify({ productId }) }),

  getCollectibleInfo: (slug) => request(`/market/collectibles/info/${encodeURIComponent(slug.replace(/^@/, ''))}`),

  buyCollectible: (slug) =>
    request('/market/collectibles/buy', { method: 'POST', body: JSON.stringify({ slug }) }),

  previewCollectibleMint: () =>
    request('/market/collectibles/preview', { method: 'POST', body: JSON.stringify({}) }),

  mintCollectible: () =>
    request('/market/collectibles/mint', { method: 'POST', body: JSON.stringify({}) }),

  listCollectible: (price, slug) =>
    request('/market/collectibles/list', { method: 'POST', body: JSON.stringify({ price, slug }) }),

  unlistCollectible: (slug) =>
    request('/market/collectibles/unlist', { method: 'POST', body: JSON.stringify({ slug }) }),

  equipCollectible: (slug, setPrimary = true) =>
    request('/market/collectibles/equip', { method: 'POST', body: JSON.stringify({ slug, setPrimary }) }),

  unequipCollectible: (slug) =>
    request('/market/collectibles/unequip', { method: 'POST', body: JSON.stringify({ slug }) }),

  setPrimaryCollectible: (slug) =>
    request('/market/collectibles/primary', { method: 'POST', body: JSON.stringify({ slug }) }),

  getPrivacy: () => request('/privacy'),

  updatePrivacy: (data) =>
    request('/privacy', { method: 'PUT', body: JSON.stringify(data) }),

  getWallpaperConfig: () => request('/market/wallpaper-config'),

  updateWallpaperSettings: (data) =>
    request('/market/wallpaper-settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Admin
  adminStats: () => request('/admin/stats'),

  adminUsers: ({ q = '', filter = 'all', limit = 40, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), filter });
    if (q) params.set('q', q);
    return request(`/admin/users?${params}`);
  },

  adminUser: (userId) => request(`/admin/users/${userId}`),

  adminPatchUser: (userId, data) =>
    request(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  adminDeleteUser: (userId) =>
    request(`/admin/users/${userId}`, { method: 'DELETE' }),

  adminWallet: ({ limit = 40, offset = 0 } = {}) =>
    request(`/admin/wallet?limit=${limit}&offset=${offset}`),

  adminCollectibles: ({ q = '', filter = 'all', limit = 40, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), filter });
    if (q) params.set('q', q);
    return request(`/admin/collectibles?${params}`);
  },

  adminPatchCollectible: (slug, data) =>
    request(`/admin/collectibles/${encodeURIComponent(slug.replace(/^@/, ''))}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  adminMessages: ({ limit = 40, offset = 0 } = {}) =>
    request(`/admin/messages?limit=${limit}&offset=${offset}`),

  adminDeleteMessage: (messageId) =>
    request(`/admin/messages/${messageId}`, { method: 'DELETE' }),

  registerPushToken: (token, platform = 'android') =>
    request('/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),

  unregisterPushToken: (token) =>
    request('/push/register', {
      method: 'DELETE',
      body: JSON.stringify(token ? { token } : {}),
    }),
};
