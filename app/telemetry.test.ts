import { describe, expect, it } from 'vitest'
import { stripFragment } from './Telemetry'

describe('telemetry scrubbing', () => {
  it('removes a share-link kit from any URL before it is reported', () => {
    expect(stripFragment('https://ergane.vinnie.studio/#kit=vVZNj9owEL3zK0Y')).toBe('https://ergane.vinnie.studio/')
    expect(stripFragment('Error at https://ergane.vinnie.studio/#kit=abc_-123 (line 4)')).toBe('Error at https://ergane.vinnie.studio/ (line 4)')
    expect(stripFragment('https://ergane.vinnie.studio/privacy')).toBe('https://ergane.vinnie.studio/privacy')
  })
})
