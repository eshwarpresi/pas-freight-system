import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import api from '../lib/api'

// ✅ FIXED — this used to poll /users/online every 30 seconds from every
// open tab, all day, including tabs sitting in the background that nobody
// is looking at. With 30 people that's a steady stream of requests to a
// server that's already CPU-starved. Now it:
//   - stops polling entirely while the tab is hidden,
//   - refreshes immediately when the tab becomes visible again,
//   - polls every 60s (not 30s) while someone is actually looking.
// Same number, same meaning (users active in the last 5 minutes) — just
// far fewer wasted requests.
const POLL_MS = 60000

export default function OnlineUsers() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let timer = null

    const fetchOnline = async () => {
      try {
        const res = await api.get('/users/online')
        setCount(res.data.data.count)
      } catch (err) {}
    }

    const start = () => { if (!timer) timer = setInterval(fetchOnline, POLL_MS) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop()
      } else {
        fetchOnline()
        start()
      }
    }

    if (!document.hidden) {
      fetchOnline()
      start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  if (count === 0) return null

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700 shadow-sm">
      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-300" />
      <Users size={12} />
      <span>{count} online</span>
    </div>
  )
}