import { describe, expect, it } from 'vitest'
import { timeAgo } from './timeAgo'

const now = 1_000_000_000_000

describe('timeAgo', () => {
  it('rounds sub-minute (and clock skew) to "just now"', () => {
    expect(timeAgo(now, now)).toBe('just now')
    expect(timeAgo(now - 30_000, now)).toBe('just now')
    expect(timeAgo(now + 5_000, now)).toBe('just now') // future timestamp
  })

  it('reports minutes, hours, days, weeks', () => {
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago')
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe('2h ago')
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3d ago')
    expect(timeAgo(now - 14 * 86_400_000, now)).toBe('2w ago')
  })

  it('crosses each boundary at the right place', () => {
    expect(timeAgo(now - 59 * 60_000, now)).toBe('59m ago')
    expect(timeAgo(now - 60 * 60_000, now)).toBe('1h ago')
    expect(timeAgo(now - 23 * 3_600_000, now)).toBe('23h ago')
    expect(timeAgo(now - 6 * 86_400_000, now)).toBe('6d ago')
    expect(timeAgo(now - 7 * 86_400_000, now)).toBe('1w ago')
  })
})
