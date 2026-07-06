/** Breakpoint and viewport helpers for responsive / desktop layout */

export const DESKTOP_BP = 1024;

export function isDesktop() {
  return window.matchMedia(`(min-width: ${DESKTOP_BP}px)`).matches;
}

export function onViewportChange(callback) {
  const mq = window.matchMedia(`(min-width: ${DESKTOP_BP}px)`);
  mq.addEventListener('change', () => callback(isDesktop()));
  callback(isDesktop());
}
