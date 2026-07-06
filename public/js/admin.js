/**
 * Ferom — админ-панель (полный UI)
 */
import { api } from './api.js';

let deps = {};
const state = {
  tab: 'dashboard',
  stats: null,
  users: { list: [], total: 0, offset: 0, q: '', filter: 'all', loading: false },
  wallet: { data: null, offset: 0, loading: false },
  tags: { list: [], total: 0, offset: 0, q: '', filter: 'all', loading: false },
  mod: { list: [], total: 0, offset: 0, loading: false },
  detailUserId: null,
  detailUser: null,
  detailLoading: false,
  detailError: null,
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatNum(n) {
  return Math.round(Number(n) || 0).toLocaleString('ru-RU');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function avatarHtml(url, name, size = '') {
  const initial = escapeHtml((name || '?').charAt(0).toUpperCase());
  const cls = size ? `avatar ${size}` : 'avatar';
  if (url) return `<div class="${cls}"><img src="${escapeHtml(url)}" alt=""></div>`;
  return `<div class="${cls}">${initial}</div>`;
}

function userBadges(u) {
  return [
    u.isFrozen ? '<span class="admin-badge admin-badge--frozen">Заморозка</span>' : '',
    u.isBanned ? '<span class="admin-badge admin-badge--banned">Бан</span>' : '',
    u.mustSetPassword ? '<span class="admin-badge admin-badge--pwd">Новый пароль</span>' : '',
    u.isAdmin ? '<span class="admin-badge admin-badge--admin">Admin</span>' : '',
    u.isPremium ? '<span class="admin-badge admin-badge--premium">Premium</span>' : '',
    u.isVerified ? '<span class="admin-badge admin-badge--verified">Верификация</span>' : '',
  ].filter(Boolean).join('');
}

function userTag(u) {
  if (u.primaryTag) return `@${u.primaryTag}`;
  if (u.username) return `@${u.username}`;
  return '—';
}

// ─── Tabs ───

function switchAdminTab(tab, opts = {}) {
  state.tab = tab;
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.adminTab === tab);
  });
  document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
    const active = panel.dataset.adminPanel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });

  if (opts.filter && tab === 'users') {
    state.users.filter = opts.filter;
    document.querySelectorAll('[data-user-filter]').forEach((c) => {
      c.classList.toggle('active', c.dataset.userFilter === opts.filter);
    });
    loadUsers(true);
  } else if (opts.filter && tab === 'tags') {
    state.tags.filter = opts.filter;
    document.querySelectorAll('[data-tag-filter]').forEach((c) => {
      c.classList.toggle('active', c.dataset.tagFilter === opts.filter);
    });
    loadTags(true);
  } else if (tab === 'wallet' && !state.wallet.data) {
    loadWallet(true);
  } else if (tab === 'tags' && !state.tags.list.length) {
    loadTags(true);
  } else if (tab === 'moderation' && !state.mod.list.length) {
    loadModeration(true);
  }
}

// ─── Dashboard ───

function renderDashboard() {
  const el = $('admin-stats');
  if (!el || !state.stats) return;
  const s = state.stats;

  const items = [
    { icon: 'group', value: s.users, label: 'Пользователей', delta: `+${s.todayUsers} сегодня` },
    { icon: 'chat', value: s.messages, label: 'Сообщений', delta: `+${s.todayMessages} сегодня` },
    { icon: 'forum', value: s.chats, label: 'Чатов' },
    { icon: 'sell', value: s.collectibles, label: '@ Тегов NFT', delta: `${s.listedCollectibles} на маркете` },
    { icon: 'diamond', value: formatNum(s.totalRubies), label: 'Рубинов в системе', accent: true },
    { icon: 'workspace_premium', value: s.premiumUsers, label: 'Premium' },
    { icon: 'admin_panel_settings', value: s.adminUsers, label: 'Админов' },
    { icon: 'block', value: s.bannedUsers, label: 'Заблокировано', warn: true },
    { icon: 'ac_unit', value: s.frozenUsers ?? 0, label: 'Заморожено' },
  ];

  el.innerHTML = items.map((i) => `
    <div class="admin-stat${i.accent ? ' admin-stat--accent' : ''}${i.warn ? ' admin-stat--warn' : ''}">
      <span class="material-symbols-rounded admin-stat__icon">${i.icon}</span>
      <span class="admin-stat__value">${typeof i.value === 'number' ? i.value.toLocaleString('ru-RU') : i.value}</span>
      <span class="admin-stat__label">${i.label}</span>
      ${i.delta ? `<span class="admin-stat__delta">${i.delta}</span>` : ''}
    </div>
  `).join('');
}

