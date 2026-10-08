// frontend/src/pages/Track.jsx — PUBLIC page (no login): /track
import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com'

const css = `
.tk{min-height:100vh;background:#eef2f7;font-family:system-ui,'Segoe UI',Arial,sans-serif;color:#0f172a}
.tk *{box-sizing:border-box}
.tk-hero{background:linear-gradient(135deg,#0b2a5b 0%,#1d6fe8 100%);color:#fff;padding:44px 16px 90px;text-align:center}
.tk-hero h1{margin:0 0 6px;font-size:30px;letter-spacing:-.5px}.tk-hero p{margin:0;opacity:.85}
.tk-wrap{max-width:760px;margin:-56px auto 40px;padding:0 16px}
.tk-card{background:#fff;border-radius:16px;box-shadow:0 8px 28px rgba(15,23,42,.10);padding:22px;margin-bottom:16px}
.tk-form{display:flex;gap:8px}.tk-form input{flex:1;min-width:0;padding:14px;font-size:16px;border:1px solid #cbd5e1;border-radius:10px;outline:none}
.tk-form input:focus{border-color:#1d6fe8;box-shadow:0 0 0 3px rgba(29,111,232,.15)}
.tk-form button{padding:14px 24px;background:#1d6fe8;color:#fff;border:0;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer}
.tk-form button:disabled{opacity:.6}
.tk-err{margin-top:14px;color:#b91c1c;background:#fef2f2;padding:12px;border-radius:10px;font-size:14px}
.tk-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.tk-ref{font-size:13px;color:#64748b}.tk-ref b{color:#0f172a;font-size:15px}
.tk-badge{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700;font-size:14px;background:#dbeafe;color:#1e40af}
.tk-badge.ok{background:#dcfce7;color:#166534}.tk-badge.bad{background:#fee2e2;color:#991b1b}
.tk-status{margin:14px 0 4px;font-size:26px;font-weight:800;color:#0b2a5b}
.tk-next{font-size:14px;color:#475569}
.tk-bar{height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:16px 0 4px}
.tk-bar i{display:block;height:100%;background:linear-gradient(90deg,#1d6fe8,#16a34a);border-radius:999px;transition:width .6s}
.tk-pct{font-size:12px;color:#64748b;text-align:right}
.tk-route{display:flex;align-items:center;gap:12px;margin-top:6px}
.tk-route div{flex:1}.tk-route small{display:block;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.tk-route b{font-size:18px}.tk-route .arrow{flex:0 0 auto;color:#1d6fe8;font-size:22px}
.tk h3{margin:0 0 14px;font-size:15px;color:#0b2a5b;text-transform:uppercase;letter-spacing:.6px}
.tk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.tk-grid small{display:block;color:#64748b;font-size:12px}.tk-grid b{font-size:15px;word-break:break-word}
.tk ul{list-style:none;margin:0;padding:0}
.tk .st li{position:relative;padding:0 0 20px 36px;color:#94a3b8}
.tk .st li:before{content:"";position:absolute;left:10px;top:22px;bottom:-2px;width:2px;background:#e2e8f0}
.tk .st li:last-child:before{display:none}
.tk .st li i{position:absolute;left:0;top:1px;width:22px;height:22px;border-radius:50%;background:#e2e8f0}
.tk .st li.done{color:#0f172a}.tk .st li.done:before{background:#16a34a}
.tk .st li.done i{background:#16a34a}.tk .st li.done i:after{content:"✓";color:#fff;font-size:13px;display:block;text-align:center;line-height:22px}
.tk .st li.cur i{box-shadow:0 0 0 5px rgba(22,163,74,.2)}
.tk .st li.est i{background:#fff;border:2px dashed #1d6fe8}
.tk .st li b{display:block;font-size:15px}.tk .st li span{font-size:13px;color:#64748b}
.tk .st li.done span{color:#475569}
.tk .log li{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px}
.tk .log li:last-child{border:0}.tk .log span{color:#64748b;white-space:nowrap}
.tk-foot{text-align:center;color:#64748b;font-size:13px;line-height:1.6}
@media(max-width:480px){.tk-status{font-size:22px}.tk-form{flex-direction:column}}
`

const dt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const dtm = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return <div><small>{label}</small><b>{value}</b></div>
}

