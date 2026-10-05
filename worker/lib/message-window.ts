// 30 August 2026, 00:00 Asia/Almaty (UTC+05:00), inclusive.
export const MESSAGE_HISTORY_START = '2026-08-29T19:00:00.000Z'
export function isInMessageWindow(sentAt: string) {
  const timestamp = Date.parse(sentAt)
  return Number.isFinite(timestamp) && timestamp >= Date.parse(MESSAGE_HISTORY_START)
}