async function loadStats() {
  state.stats = await api.adminStats();
  renderDashboard();
}

// ─── Users ───

function renderUsers() {
  const list = $('admin-users-list');
  const more = $('admin-users-more');
  if (!list) return;

  if (!state.users.list.length) {
    list.innerHTML = '<p class="admin-empty">Пользователи не найдены</p>';
    if (more) more.hidden = true;
    return;
  }

  list.innerHTML = state.users.list.map((u) => `
    <button type="button" class="admin-user-row${state.detailUserId === u.id ? ' selected' : ''}" data-open-user="${u.id}">
      ${avatarHtml(u.avatarUrl, u.displayName || u.username)}
      <div class="admin-user-row__meta">
        <div class="admin-user-row__name">${escapeHtml(u.displayName || u.username || 'Без имени')}</div>
        <div class="admin-user-row__tag">${escapeHtml(userTag(u))}</div>
        <div class="admin-user-row__sub">${escapeHtml(u.email)}</div>
      </div>
      <div class="admin-user-row__badges-row">
        <div class="admin-badges">${userBadges(u)}</div>
        <span class="admin-user-row__balance">${formatNum(u.walletBalance)} ◆</span>
      </div>
    </button>
  `).join('');

  if (more) {
    const hasMore = state.users.list.length < state.users.total;
    more.hidden = !hasMore;
    more.disabled = state.users.loading;
    more.textContent = state.users.loading ? 'Загрузка…' : 'Загрузить ещё';
  }
}

async function loadUsers(reset = false) {
  if (state.users.loading) return;
  state.users.loading = true;
  if (reset) { state.users.offset = 0; state.users.list = []; }

  try {
    const data = await api.adminUsers({
      q: state.users.q,
      filter: state.users.filter,
      limit: 40,
      offset: state.users.offset,
    });
    state.users.total = data.total;
    state.users.list = reset ? data.users : [...state.users.list, ...data.users];
    state.users.offset = state.users.list.length;
    renderUsers();
  } finally {
    state.users.loading = false;
    renderUsers();
  }
}

// ─── User detail ───

function openDetailPanel() {
  const panel = $('admin-detail');
  const layout = document.querySelector('.admin-layout');
  panel?.removeAttribute('hidden');
  requestAnimationFrame(() => {
    panel?.classList.add('open');
    layout?.classList.add('detail-open');
  });
}

function closeDetailPanel() {
  const panel = $('admin-detail');
  const layout = document.querySelector('.admin-layout');
  panel?.classList.remove('open');
  layout?.classList.remove('detail-open');
  state.detailUserId = null;
  state.detailUser = null;
  state.detailError = null;
  renderUsers();
  setTimeout(() => {
    if (!state.detailUserId) panel?.setAttribute('hidden', '');
  }, 280);
}

async function openUserDetail(userId) {
  state.detailUserId = userId;
  state.detailLoading = true;
  state.detailUser = null;
  state.detailError = null;
  openDetailPanel();
  renderUserDetail();
  renderUsers();

  try {
    const data = await api.adminUser(userId);
    state.detailUser = data.user;
  } catch (err) {
    state.detailError = err.message || 'Ошибка загрузки';
    deps.showSnackbar?.(state.detailError);
  } finally {
    state.detailLoading = false;
    renderUserDetail();
  }
}