export default function Track() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')

  const run = async (value) => {
    const v = value.trim()
    if (!v) return
    setBusy(true); setErr(''); setR(null)
    try {
      const res = await fetch(`${API_BASE}/api/track/${encodeURIComponent(v)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'Not found')
      setR(j.data)
    } catch (ex) {
      setErr(ex.message === 'Failed to fetch' ? 'Service is waking up. Please try again in a few seconds.' : ex.message)
    }
    setBusy(false)
  }

  // Allow links like /track?no=PPI260506
  useEffect(() => {
    const no = new URLSearchParams(window.location.search).get('no')
    if (no) { setQ(no); run(no) }
    // eslint-disable-next-line
  }, [])

  const d = r?.details || {}
  const lastDoneIdx = r ? r.timeline.map((t) => t.done).lastIndexOf(true) : -1
  const wt = (v) => (v ? `${v} kg` : null)

  return (
    <div className="tk">
      <style>{css}</style>
      <div className="tk-hero">
        <h1>Track Your Shipment</h1>
        <p>Enter your Job / Reference number, AWB or Bill of Entry number</p>
      </div>
      <div className="tk-wrap">
        <div className="tk-card">
          <form className="tk-form" onSubmit={(e) => { e.preventDefault(); run(q) }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. PPI260506" autoComplete="off" />
            <button disabled={busy}>{busy ? 'Searching…' : 'Track'}</button>
          </form>
          {err && <div className="tk-err">{err}</div>}
        </div>

        {r && (
          <>
            <div className="tk-card">
              <div className="tk-top">
                <div className="tk-ref">Shipment<br /><b>{r.reference}</b>{(r.mode || r.direction) && <> · {[r.mode, r.direction].filter(Boolean).join(' ')}</>}</div>
                <span className={`tk-badge ${r.delivered ? 'ok' : r.cancelled ? 'bad' : ''}`}>{r.delivered ? 'Delivered' : r.cancelled ? 'Cancelled' : 'In progress'}</span>
              </div>
              <div className="tk-status">{r.headline}</div>
              {r.nextStep && <div className="tk-next">Next: {r.nextStep.label}{r.nextStep.date ? ` — ${r.nextStep.estimated ? 'expected ' : ''}${dt(r.nextStep.date)}` : ''}</div>}
              <div className="tk-bar"><i style={{ width: `${r.progress}%` }} /></div>
              <div className="tk-pct">{r.progress}% complete</div>
              {(r.route.from || r.route.to) && (
                <div className="tk-route" style={{ marginTop: 18 }}>
                  <div><small>From</small><b>{r.route.from || '—'}</b></div>
                  <span className="arrow">➜</span>
                  <div style={{ textAlign: 'right' }}><small>To</small><b>{r.route.to || '—'}</b></div>
                </div>
              )}
            </div>

            <div className="tk-card">
              <h3>Shipment details</h3>
              <div className="tk-grid">
                <Field label="Service" value={[r.mode, r.direction].filter(Boolean).join(' ')} />
                <Field label="Terms" value={r.route.terms} />
                <Field label="Port / Airport" value={r.route.port} />
                <Field label="Commodity" value={d.commodity} />
                <Field label="Packages" value={d.packages ? `${d.packages}${d.packageType ? ' · ' + d.packageType : ''}` : null} />
                <Field label="Gross weight" value={wt(d.grossWeight)} />
                <Field label="Chargeable weight" value={wt(d.chargeableWeight)} />
                <Field label="Volume" value={d.cbm ? `${d.cbm} CBM` : null} />
                <Field label="Containers" value={d.containers ? `${d.containers}${d.containerType ? ' × ' + d.containerType : ''}` : d.containerType} />
                <Field label="Master AWB / BL" value={d.mawb} />
                <Field label="House AWB / BL" value={d.hawb} />
                <Field label="Job no." value={d.jobNo} />
                <Field label="Bill of Entry no." value={d.boeNo} />
                <Field label="Shipping Bill no." value={d.sbNo} />
                <Field label="Departure (ETD)" value={dt(d.etd)} />
                <Field label="Arrival (ETA)" value={dt(d.eta)} />
              </div>
            </div>

            <div className="tk-card">
              <h3>Shipment progress</h3>
              <ul className="st">
                {r.timeline.map((t, i) => (
                  <li key={t.label} className={`${t.done ? 'done' : ''} ${i === lastDoneIdx ? 'cur' : ''} ${t.estimated ? 'est' : ''}`}>
                    <i /><b>{t.label}</b>
                    <span>{t.date ? `${t.estimated ? 'Expected ' : ''}${dt(t.date)}` : 'Pending'}</span>
                  </li>
                ))}
              </ul>
            </div>

            {r.activity.length > 0 && (
              <div className="tk-card">
                <h3>Activity log</h3>
                <ul className="log">
                  {r.activity.map((a, i) => <li key={i}><b>{a.status}</b><span>{dtm(a.at)}</span></li>)}
                </ul>
              </div>
            )}

            <div className="tk-foot">Last updated {dtm(r.lastUpdated)}<br />{r.contact}</div>
          </>
        )}
      </div>
    </div>
  )
}