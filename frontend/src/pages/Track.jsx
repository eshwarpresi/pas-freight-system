// frontend/src/pages/Track.jsx — PUBLIC page (no login): /track
import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com'

const css = `
.tk{min-height:100vh;background:#f1f5f9;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a}
.tk-hero{background:linear-gradient(135deg,#0b2a5b,#1d6fe8);color:#fff;padding:48px 16px 80px;text-align:center}
.tk-hero h1{margin:0 0 8px;font-size:28px}.tk-hero p{margin:0;opacity:.85}
.tk-card{max-width:640px;margin:-48px auto 40px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:24px;width:calc(100% - 32px)}
.tk-form{display:flex;gap:8px}.tk-form input{flex:1;min-width:0;padding:14px;font-size:16px;border:1px solid #cbd5e1;border-radius:10px}
.tk-form button{padding:14px 22px;background:#1d6fe8;color:#fff;border:0;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer}
.tk-form button:disabled{opacity:.6}.tk-err{margin-top:16px;color:#b91c1c;background:#fef2f2;padding:12px;border-radius:10px}
.tk-head{margin-top:20px;padding:16px;background:#eff6ff;border-radius:12px}.tk-head small{color:#64748b}.tk-head h2{margin:4px 0 0;color:#0b2a5b}
.tk ul{list-style:none;margin:20px 0 0;padding:0}.tk li{position:relative;padding:0 0 22px 34px;color:#64748b}
.tk li:before{content:"";position:absolute;left:9px;top:20px;bottom:0;width:2px;background:#e2e8f0}.tk li:last-child:before{display:none}
.tk li i{position:absolute;left:0;top:2px;width:20px;height:20px;border-radius:50%;background:#e2e8f0}
.tk li.done{color:#0f172a}.tk li.done i{background:#16a34a}.tk li.done i:after{content:"✓";color:#fff;font-size:12px;display:block;text-align:center;line-height:20px}
.tk li b{display:block}.tk li span{font-size:13px}.tk-note{margin-top:8px;font-size:13px;color:#64748b}
`

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function Track() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return
    setBusy(true); setErr(''); setRes(null)
    try {
      const r = await fetch(`${API_BASE}/api/track/${encodeURIComponent(v)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.message || 'Not found')
      setRes(j.data)
    } catch (ex) {
      setErr(ex.message === 'Failed to fetch' ? 'Service is waking up. Please try again in a few seconds.' : ex.message)
    }
    setBusy(false)
  }

  return (
    <div className="tk">
      <style>{css}</style>
      <div className="tk-hero">
        <h1>Track Your Shipment</h1>
        <p>Enter your Job / Reference number or AWB number</p>
      </div>
      <div className="tk-card">
        <form className="tk-form" onSubmit={submit}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job / Reference / AWB number" autoComplete="off" />
          <button disabled={busy}>{busy ? 'Searching…' : 'Track'}</button>
        </form>
        {err && <div className="tk-err">{err}</div>}
        {res && (
          <>
            <div className="tk-head">
              <small>{[res.reference, res.mode, res.direction].filter(Boolean).join(' · ')}</small>
              <h2>{res.headline}</h2>
            </div>
            <ul>
              {res.timeline.map((t) => (
                <li key={t.label} className={t.done ? 'done' : ''}>
                  <i /><b>{t.label}</b><span>{t.date ? fmt(t.date) : 'Pending'}</span>
                </li>
              ))}
            </ul>
            <div className="tk-note">{res.updatedNote}</div>
          </>
        )}
      </div>
    </div>
  )
}