function renderUserDetail() {
  const body = $('admin-detail-body');
  if (!body) return;

  if (state.detailLoading) {
    body.innerHTML = '<p class="admin-empty">Загрузка…</p>';
    return;
  }

  if (state.detailError || !state.detailUser) {
    body.innerHTML = `<p class="admin-empty">${escapeHtml(state.detailError || 'Пользователь не найден')}</p>`;
    return;
  }

  const u = state.detailUser;
  const name = u.displayName || u.username || 'Без имени';

  body.innerHTML = `
    <div class="admin-detail-hero">
      ${avatarHtml(u.avatarUrl, name)}
      <div class="admin-detail-hero__name">${escapeHtml(name)}</div>
      <div class="admin-detail-hero__tag">${escapeHtml(userTag(u))}</div>
      <div class="admin-detail-hero__email">${escapeHtml(u.email)}</div>
      <div class="admin-badges" style="margin-top:10px">${userBadges(u)}</div>
    </div>

    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">Статистика</h3>
      <div class="admin-detail-grid">
        <div class="admin-detail-kv"><div class="admin-detail-kv__label">ID</div><div class="admin-detail-kv__value">${u.id}</div></div>
        <div class="admin-detail-kv"><div class="admin-detail-kv__label">Сообщений</div><div class="admin-detail-kv__value">${u.messageCount ?? 0}</div></div>
        <div class="admin-detail-kv"><div class="admin-detail-kv__label">Чатов</div><div class="admin-detail-kv__value">${u.chatCount ?? 0}</div></div>
        <div class="admin-detail-kv"><div class="admin-detail-kv__label">@ Тегов</div><div class="admin-detail-kv__value">${u.collectibleCount ?? 0}</div></div>
        <div class="admin-detail-kv"><div class="admin-detail-kv__label">Регистрация</div><div class="admin-detail-kv__value">${formatDate(u.createdAt)}</div></div>
        <div class="admin-detail-kv"><div class="admin-detail-kv__label">Был в сети</div><div class="admin-detail-kv__value">${formatDate(u.lastSeenAt)}</div></div>
      </div>
    </div>

    ${u.isBanned ? `
    <div class="admin-detail-section admin-detail-section--warn">
      <h3 class="admin-detail-section__title">Блокировка</h3>
      <p class="admin-detail-status-text admin-detail-status-text--ban">${escapeHtml(u.banReason || 'Заблокирован')}</p>
      <p class="admin-detail-status-meta">с ${formatDate(u.bannedAt)}</p>
    </div>` : ''}

    ${u.isFrozen ? `
    <div class="admin-detail-section admin-detail-section--warn">
      <h3 class="admin-detail-section__title">Заморозка</h3>
      <p class="admin-detail-status-text admin-detail-status-text--freeze">${escapeHtml(u.freezeReason || 'Заморожен')}</p>
      <p class="admin-detail-status-meta">с ${formatDate(u.frozenAt)}</p>
    </div>` : ''}

    ${u.mustSetPassword ? `
    <div class="admin-detail-section">
      <p class="admin-detail-hint"><span class="material-symbols-rounded">key</span> Ожидает новый пароль — при входе любой пароль от 6 символов станет новым</p>
    </div>` : ''}

    ${u.adminNote ? `
    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">Комментарий админа</h3>
      <p class="admin-detail-note">${escapeHtml(u.adminNote)}</p>
    </div>` : ''}

    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">Кошелёк</h3>
      <div class="admin-wallet-controls">
        <div class="admin-field-row" style="margin:0">
          <label>Баланс (рубины)</label>
          <input type="number" id="admin-detail-balance" value="${Math.round(u.walletBalance)}" min="0" step="1">
        </div>
        <div class="admin-field-row" style="margin:0">
          <label>Комментарий</label>
          <input type="text" id="admin-detail-wallet-note" placeholder="Причина изменения" value="">
        </div>
      </div>
      <div class="admin-wallet-presets">
        <button type="button" data-wallet-delta="100">+100</button>
        <button type="button" data-wallet-delta="500">+500</button>
        <button type="button" data-wallet-delta="1000">+1000</button>
        <button type="button" data-wallet-delta="-100">−100</button>
        <button type="button" data-wallet-delta="0" data-wallet-zero>Обнулить</button>
      </div>
      <button type="button" class="admin-btn admin-btn--primary" data-save-balance>Сохранить баланс</button>
    </div>

    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">Профиль</h3>
      <div class="admin-field-row">
        <label>Имя</label>
        <input type="text" id="admin-detail-name" value="${escapeHtml(u.displayName || '')}" maxlength="50">
      </div>
      <div class="admin-field-row">
        <label>Bio</label>
        <textarea id="admin-detail-bio" maxlength="140">${escapeHtml(u.bio || '')}</textarea>
      </div>
      <button type="button" class="admin-btn" data-save-profile>Сохранить профиль</button>
    </div>

    ${u.collectibles?.length ? `
    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">@ Теги (GOV)</h3>
      ${u.collectibles.map((c) => `
        <span class="admin-collectible-chip">@${escapeHtml(c.slug)}
          <span class="admin-badge">${escapeHtml(c.rarity)}</span>
          ${c.listed ? `<span class="admin-badge">${formatNum(c.listPrice)}◆</span>` : ''}
        </span>
      `).join('')}
    </div>` : ''}

    ${u.recentTransactions?.length ? `
    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">Последние операции</h3>
      <div class="admin-tx-list">
        ${u.recentTransactions.map((t) => `
          <div class="admin-tx">
            <div class="admin-tx__body">
              <div class="admin-tx__title">${escapeHtml(t.title)}</div>
              <div class="admin-tx__sub">${formatDate(t.createdAt)}</div>
            </div>
            <span class="admin-tx__amount ${t.isCredit ? 'admin-tx__amount--credit' : 'admin-tx__amount--debit'}">
              ${t.isCredit ? '+' : ''}${formatNum(t.amount)} ◆
            </span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <div class="admin-detail-section">
      <h3 class="admin-detail-section__title">Модерация</h3>
      <div class="admin-field-row">
        <label>Комментарий администратора</label>
        <textarea id="admin-detail-note" maxlength="500" placeholder="Заметка для себя и других админов…">${escapeHtml(u.adminNote || '')}</textarea>
      </div>
      <button type="button" class="admin-btn" data-save-note>Сохранить комментарий</button>

      <div class="admin-detail-actions admin-detail-actions--spaced">
        <button type="button" class="admin-btn" data-toggle-premium>${u.isPremium ? 'Снять Premium' : 'Выдать Premium'}</button>
        <button type="button" class="admin-btn" data-toggle-verified>${u.isVerified ? 'Снять верификацию' : 'Верифицировать'}</button>
        <button type="button" class="admin-btn" data-toggle-admin>${u.isAdmin ? 'Снять админку' : 'Сделать админом'}</button>
        <button type="button" class="admin-btn" data-force-username>${u.needsUsernameChange ? 'Снять смену username' : 'Заставить сменить @'}</button>
        <button type="button" class="admin-btn admin-btn--danger" data-reset-profile>Сбросить bio</button>
        <button type="button" class="admin-btn admin-btn--warn" data-reset-password>Сбросить пароль</button>
        ${u.isFrozen
    ? '<button type="button" class="admin-btn admin-btn--success" data-unfreeze>Разморозить</button>'
    : '<button type="button" class="admin-btn admin-btn--warn" data-freeze>Заморозить</button>'}
        ${u.isBanned
    ? '<button type="button" class="admin-btn admin-btn--success" data-unban>Разбанить</button>'
    : '<button type="button" class="admin-btn admin-btn--danger" data-ban>Забанить</button>'}
        <button type="button" class="admin-btn admin-btn--danger" data-delete-user>Удалить аккаунт</button>
      </div>
      <p class="admin-detail-hint admin-detail-hint--sub">Сброс пароля: пользователь при входе вводит любой новый пароль (от 6 символов) — он сохранится автоматически.</p>
    </div>
  `;

  body.querySelector('[data-save-balance]')?.addEventListener('click', () => saveDetailBalance());
  body.querySelector('[data-save-profile]')?.addEventListener('click', () => saveDetailProfile());
  body.querySelector('[data-save-note]')?.addEventListener('click', () => saveDetailNote());
  body.querySelector('[data-toggle-premium]')?.addEventListener('click', () => patchDetail({ isPremium: !u.isPremium }));
  body.querySelector('[data-toggle-verified]')?.addEventListener('click', () => patchDetail({ isVerified: !u.isVerified }));
  body.querySelector('[data-toggle-admin]')?.addEventListener('click', () => patchDetail({ isAdmin: !u.isAdmin }));
  body.querySelector('[data-force-username]')?.addEventListener('click', () => patchDetail({ needsUsernameChange: !u.needsUsernameChange }));
  body.querySelector('[data-reset-profile]')?.addEventListener('click', () => patchDetail({ resetProfile: true }));
  body.querySelector('[data-reset-password]')?.addEventListener('click', () => promptResetPassword());
  body.querySelector('[data-freeze]')?.addEventListener('click', () => promptFreeze());
  body.querySelector('[data-unfreeze]')?.addEventListener('click', () => patchDetail({ isFrozen: false }));
  body.querySelector('[data-ban]')?.addEventListener('click', () => promptBan());
  body.querySelector('[data-unban]')?.addEventListener('click', () => patchDetail({ isBanned: false }));
  body.querySelector('[data-delete-user]')?.addEventListener('click', () => promptDeleteUser());

  body.querySelectorAll('[data-wallet-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $('admin-detail-balance');
      if (!input) return;
      if (btn.dataset.walletZero != null) {
        input.value = '0';
        return;
      }
      const delta = parseInt(btn.dataset.walletDelta, 10);
      input.value = String(Math.max(0, parseInt(input.value, 10) + delta));
    });
  });
}

