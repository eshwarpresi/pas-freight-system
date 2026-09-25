// ✅ NEW — decorative, non-interactive background: faint outline icons of
// planes, cargo ships, shipping containers, and flight-path arcs, drifting
// slowly across the page. Ties the visual identity directly to what this
// company does (freight forwarding — air and sea), rather than being
// generic decoration.
//
// Deliberately restrained: very low opacity (6-10%), slow movement, and
// pointer-events: none throughout, so it never competes with or blocks
// the actual work happening on top of it. This is a tool people use all
// day — it should feel alive, not busy.

const PlaneIcon = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 34 L26 30 L34 8 L38 8 L34 30 L52 27 L58 32 L52 35 L34 34 L38 56 L34 56 L26 36 L4 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
)

const ShipIcon = ({ className }) => (
  <svg viewBox="0 0 80 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 30 L72 30 L64 42 L16 42 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="20" y="16" width="12" height="14" stroke="currentColor" strokeWidth="1.5" />
    <rect x="36" y="10" width="14" height="20" stroke="currentColor" strokeWidth="1.5" />
    <rect x="54" y="18" width="10" height="12" stroke="currentColor" strokeWidth="1.5" />
    <line x1="40" y1="10" x2="40" y2="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

const ContainerIcon = ({ className }) => (
  <svg viewBox="0 0 56 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="52" height="30" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="2" y1="14" x2="54" y2="14" stroke="currentColor" strokeWidth="1" />
    <line x1="2" y1="22" x2="54" y2="22" stroke="currentColor" strokeWidth="1" />
    <line x1="2" y1="30" x2="54" y2="30" stroke="currentColor" strokeWidth="1" />
  </svg>
)

const GlobeArcIcon = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="32" cy="32" rx="22" ry="9" stroke="currentColor" strokeWidth="1" />
    <line x1="10" y1="32" x2="54" y2="32" stroke="currentColor" strokeWidth="1" />
    <path d="M14 18 Q32 4 50 18" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
  </svg>
)

const FLOATERS = [
  { Icon: PlaneIcon, top: '8%', left: '6%', size: 56, duration: 26, delay: 0, opacity: 0.08 },
  { Icon: ShipIcon, top: '68%', left: '3%', size: 72, duration: 32, delay: 3, opacity: 0.07 },
  { Icon: ContainerIcon, top: '20%', left: '88%', size: 48, duration: 22, delay: 1, opacity: 0.08 },
  { Icon: PlaneIcon, top: '78%', left: '82%', size: 44, duration: 28, delay: 5, opacity: 0.07 },
  { Icon: GlobeArcIcon, top: '42%', left: '94%', size: 60, duration: 34, delay: 2, opacity: 0.06 },
  { Icon: ContainerIcon, top: '5%', left: '45%', size: 40, duration: 24, delay: 4, opacity: 0.06 },
  { Icon: ShipIcon, top: '88%', left: '40%', size: 60, duration: 30, delay: 6, opacity: 0.06 },
]

export default function FloatingLogisticsBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      <style>{`
        @keyframes pas-float-drift {
          0%   { transform: translate(0, 0) rotate(0deg); }
          50%  { transform: translate(14px, -22px) rotate(3deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
      `}</style>
      {FLOATERS.map((f, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: f.top,
            left: f.left,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animation: `pas-float-drift ${f.duration}s ease-in-out ${f.delay}s infinite`,
          }}
        >
          <f.Icon className="w-full h-full text-indigo-200 dark:text-indigo-400" />
        </div>
      ))}
    </div>
  )
}