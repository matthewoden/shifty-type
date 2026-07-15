// Short, glanceable relative time for the lobby ("just now", "5m", "2h",
// "3d", "2w"). Coarse on purpose — a turn-based game measured in days doesn't
// need seconds, and short strings keep the row from wrapping.

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < 45_000) return 'just now' // also covers small clock skew (diff < 0)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}
