import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import api from '../lib/api'

export default function OnlineUsers() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await api.get('/users/online')
        setCount(res.data.data.count)
      } catch (err) {}
    }
    fetchOnline()
    const interval = setInterval(fetchOnline, 30000)
    return () => clearInterval(interval)
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