async function patchDetail(patch) {
  if (!state.detailUserId) return;
  try {
    const data = await api.adminPatchUser(state.detailUserId, patch);
    state.detailUser = { ...state.detailUser, ...data.user };
    const idx = state.users.list.findIndex((x) => x.id === state.detailUserId);
    if (idx >= 0) state.users.list[idx] = data.user;
    renderUsers();
    renderUserDetail();
    deps.showSnackbar?.('Сохранено');
  } catch (err) {
    deps.showSnackbar?.(err.message);
  }
}

async function saveDetailBalance() {
  const val = parseInt($('admin-detail-balance')?.value, 10);
  const note = $('admin-detail-wallet-note')?.value?.trim();
  if (!Number.isFinite(val) || val < 0) {
    deps.showSnackbar?.('Некорректный баланс');
    return;
  }
  await patchDetail({ walletBalance: val, walletNote: note || undefined });
}

async function saveDetailProfile() {
  await patchDetail({
    displayName: $('admin-detail-name')?.value,
    bio: $('admin-detail-bio')?.value,
  });
}

async function saveDetailNote() {
  await patchDetail({ adminNote: $('admin-detail-note')?.value ?? '' });
}

function promptBan() {
  openModSheet('ban', 'Заблокировать пользователя', 'Нарушение правил');
}

