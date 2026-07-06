/**
 * Уведомления — только Capacitor APK. В браузере модуль не тянет @capacitor/*.
 */
import { api } from './api.js';
import { sendRealtime, onRealtimeOpen, setRealtimeBackgroundPaused } from './realtime.js';

const CHANNELS = [
  { id: 'ferom-messages', name: 'Сообщения', importance: 5 },
  { id: 'ferom-wallet', name: 'Переводы и кошелёк', importance: 4 },
  { id: 'ferom-system', name: 'Системные', importance: 5 },
];

let enabled = false;
let appActive = true;
let notifSeq = 1;
let nativeReady = null;
let ctx = {
  getState: () => ({}),
  isLayerVisible: () => false,
  onOpenChat: null,
  onOpenWallet: null,
};

function isNative() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  return Boolean(cap?.isNativePlatform?.());
}

/** Плагины Capacitor — только нативный мост, без import() с сервера */
function loadNativePlugins() {
  if (!isNative()) return Promise.resolve(null);
  if (nativeReady) return nativeReady;

  nativeReady = Promise.resolve().then(() => {
    const cap = window.Capacitor;
    const Plugins = cap?.Plugins;
    if (!Plugins) {
      console.warn('Capacitor.Plugins not available');
      return null;
    }

    const { PushNotifications, LocalNotifications, App } = Plugins;
    if (!PushNotifications || !LocalNotifications || !App) {
      console.warn('Capacitor notification plugins missing');
      return null;
    }

    return {
      Capacitor: cap,
      LocalNotifications,
      PushNotifications,
      App,
    };
  });

  return nativeReady;
}

function nextId() {
  notifSeq = (notifSeq % 900000) + 1;
  return notifSeq;
}

function messagePreview(msg) {
  if (!msg) return 'Новое сообщение';
  if (msg.type === 'image') return msg.content && msg.content !== 'Фото' ? `📷 ${msg.content}` : '📷 Фото';
  if (msg.type === 'voice') return '🎤 Голосовое сообщение';
  return msg.content || 'Новое сообщение';
}

function isForeground() {
  return appActive && !document.hidden;
}

function syncPresence() {
  if (!isNative()) return;
  const state = ctx.getState();
  const foreground = isForeground();
  sendRealtime({
    type: 'app:state',
    foreground,
    chatId: foreground && ctx.isLayerVisible('chat') ? state.currentChat?.id ?? null : null,
  });
}

function applyLifecycleState() {
  if (!isNative()) return;

  if (!isForeground()) {
    syncPresence();
    setRealtimeBackgroundPaused(true);
    return;
  }

  setRealtimeBackgroundPaused(false);
  syncPresence();
}

async function ensurePushRegistered() {
  const plugins = await loadNativePlugins();
  if (!plugins) return;
  try {
    const perm = await plugins.PushNotifications.checkPermissions();
    if (perm.receive === 'granted') {
      await plugins.PushNotifications.register();
    }
  } catch (err) {
    console.warn('Push re-register failed:', err.message);
  }
}

function shouldNotifyMessage(msg) {
  if (!enabled || !isNative()) return false;
  if (msg.message?.isMine) return false;
  // В фоне — FCM с сервера, без дубля локальными
  if (!appActive || document.hidden) return false;

  const state = ctx.getState();
  const chat = state.chats?.find((c) => c.id === msg.chatId);
  if (chat?.isMuted) return false;

  const inThisChat = state.currentChat?.id === msg.chatId
    && ctx.isLayerVisible('chat')
    && appActive
    && !document.hidden;
  return !inThisChat;
}

function shouldNotifyWallet() {
  if (!enabled || !isNative()) return false;
  if (!appActive || document.hidden) return false;
  return !ctx.isLayerVisible('wallet');
}

function chatNotificationTag(chatId) {
  return `ferom-chat-${chatId}`;
}

