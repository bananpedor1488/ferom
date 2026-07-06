/**
 * Ferom — WebSocket realtime
 */

const listeners = new Map();
let ws = null;
let reconnectTimer = null;
let pingTimer = null;
let serverTimeOffset = 0;
let shouldReconnect = false;
let reconnectAttempt = 0;
let backgroundPaused = false;
const openListeners = new Set();

export function onRealtimeOpen(handler) {
  openListeners.add(handler);
  return () => openListeners.delete(handler);
}

function notifyOpen() {
  openListeners.forEach((fn) => {
    try { fn(); } catch (err) { console.warn('onRealtimeOpen:', err); }
  });
}

export function setRealtimeBackgroundPaused(paused) {
  backgroundPaused = paused;
  if (paused) {
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    stopPing();
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    return;
  }
  connectRealtime();
}

function scheduleReconnect() {
  if (backgroundPaused) return;
  clearTimeout(reconnectTimer);
  const delay = Math.min(2500 * 2 ** reconnectAttempt, 30000);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(connectRealtime, delay);
}

function getWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function getServerNow() {
  return new Date(Date.now() + serverTimeOffset);
}

export function syncServerTime(iso) {
  if (!iso) return;
  serverTimeOffset = new Date(iso).getTime() - Date.now();
}

export function connectRealtime() {
  if (backgroundPaused) return;
  shouldReconnect = true;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearTimeout(reconnectTimer);
  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    reconnectAttempt = 0;
    startPing();
    notifyOpen();
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.serverTime) syncServerTime(msg.serverTime);
    emit(msg.type, msg);
  };

  ws.onclose = () => {
    stopPing();
    ws = null;
    if (shouldReconnect && !backgroundPaused) {
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectRealtime() {
  shouldReconnect = false;
  reconnectAttempt = 0;
  clearTimeout(reconnectTimer);
  stopPing();
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

export function sendRealtime(payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function markChatRead(chatId) {
  sendRealtime({ type: 'chat:read', chatId });
}

export function onRealtime(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

function emit(event, data) {
  listeners.get(event)?.forEach((fn) => fn(data));
}

function startPing() {
  stopPing();
  sendRealtime({ type: 'ping' });
  pingTimer = setInterval(() => sendRealtime({ type: 'ping' }), 30000);
}

function stopPing() {
  clearInterval(pingTimer);
  pingTimer = null;
}