function promptFreeze() {
  openModSheet('freeze', 'Заморозить аккаунт', 'Подозрительная активность');
}

function promptResetPassword() {
  openModSheet('resetPassword', 'Сбросить пароль', '', false);
}

let modSheetAction = null;

function openModSheet(action, title, defaultReason = '', showReason = true) {
  modSheetAction = action;
  const sheet = $('admin-mod-sheet');
  const reasonRow = $('admin-mod-sheet-reason-row');
  const titleEl = $('admin-mod-sheet-title');
  const reasonEl = $('admin-mod-sheet-reason');
  const noteEl = $('admin-mod-sheet-note');
  if (!sheet || !titleEl) return;

  titleEl.textContent = title;
  if (reasonRow) reasonRow.hidden = !showReason;
  if (reasonEl) reasonEl.value = defaultReason;
  if (noteEl) noteEl.value = $('admin-detail-note')?.value?.trim() || state.detailUser?.adminNote || '';

  sheet.hidden = false;
  sheet.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeModSheet() {
  const sheet = $('admin-mod-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  modSheetAction = null;
  setTimeout(() => { sheet.hidden = true; }, 200);
}

async function submitModSheet() {
  const action = modSheetAction;
  if (!action || !state.detailUserId) return;

  const reason = $('admin-mod-sheet-reason')?.value?.trim() || '';
  const note = $('admin-mod-sheet-note')?.value?.trim() || '';
  const patch = {};

  if (note) patch.adminNote = note;

  if (action === 'ban') {
    patch.isBanned = true;
    patch.banReason = reason || 'Нарушение правил';
  } else if (action === 'freeze') {
    patch.isFrozen = true;
    patch.freezeReason = reason || 'Аккаунт заморожен';
  } else if (action === 'resetPassword') {
    patch.resetPassword = true;
  }

  closeModSheet();
  await patchDetail(patch);
  if (action === 'resetPassword') {
    deps.showSnackbar?.('Пароль сброшен — при входе пользователь задаст новый');
  }
}

async function promptDeleteUser() {
  if (!state.detailUser) return;
  const name = state.detailUser.displayName || state.detailUser.username || state.detailUser.email;
  if (!window.confirm(`Удалить аккаунт «${name}» безвозвратно? Все чаты и данные будут потеряны.`)) return;
  const confirmText = window.prompt('Введите DELETE для подтверждения:');
  if (confirmText !== 'DELETE') {
    deps.showSnackbar?.('Удаление отменено');
    return;
  }
  try {
    await api.adminDeleteUser(state.detailUserId);
    deps.showSnackbar?.('Аккаунт удалён');
    state.users.list = state.users.list.filter((x) => x.id !== state.detailUserId);
    state.users.total = Math.max(0, state.users.total - 1);
    closeDetailPanel();
    renderUsers();
  } catch (err) {
    deps.showSnackbar?.(err.message);
  }
}

// ─── Wallet tab ───

function renderWallet() {
  const hero = $('admin-wallet-hero');
  const top = $('admin-wallet-top');
  const tx = $('admin-wallet-tx');
  const more = $('admin-wallet-more');
  const data = state.wallet.data;
  if (!data) return;

  if (hero) {
    hero.innerHTML = `
      <div class="admin-wallet-stat">
        <div class="admin-wallet-stat__value">${formatNum(data.totalRubies)} ◆</div>
        <div class="admin-wallet-stat__label">Всего рубинов в системе</div>
      </div>
      <div class="admin-wallet-stat">
        <div class="admin-wallet-stat__value">${data.transactionCount.toLocaleString('ru-RU')}</div>
        <div class="admin-wallet-stat__label">Операций в истории</div>
      </div>
    `;
  }

  if (top) {
    top.innerHTML = data.topBalances?.length
      ? data.topBalances.map((u, i) => `
        <div class="admin-top-row">
          <span class="admin-top-row__rank">${i + 1}</span>
          ${avatarHtml(u.avatarUrl, u.name, 'avatar--sm')}
          <span class="admin-top-row__name">${escapeHtml(u.name || u.tag)} <span style="color:var(--md-sys-color-primary)">@${escapeHtml(u.tag || '')}</span></span>
          <span class="admin-top-row__bal">${formatNum(u.balance)} ◆</span>
        </div>
      `).join('')
      : '<p class="admin-empty">Нет данных</p>';
  }

  if (tx) {
    tx.innerHTML = data.transactions?.length
      ? data.transactions.map((t) => {
        const credit = t.amount > 0;
        const who = t.user?.displayName || t.user?.username || `id:${t.user?.id}`;
        return `
          <div class="admin-tx">
            <div class="admin-tx__icon ${credit ? 'admin-tx__icon--credit' : 'admin-tx__icon--debit'}">
              <span class="material-symbols-rounded">${credit ? 'add' : 'remove'}</span>
            </div>
            <div class="admin-tx__body">
              <div class="admin-tx__title">${escapeHtml(who)} · ${escapeHtml(t.type)}</div>
              <div class="admin-tx__sub">${escapeHtml(t.note || '')} · ${formatDate(t.createdAt)}</div>
            </div>
            <span class="admin-tx__amount ${credit ? 'admin-tx__amount--credit' : 'admin-tx__amount--debit'}">
              ${credit ? '+' : ''}${formatNum(t.amount)} ◆
            </span>
          </div>
        `;
      }).join('')
      : '<p class="admin-empty">Операций нет</p>';
  }

  if (more) {
    const loaded = data.transactions?.length || 0;
    more.hidden = loaded >= data.total;
    more.disabled = state.wallet.loading;
  }
}

async function loadWallet(reset = false) {
  if (state.wallet.loading) return;
  state.wallet.loading = true;
  if (reset) state.wallet.offset = 0;

  try {
    const data = await api.adminWallet({ limit: 40, offset: state.wallet.offset });
    if (reset || !state.wallet.data) {
      state.wallet.data = data;
    } else {
      state.wallet.data.transactions = [...state.wallet.data.transactions, ...data.transactions];
    }
    state.wallet.offset = state.wallet.data.transactions.length;
    renderWallet();
  } finally {
    state.wallet.loading = false;
    renderWallet();
  }
}

// ─── Tags tab ───

function renderTags() {
  const list = $('admin-tags-list');
  const more = $('admin-tags-more');
  if (!list) return;

  if (!state.tags.list.length) {
    list.innerHTML = '<p class="admin-empty">Теги не найдены</p>';
    if (more) more.hidden = true;
    return;
  }

  list.innerHTML = state.tags.list.map((c) => {
    const owner = c.owner?.displayName || c.owner?.username || '—';
    return `
      <div class="admin-tag-card">
        <div class="admin-tag-card__slug">@${escapeHtml(c.slug)}</div>
        <div class="admin-tag-card__meta">
          <span class="admin-badge">${escapeHtml(c.rarity)}</span>
          · score ${c.score}
          · ${escapeHtml(owner)}
          ${c.listed ? `· <strong>${formatNum(c.listPrice)} ◆</strong> на маркете` : ''}
        </div>
        <div class="admin-tag-card__actions">
          ${c.listed
    ? `<button type="button" class="admin-btn admin-btn--sm admin-btn--danger" data-unlist-tag="${escapeHtml(c.slug)}">Снять с маркета</button>`
    : `<button type="button" class="admin-btn admin-btn--sm" data-list-tag="${escapeHtml(c.slug)}">Выставить</button>`}
          <button type="button" class="admin-btn admin-btn--sm" data-open-owner="${c.owner?.id}">Владелец</button>
        </div>
      </div>
    `;
  }).join('');

  if (more) {
    more.hidden = state.tags.list.length >= state.tags.total;
    more.disabled = state.tags.loading;
  }
}

async function loadTags(reset = false) {
  if (state.tags.loading) return;
  state.tags.loading = true;
  if (reset) { state.tags.offset = 0; state.tags.list = []; }

  try {
    const data = await api.adminCollectibles({
      q: state.tags.q,
      filter: state.tags.filter,
      limit: 40,
      offset: state.tags.offset,
    });
    state.tags.total = data.total;
    state.tags.list = reset ? data.collectibles : [...state.tags.list, ...data.collectibles];
    state.tags.offset = state.tags.list.length;
    renderTags();
  } finally {
    state.tags.loading = false;
    renderTags();
  }
}

async function unlistTag(slug) {
  try {
    await api.adminPatchCollectible(slug, { unlist: true });
    deps.showSnackbar?.('Снято с маркета');
    loadTags(true);
  } catch (err) {
    deps.showSnackbar?.(err.message);
  }
}

async function listTag(slug) {
  const price = window.prompt('Цена на маркете (рубины):', '100');
  if (price === null) return;
  const n = parseInt(price, 10);
  if (!Number.isFinite(n) || n < 0) {
    deps.showSnackbar?.('Некорректная цена');
    return;
  }
  try {
    await api.adminPatchCollectible(slug, { listPrice: n });
    deps.showSnackbar?.('Выставлено на маркет');
    loadTags(true);
  } catch (err) {
    deps.showSnackbar?.(err.message);
  }
}

// ─── Moderation ───

function renderModeration() {
  const list = $('admin-mod-list');
  const more = $('admin-mod-more');
  if (!list) return;

  if (!state.mod.list.length) {
    list.innerHTML = '<p class="admin-empty">Сообщений нет</p>';
    if (more) more.hidden = true;
    return;
  }

  list.innerHTML = state.mod.list.map((m) => {
    const sender = m.sender?.displayName || m.sender?.username || `id:${m.sender?.id}`;
    return `
      <div class="admin-mod-item${m.deleted ? ' admin-mod-item--deleted' : ''}">
        <div class="admin-mod-item__head">
          <span class="admin-mod-item__sender">${escapeHtml(sender)} ${m.sender?.isBanned ? '<span class="admin-badge admin-badge--banned">бан</span>' : ''}</span>
          <span class="admin-mod-item__time">${formatDate(m.createdAt)} · чат #${m.chatId}</span>
        </div>
        <div class="admin-mod-item__text">${escapeHtml(m.content)}</div>
        ${!m.deleted ? `
        <div class="admin-mod-item__actions">
          <button type="button" class="admin-btn admin-btn--sm admin-btn--danger" data-del-msg="${m.id}">Удалить</button>
          ${m.sender?.id ? `<button type="button" class="admin-btn admin-btn--sm" data-ban-sender="${m.sender.id}">Забанить автора</button>` : ''}
        </div>` : ''}
      </div>
    `;
  }).join('');

  if (more) {
    more.hidden = state.mod.list.length >= state.mod.total;
    more.disabled = state.mod.loading;
  }
}

async function loadModeration(reset = false) {
  if (state.mod.loading) return;
  state.mod.loading = true;
  if (reset) { state.mod.offset = 0; state.mod.list = []; }

  try {
    const data = await api.adminMessages({ limit: 40, offset: state.mod.offset });
    state.mod.total = data.total;
    state.mod.list = reset ? data.messages : [...state.mod.list, ...data.messages];
    state.mod.offset = state.mod.list.length;
    renderModeration();
  } finally {
    state.mod.loading = false;
    renderModeration();
  }
}

async function deleteMessage(id) {
  if (!window.confirm('Удалить сообщение?')) return;
  try {
    await api.adminDeleteMessage(id);
    deps.showSnackbar?.('Удалено');
    loadModeration(true);
  } catch (err) {
    deps.showSnackbar?.(err.message);
  }
}

// ─── Refresh all ───

async function refreshCurrentTab() {
  await loadStats();
  if (state.tab === 'dashboard') return;
  if (state.tab === 'users') await loadUsers(true);
  if (state.tab === 'wallet') { state.wallet.data = null; await loadWallet(true); }
  if (state.tab === 'tags') await loadTags(true);
  if (state.tab === 'moderation') await loadModeration(true);
  if (state.detailUserId) await openUserDetail(state.detailUserId);
}

// ─── Init ───

export function initAdmin(options = {}) {
  deps = options;

  $('admin-back')?.addEventListener('click', async () => {
    closeDetailPanel();
    await deps.popLayer?.();
    deps.switchTab?.('profile');
  });

  $('admin-detail-close')?.addEventListener('click', closeDetailPanel);

  $('admin-refresh')?.addEventListener('click', () => refreshCurrentTab().catch((e) => deps.showSnackbar?.(e.message)));

  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
  });

  document.querySelectorAll('[data-admin-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchAdminTab(btn.dataset.adminGoto, { filter: btn.dataset.adminFilter });
    });
  });

  $('admin-users-search')?.addEventListener('input', (e) => {
    state.users.q = e.target.value.trim();
    clearTimeout(initAdmin._userTimer);
    initAdmin._userTimer = setTimeout(() => loadUsers(true), 300);
  });

  document.getElementById('admin-users-filters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-user-filter]');
    if (!chip) return;
    state.users.filter = chip.dataset.userFilter;
    document.querySelectorAll('[data-user-filter]').forEach((c) => c.classList.toggle('active', c === chip));
    loadUsers(true);
  });

  $('admin-users-more')?.addEventListener('click', () => loadUsers(false));

  $('admin-wallet-more')?.addEventListener('click', () => loadWallet(false));

  $('admin-tags-search')?.addEventListener('input', (e) => {
    state.tags.q = e.target.value.trim();
    clearTimeout(initAdmin._tagTimer);
    initAdmin._tagTimer = setTimeout(() => loadTags(true), 300);
  });

  document.getElementById('admin-tags-filters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-tag-filter]');
    if (!chip) return;
    state.tags.filter = chip.dataset.tagFilter;
    document.querySelectorAll('[data-tag-filter]').forEach((c) => c.classList.toggle('active', c === chip));
    loadTags(true);
  });

  $('admin-tags-more')?.addEventListener('click', () => loadTags(false));
  $('admin-mod-more')?.addEventListener('click', () => loadModeration(false));

  $('admin-mod-sheet-backdrop')?.addEventListener('click', closeModSheet);
  $('admin-mod-sheet-cancel')?.addEventListener('click', closeModSheet);
  $('admin-mod-sheet-submit')?.addEventListener('click', () => submitModSheet());

  $('screen-admin')?.addEventListener('click', (e) => {
    const openUser = e.target.closest('[data-open-user]');
    if (openUser) {
      openUserDetail(parseInt(openUser.dataset.openUser, 10));
      return;
    }

    const unlist = e.target.closest('[data-unlist-tag]');
    if (unlist) { unlistTag(unlist.dataset.unlistTag); return; }

    const listBtn = e.target.closest('[data-list-tag]');
    if (listBtn) { listTag(listBtn.dataset.listTag); return; }

    const owner = e.target.closest('[data-open-owner]');
    if (owner) {
      switchAdminTab('users');
      openUserDetail(parseInt(owner.dataset.openOwner, 10));
      return;
    }

    const delMsg = e.target.closest('[data-del-msg]');
    if (delMsg) { deleteMessage(parseInt(delMsg.dataset.delMsg, 10)); return; }

    const banSender = e.target.closest('[data-ban-sender]');
    if (banSender) {
      const reason = window.prompt('Причина бана:', 'Нарушение правил');
      if (reason === null) return;
      api.adminPatchUser(parseInt(banSender.dataset.banSender, 10), {
        isBanned: true,
        banReason: reason.trim() || 'Нарушение правил',
      }).then(() => {
        deps.showSnackbar?.('Забанен');
        loadModeration(true);
      }).catch((err) => deps.showSnackbar?.(err.message));
    }
  });
}

export async function openAdminScreen() {
  if (!deps.getUser?.()?.isAdmin) {
    deps.showSnackbar?.('Нет доступа');
    return;
  }

  closeDetailPanel();
  switchAdminTab('dashboard');

  try {
    await Promise.all([loadStats(), loadUsers(true)]);
    deps.pushLayer?.('admin');
  } catch (err) {
    deps.showSnackbar?.(err.message || 'Ошибка загрузки админки');
  }
}

export function syncAdminButton(user) {
  const btn = $('btn-admin');
  if (btn) btn.classList.toggle('hidden', !user?.isAdmin);
}
