export default function IndependenceDayBanner({ userName }) {
  return (
    <div className="relative mb-6 rounded-2xl overflow-hidden border border-orange-200/60 dark:border-orange-900/40 animate-slide-down">
      {/* tricolor gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-r from-orange-50 via-white to-green-50 dark:from-orange-950/30 dark:via-slate-900 dark:to-green-950/30" />
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-orange-400 via-white to-green-500" />

      <div className="relative flex items-center gap-4 px-5 py-3.5">
        {/* Ashoka Chakra style icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-blue-200 dark:border-blue-900/50 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-800 dark:text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="12" cy="12" r="9" />
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 360) / 24
              const rad = (angle * Math.PI) / 180
              const x2 = 12 + 9 * Math.sin(rad)
              const y2 = 12 - 9 * Math.cos(rad)
              return <line key={i} x1="12" y1="12" x2={x2} y2={y2} strokeWidth="0.6" />
            })}
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {userName ? `Happy Independence Day, ${userName}! 🇮🇳` : 'Happy Independence Day! 🇮🇳'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Thank you for being part of the PAS Freight family. Wishing you a proud 15th of August.
          </p>
        </div>
      </div>
    </div>
  )
}