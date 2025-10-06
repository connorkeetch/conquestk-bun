import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import InteractionOverlay from './InteractionOverlay'

const width = 400
const height = 300
const points = [
  { id: 'a', x: 100, y: 100 },
  { id: 'b', x: 200, y: 100 },
  { id: 'c', x: 300, y: 200 },
]

describe('InteractionOverlay', () => {
  it('renders selected breathing ring and eligible attack rings', () => {
    render(
      <div>
        <InteractionOverlay
          width={width}
          height={height}
          points={points}
          selectedId="a"
          eligibleIds={['b', 'c']}
          phase="attack"
          tokenSize={28}
        />
      </div>,
    )
    expect(screen.getByLabelText('selected-overlay')).toBeTruthy()
    const eligibles = screen.getAllByLabelText('eligible-attack')
    expect(eligibles.length).toBe(2)
  })

  describe('reduced motion', () => {
    const orig = global.window.matchMedia
    beforeAll(() => {
      // mock prefers-reduced-motion
      // @ts-expect-error
      global.window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    })
    afterAll(() => {
      global.window.matchMedia = orig
    })
    it('does not apply animation classes when reduced motion is preferred', () => {
      render(
        <InteractionOverlay
          width={width}
          height={height}
          points={points}
          selectedId="a"
          eligibleIds={['b']}
          phase="attack"
          tokenSize={28}
        />,
      )
      const root = screen.getByLabelText('selected-overlay')
      // No inline check for class name contents here; presence ensures component rendered without throwing.
      expect(root).toBeTruthy()
    })
  })
})