/** Совпадает с FeromMessagingService.notificationId на Android */
function chatNotificationId(chatId) {
  const s = String(chatId);
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash * 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const path = avatarUrl.split('?')[0].trim();
  if (!path || path.endsWith('.svg')) return null;
  if (!path.includes('/uploads/')) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

async function dismissChatNotifications(chatId) {
  if (!isNative() || chatId == null) return;
  const plugins = await loadNativePlugins();
  if (!plugins) return;

  const tag = chatNotificationTag(chatId);
  const id = chatNotificationId(chatId);

  try {
    const delivered = await plugins.PushNotifications.getDeliveredNotifications();
    const matches = (delivered?.notifications || []).filter((n) => (
      n.tag === tag
      || String(n.data?.chatId || '') === String(chatId)
    ));
    if (matches.length) {
      await plugins.PushNotifications.removeDeliveredNotifications({ notifications: matches });
    } else {
      await plugins.PushNotifications.removeDeliveredNotifications({
        notifications: [{ tag, id }],
      });
    }
  } catch { /* ignore */ }

  try {
    await plugins.LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* ignore */ }
}

async function showLocal({ id, channelId, title, body, extra = {}, imageUrl = null }) {
  if (!enabled) return;
  const plugins = await loadNativePlugins();
  if (!plugins) return;

  const notification = {
    id: id || nextId(),
    title,
    body,
    channelId,
    extra,
  };

  try {
    await plugins.LocalNotifications.schedule({ notifications: [notification] });
  } catch (err) {
    console.warn('Local notification failed:', err);
  }
}

export function notifyIncomingMessage(msg) {
  if (!shouldNotifyMessage(msg)) return;

  const state = ctx.getState();
  const chat = state.chats?.find((c) => c.id === msg.chatId);
  const sender = chat?.otherUser?.displayName
    || msg.message?.sender?.displayName
    || 'Новое сообщение';
  const avatarUrl = chat?.otherUser?.avatarUrl || msg.message?.sender?.avatarUrl;

  showLocal({
    id: chatNotificationId(msg.chatId),
    channelId: 'ferom-messages',
    title: sender,
    body: messagePreview(msg.message),
    imageUrl: avatarUrl,
    extra: { type: 'message', chatId: msg.chatId },
  });
}

export function notifyWalletEvent(msg) {
  if (!msg?.event || msg.event === 'transfer_out') return;
  if (!shouldNotifyWallet()) return;

  let title = 'Ferom';
  let body = 'Обновление кошелька';

  if (msg.event === 'transfer_in') {
    title = 'Входящий перевод';
    const from = msg.counterpartyName || 'Пользователь';
    body = `${from} отправил(а) вам ${msg.amount} руб.`;
    if (msg.note) body += ` · ${msg.note}`;
  } else if (msg.event === 'topup') {
    title = 'Пополнение';
    body = `+${msg.amount} руб. на баланс`;
  } else if (msg.event === 'purchase') {
    title = 'Покупка';
    body = msg.productTitle || 'Успешная покупка в Ferom';
  } else if (msg.event === 'sale') {
    title = 'Продажа @ тега';
    body = msg.body || 'Ваш @ тег купили на маркете';
  }

  showLocal({
    channelId: 'ferom-wallet',
    title,
    body,
    imageUrl: msg.counterpartyAvatarUrl,
    extra: { type: 'wallet', kind: msg.event },
  });
}

export function notifySystemAlert({ title, body, kind }) {
  if (!enabled || !isNative()) return;
  showLocal({
    channelId: 'ferom-system',
    title: title || 'Ferom',
    body: body || 'Важное уведомление',
    extra: { type: 'system', kind: kind || 'alert' },
  });
}

function handleNotificationAction(notification) {
  const extra = notification?.extra || notification?.notification?.extra || {};
  if (extra.type === 'message' && extra.chatId && ctx.onOpenChat) {
    ctx.onOpenChat(Number(extra.chatId));
  } else if (extra.type === 'wallet' && ctx.onOpenWallet) {
    ctx.onOpenWallet();
  }
}

async function registerPushToken(token, Capacitor) {
  if (!token) return;
  try {
    await api.registerPushToken(token, Capacitor.getPlatform());
  } catch (err) {
    console.warn('Push token register failed:', err.message);
  }
}

async function initPush(plugins) {
  const { PushNotifications, Capacitor } = plugins;
  try {
    await PushNotifications.addListener('registration', (ev) => {
      registerPushToken(ev.value, Capacitor);
    });
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });
    await PushNotifications.addListener('pushNotificationReceived', (ev) => {
      const data = ev.notification?.data || {};
      if (appActive && !document.hidden) {
        if (data.type === 'message' && ctx.getState().currentChat?.id === Number(data.chatId)) return;
      }
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (ev) => {
      handleNotificationAction(ev.notification);
    });

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('Push permission denied:', perm.receive);
      return;
    }

    await PushNotifications.register();
  } catch (err) {
    console.error('Push init failed:', err);
  }
}

async function initLocal(plugins) {
  const { LocalNotifications } = plugins;
  for (const ch of CHANNELS) {
    await LocalNotifications.createChannel(ch);
  }

  let perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
    perm = await LocalNotifications.requestPermissions();
  }
  enabled = perm.display === 'granted';

  await LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
    handleNotificationAction(ev.notification);
  });
}

export function syncNotificationPresence() {
  syncPresence();
}

export async function dismissNotificationsForChat(chatId) {
  await dismissChatNotifications(chatId);
}

export async function initNotifications(options = {}) {
  ctx = { ...ctx, ...options };
  if (!isNative()) return;

  const plugins = await loadNativePlugins();
  if (!plugins) return;

  const { App } = plugins;

  try {
    onRealtimeOpen(() => {
      syncPresence();
      ensurePushRegistered();
    });

    App.addListener('appStateChange', ({ isActive }) => {
      appActive = isActive;
      applyLifecycleState();
    });

    document.addEventListener('visibilitychange', () => {
      applyLifecycleState();
    });

    await initPush(plugins);
    await initLocal(plugins);
    applyLifecycleState();
  } catch (err) {
    console.error('Notifications init failed:', err);
  }
}

export async function teardownNotifications() {
  if (!isNative()) return;

  try {
    const plugins = await loadNativePlugins();
    if (plugins) {
      try {
        await plugins.PushNotifications.removeAllListeners();
      } catch { /* ignore */ }
      try {
        await plugins.LocalNotifications.removeAllListeners();
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  try {
    await api.unregisterPushToken();
  } catch { /* ignore */ }

  nativeReady = null;
  enabled = false;
}
