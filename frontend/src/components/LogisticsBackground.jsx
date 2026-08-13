// frontend/src/components/LogisticsBackground.jsx
//
// NEW FILE — purely decorative, no data, no API calls, no state that
// affects anything else. Drop it into any page as a background layer.
//
// Renders faint, slow-drifting freight icons (plane, ship, box, truck)
// across the screen using icons already confirmed present in your
// lucide-react setup — no canvas, no extra libraries.

import { Plane, Ship, Box, Truck } from 'lucide-react'

// Each item: which icon, vertical position (%), animation duration (s),
// delay (s so they don't all start together), size, and opacity.
const ITEMS = [
  { Icon: Plane, top: '8%',  duration: 38, delay: 0,  size: 34, opacity: 0.10, rotate: -8, direction: 'right' },
  { Icon: Ship,  top: '82%', duration: 52, delay: 6,  size: 42, opacity: 0.09, rotate: 0,  direction: 'right' },
  { Icon: Box,   top: '35%', duration: 46, delay: 3,  size: 26, opacity: 0.08, rotate: 0,  direction: 'left'  },
  { Icon: Truck, top: '65%', duration: 44, delay: 12, size: 30, opacity: 0.08, rotate: 0,  direction: 'left'  },
  { Icon: Plane, top: '22%', duration: 60, delay: 20, size: 24, opacity: 0.07, rotate: -8, direction: 'right' },
  { Icon: Ship,  top: '55%', duration: 58, delay: 15, size: 30, opacity: 0.07, rotate: 0,  direction: 'left'  },
]

export default function LogisticsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
      <style>{`
        @keyframes drift-right {
          from { transform: translateX(-10vw); }
          to   { transform: translateX(110vw); }
        }
        @keyframes drift-left {
          from { transform: translateX(110vw); }
          to   { transform: translateX(-10vw); }
        }
        @keyframes bob {
          0%, 100% { margin-top: 0px; }
          50%      { margin-top: 8px; }
        }
      `}</style>

      {ITEMS.map((item, i) => {
        const { Icon, top, duration, delay, size, opacity, rotate, direction } = item
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top,
              left: 0,
              width: '100%',
              animation: `${direction === 'right' ? 'drift-right' : 'drift-left'} ${duration}s linear ${delay}s infinite`
            }}
          >
            <div style={{ animation: `bob ${duration / 8}s ease-in-out infinite`, width: 'fit-content' }}>
              <Icon
                size={size}
                strokeWidth={1.5}
                className="text-indigo-500 dark:text-indigo-300"
                style={{
                  opacity,
                  transform: `scaleX(${direction === 'left' ? -1 : 1}) rotate(${rotate}deg)`
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}