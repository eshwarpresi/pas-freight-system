// frontend/src/pages/Analytics.jsx
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useSocket } from '../App'
import {
  TrendingUp, Package, CheckCircle2, Clock, Users, MapPin,
  BarChart3, PieChartIcon, Layers, Globe, Building2,
  Box, RefreshCw, Truck, FileCheck, FileText, Ship,
  ClipboardList, Target, Activity, Award, Zap, Calendar,
  ArrowUpRight, ArrowDownRight, Medal, Download, DollarSign,
  Route, ArrowRight, TrendingDown, Filter, Hash, Weight
} from 'lucide-react'

// ─────────────────────────────────────────────
// PROGRESS BAR COMPONENT
// ─────────────────────────────────────────────
function ProgressBar({ value = 0, max = 100, color = '#6366f1', height = 8, showValue = false }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-2 w-full">
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: `${height}px`, background: 'rgba(229,231,235,0.3)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
          }}
        />
      </div>
      {showValue && (
        <span className="text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {value}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// DONUT CHART (SVG)
// ─────────────────────────────────────────────
function DonutChart({ data = [], size = 180, centerLabel = 'Total' }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: size }}>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No data available</p>
      </div>
    )
  }

  let cumulative = 0
  const strokes = data.map(d => {
    const pct = d.value / total
    const start = cumulative
    cumulative += pct
    return { ...d, start, end: cumulative, pct }
  })

  const outerR = 40
  const innerR = 22
  const gap = 2 // degrees gap between segments

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 100 100">
        {strokes.map((d, i) => {
          if (d.pct === 0) return null
          const sa = (d.start * 360 + gap / 2 - 90) * Math.PI / 180
          const ea = (d.end * 360 - gap / 2 - 90) * Math.PI / 180
          const largeArc = (d.end - d.start) > 0.5 ? 1 : 0

          const x1 = 50 + outerR * Math.cos(sa)
          const y1 = 50 + outerR * Math.sin(sa)
          const x2 = 50 + outerR * Math.cos(ea)
          const y2 = 50 + outerR * Math.sin(ea)
          const x3 = 50 + innerR * Math.cos(ea)
          const y3 = 50 + innerR * Math.sin(ea)
          const x4 = 50 + innerR * Math.cos(sa)
          const y4 = 50 + innerR * Math.sin(sa)

          return (
            <path
              key={i}
              d={`M${x1},${y1} A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2} L${x3},${y3} A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4} Z`}
              fill={d.color}
              stroke="var(--bg-primary)"
              strokeWidth="1.5"
              className="transition-all duration-300 hover:opacity-80"
            >
              <title>{d.name}: {d.value} ({(d.pct * 100).toFixed(1)}%)</title>
            </path>
          )
        })}
        <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="bold" fill="var(--text-primary)">
          {total}
        </text>
        <text x="50" y="60" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          {centerLabel}
        </text>
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// BAR CHART (SVG)
// ─────────────────────────────────────────────
function BarChartSVG({ data = [], height = 260, color = '#6366f1', showValues = true }) {
  if (!data.length) return <p className="text-xs text-center py-12" style={{ color: 'var(--text-muted)' }}>No data available</p>

  const max = Math.max(...data.map(d => d.value)) || 1
  const barGap = 10
  const barW = Math.min(48, Math.max(28, 800 / data.length - barGap))
  const totalW = Math.max(data.length * (barW + barGap) + 40, 300)
  const topP = 30
  const botP = 40

  return (
    <div className="overflow-x-auto pb-2">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${totalW} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible', minWidth: totalW }}
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = height - botP - ((max * pct / 100) / max) * (height - topP - botP)
          return (
            <g key={pct}>
              <line x1={10} y1={y} x2={totalW - 10} y2={y} stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
              <text x={8} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">
                {Math.round(max * pct / 100)}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const barH = Math.max(4, (d.value / max) * (height - topP - botP))
          const x = i * (barW + barGap) + 30
          const y = height - botP - barH

          return (
            <g key={i} className="group">
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={d.color || color}
                rx="4"
                opacity="0.85"
                className="transition-all duration-300 hover:opacity-100"
              />
              {/* Value label */}
              {showValues && d.value > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="var(--text-primary)"
                >
                  {d.value}
                </text>
              )}
              {/* X-axis label */}
              <text
                x={x + barW / 2}
                y={height - 12}
                textAnchor="middle"
                fontSize="10"
                fill="var(--text-muted)"
              >
                {d.label?.substring(0, 4) || ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const COLORS = {
  freight: '#6366f1',      // Indigo
  ffOnly: '#8b5cf6',       // Violet
  chaImport: '#10b981',    // Emerald
  chaExport: '#059669',    // Dark Emerald
  transport: '#3b82f6',    // Blue
  doRelease: '#06b6d4',    // Cyan
  delivered: '#10b981',
  customs: '#f59e0b',
  booked: '#6366f1',
  enquiry: '#fbbf24',
  invoiced: '#f43f5e',
  cancelled: '#ef4444',
}

const SHIPMENT_TYPE_CONFIG = {
  'Freight': { icon: Ship, color: COLORS.freight, label: 'Full Freight' },
  'FF Only': { icon: FileText, color: COLORS.ffOnly, label: 'FF Only' },
  'CHA Import': { icon: FileCheck, color: COLORS.chaImport, label: 'CHA Import' },
  'CHA Export': { icon: FileCheck, color: COLORS.chaExport, label: 'CHA Export' },
  'Transport': { icon: Truck, color: COLORS.transport, label: 'Transport' },
  'DO Release': { icon: ClipboardList, color: COLORS.doRelease, label: 'DO Release' },
}

const STATUS_GROUPS = {
  'Enquiry': { statuses: ['ENQUIRY'], icon: '🔍', color: COLORS.enquiry },
  'Booked': { statuses: ['BOOKED', 'SCHEDULED', 'AWB_GENERATED', 'NOMINATED', 'CONFIRMED'], icon: '📋', color: COLORS.booked },
  'In Customs': { statuses: ['CHECKLIST_APPROVED', 'BOE_FILED', 'DO_COLLECTED', 'SB_FILED', 'OOC_DONE', 'GATE_PASS', 'LEO_DONE', 'CUSTOMS_HOLD'], icon: '🛃', color: COLORS.customs },
  'In Transit': { statuses: ['IN_TRANSIT', 'SHIPPED', 'ON_BOARD', 'ARRIVED'], icon: '🚚', color: '#3b82f6' },
  'Delivered': { statuses: ['DELIVERED', 'HAND_OVER', 'COMPLETED'], icon: '✅', color: COLORS.delivered },
  'Invoiced': { statuses: ['INVOICE_GENERATED', 'INVOICE_SENT', 'PAYMENT_RECEIVED'], icon: '💰', color: COLORS.invoiced },
  'Cancelled': { statuses: ['CANCELLED', 'ON_HOLD'], icon: '❌', color: COLORS.cancelled },
}

// ─────────────────────────────────────────────
// MAIN ANALYTICS COMPONENT
// ─────────────────────────────────────────────
export default function Analytics() {
  const [dateRange, setDateRange] = useState('12m')
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedType, setSelectedType] = useState('all')
  const queryClient = useQueryClient()
  const socket = useSocket()

  // Live updates via socket
  useEffect(() => {
    if (!socket) return
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-all-shipments'] })
    }
    socket.on('shipment:new', handler)
    socket.on('shipment:update', handler)
    socket.on('shipment:statusUpdate', handler)
    socket.on('shipment:archiveUpdate', handler)
    return () => {
      socket.off('shipment:new', handler)
      socket.off('shipment:update', handler)
      socket.off('shipment:statusUpdate', handler)
      socket.off('shipment:archiveUpdate', handler)
    }
  }, [socket, queryClient])

  // Fetch all shipments (paginated)
  const { data: allShipmentsData, isLoading, refetch } = useQuery({
    queryKey: ['analytics-all-shipments'],
    queryFn: async () => {
      const res = await api.get('/freight/shipments', {
        params: { isArchived: 'false', page: 1, limit: 1 }
      })
      const total = res.data.pagination?.total || 0
      if (total === 0) return []

      const limit = 200
      const totalPages = Math.ceil(total / limit)
      const promises = []
      for (let i = 1; i <= totalPages; i++) {
        promises.push(
          api.get('/freight/shipments', { params: { isArchived: 'false', page: i, limit } })
        )
      }
      const results = await Promise.all(promises)
      return results.flatMap(r => r.data.data || [])
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const shipments = allShipmentsData || []

  // ── ANALYTICS COMPUTATION ──────────────────
  const analytics = useMemo(() => {
    const now = new Date()
    const monthsToInclude = dateRange === '3m' ? 3 : dateRange === '6m' ? 6 : dateRange === '12m' ? 12 : 999

    // Filter by date range
    const filtered = shipments.filter(s => {
      const diffMonths = (now.getFullYear() - new Date(s.createdAt).getFullYear()) * 12 +
                         (now.getMonth() - new Date(s.createdAt).getMonth())
      return diffMonths <= monthsToInclude
    })

    // Further filter by selected type
    const typeFiltered = selectedType === 'all'
      ? filtered
      : filtered.filter(s => {
          if (selectedType === 'freight') return s.shipmentType === 'Freight'
          if (selectedType === 'ff-only') return s.shipmentType === 'FF Only'
          if (selectedType === 'cha') return s.shipmentType === 'CHA Only' || s.shipmentType === 'CHA Import' || s.shipmentType === 'CHA Export'
          if (selectedType === 'transport') return s.shipmentType === 'Transport'
          if (selectedType === 'do-release') return s.shipmentType === 'DO Release'
          return true
        })

    const total = typeFiltered.length
    const delivered = typeFiltered.filter(s =>
      ['DELIVERED', 'HAND_OVER', 'COMPLETED'].includes(s.currentStatus)
    ).length
    const active = typeFiltered.filter(s =>
      !['DELIVERED', 'HAND_OVER', 'COMPLETED', 'CANCELLED'].includes(s.currentStatus)
    ).length
    const cancelled = typeFiltered.filter(s => s.currentStatus === 'CANCELLED').length
    const completionRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0'

    // Import / Export split
    const imp = typeFiltered.filter(s => s.importExport === 'Import').length
    const exp = typeFiltered.filter(s => s.importExport === 'Export').length

    // Month-over-month growth
    const thisMonth = now.getMonth()
    const thisMonthCount = typeFiltered.filter(s => new Date(s.createdAt).getMonth() === thisMonth).length
    const lastMonthCount = typeFiltered.filter(s => new Date(s.createdAt).getMonth() === thisMonth - 1).length
    const growthPct = lastMonthCount > 0
      ? (((thisMonthCount - lastMonthCount) / lastMonthCount) * 100).toFixed(1)
      : '0'
    const growthPositive = Number(growthPct) >= 0

    // ── Shipment Type Breakdown ──
    const typeBreakdown = [
      { name: 'Freight', value: typeFiltered.filter(s => s.shipmentType === 'Freight').length, color: COLORS.freight, ...SHIPMENT_TYPE_CONFIG['Freight'] },
      { name: 'FF Only', value: typeFiltered.filter(s => s.shipmentType === 'FF Only').length, color: COLORS.ffOnly, ...SHIPMENT_TYPE_CONFIG['FF Only'] },
      { name: 'CHA Import', value: typeFiltered.filter(s => s.shipmentType === 'CHA Import').length, color: COLORS.chaImport, ...SHIPMENT_TYPE_CONFIG['CHA Import'] },
      { name: 'CHA Export', value: typeFiltered.filter(s => s.shipmentType === 'CHA Export').length, color: COLORS.chaExport, ...SHIPMENT_TYPE_CONFIG['CHA Export'] },
      { name: 'Transport', value: typeFiltered.filter(s => s.shipmentType === 'Transport').length, color: COLORS.transport, ...SHIPMENT_TYPE_CONFIG['Transport'] },
      { name: 'DO Release', value: typeFiltered.filter(s => s.shipmentType === 'DO Release').length, color: COLORS.doRelease, ...SHIPMENT_TYPE_CONFIG['DO Release'] },
    ].filter(d => d.value > 0).sort((a, b) => b.value - a.value)

    // ── Monthly Trend (last 12 months) ──
    const monthly = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const count = typeFiltered.filter(s => {
        const sd = new Date(s.createdAt)
        return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear()
      }).length
      monthly.push({
        label: d.toLocaleString('default', { month: 'short' }),
        value: count,
        color: count > 0 ? '#6366f1' : '#cbd5e1',
      })
    }

    // ── Weekly Performance ──
    const weekly = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const count = typeFiltered.filter(s => new Date(s.createdAt).toDateString() === d.toDateString()).length
      weekly.push({
        label: d.toLocaleString('default', { weekday: 'short' }),
        value: count,
        color: '#10b981',
      })
    }

    // ── Status Distribution ──
    const statusDistribution = Object.entries(STATUS_GROUPS).map(([groupName, group]) => ({
      name: groupName,
      value: typeFiltered.filter(s => group.statuses.includes(s.currentStatus)).length,
      color: group.color,
      icon: group.icon,
      statuses: group.statuses,
    })).filter(d => d.value > 0)

    // ── Top Customers ──
    const customerMap = {}
    typeFiltered.forEach(s => {
      const name = s.freightForwarding?.consigneeName || s.freightForwarding?.customerName || s.freightForwarding?.shipperName || 'Unknown'
      if (!customerMap[name]) {
        customerMap[name] = { name, shipments: 0, delivered: 0, revenue: 0 }
      }
      customerMap[name].shipments++
      if (['DELIVERED', 'HAND_OVER'].includes(s.currentStatus)) {
        customerMap[name].delivered++
      }
      // Estimate revenue from freight forwarding data
      const rate = parseFloat(s.freightForwarding?.sellingRate) || 0
      const weight = parseFloat(s.freightForwarding?.weight) || 0
      customerMap[name].revenue += rate * weight || rate || 0
    })
    const topCustomers = Object.values(customerMap)
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 10)
    const maxCust = Math.max(...topCustomers.map(c => c.shipments), 1)

    // ── Top Routes ──
    const routeMap = {}
    typeFiltered.forEach(s => {
      const from = s.freightForwarding?.fromLocation || 'Unknown Origin'
      const to = s.freightForwarding?.toLocation || 'Unknown Destination'
      const key = `${from} → ${to}`
      if (!routeMap[key]) {
        routeMap[key] = { from, to, key, shipments: 0, weight: 0 }
      }
      routeMap[key].shipments++
      routeMap[key].weight += parseFloat(s.freightForwarding?.weight) || 0
    })
    const topRoutes = Object.values(routeMap)
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 10)
    const maxRoute = Math.max(...topRoutes.map(r => r.shipments), 1)

    // ── Team Performance ──
    const teamMap = {}
    typeFiltered.forEach(s => {
      const name = s.createdByName || s.assignedTo || 'Unassigned'
      if (!teamMap[name]) {
        teamMap[name] = { name, shipments: 0, delivered: 0, active: 0 }
      }
      teamMap[name].shipments++
      if (['DELIVERED', 'HAND_OVER', 'COMPLETED'].includes(s.currentStatus)) {
        teamMap[name].delivered++
      } else if (!['CANCELLED'].includes(s.currentStatus)) {
        teamMap[name].active++
      }
    })
    const team = Object.values(teamMap)
      .map(t => ({
        ...t,
        completionRate: t.shipments > 0 ? ((t.delivered / t.shipments) * 100).toFixed(0) : '0',
      }))
      .sort((a, b) => b.shipments - a.shipments)
    const maxTeam = Math.max(...team.map(t => t.shipments), 1)

    // ── Revenue Estimate ──
    const totalRevenue = typeFiltered.reduce((sum, s) => {
      const rate = parseFloat(s.freightForwarding?.sellingRate) || 0
      const weight = parseFloat(s.freightForwarding?.weight) || 1
      return sum + (rate * weight || rate)
    }, 0)
    const revenueThisMonth = typeFiltered
      .filter(s => new Date(s.createdAt).getMonth() === thisMonth)
      .reduce((sum, s) => {
        const rate = parseFloat(s.freightForwarding?.sellingRate) || 0
        const weight = parseFloat(s.freightForwarding?.weight) || 1
        return sum + (rate * weight || rate)
      }, 0)

    // ── Additional metrics ──
    const totalDays = Math.max(1, monthsToInclude * 30)
    const avgPerDay = total > 0 ? (total / totalDays).toFixed(1) : '0'
    const busiestDay = weekly.reduce((a, b) => (a.value > b.value ? a : b), weekly[0] || { label: '-', value: 0 })
    const totalWeight = typeFiltered.reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.weight) || parseFloat(s.freightForwarding?.grossWeight) || 0), 0)
    const avgWeight = total > 0 ? (totalWeight / total).toFixed(1) : '0'

    return {
      total,
      delivered,
      active,
      cancelled,
      completionRate,
      imp,
      exp,
      thisMonthCount,
      growth: growthPct,
      growthPositive,
      typeBreakdown,
      monthly,
      weekly,
      statusDistribution,
      topCustomers,
      maxCust,
      topRoutes,
      maxRoute,
      team,
      maxTeam,
      totalRevenue,
      revenueThisMonth,
      avgPerDay,
      busiestDay,
      totalWeight: totalWeight.toFixed(1),
      avgWeight,
    }
  }, [shipments, dateRange, selectedType])

  // ── HANDLERS ──
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const handleExportPDF = useCallback(() => {
    setExporting(true)
    const style = document.createElement('style')
    style.id = 'pdf-print-style'
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #analytics-dashboard, #analytics-dashboard * { visibility: visible !important; }
        #analytics-dashboard {
          position: absolute; left: 0; top: 0; width: 100%;
          padding: 20px;
        }
        .no-print { display: none !important; }
        @page { size: A3 landscape; margin: 10mm; }
      }
    `
    document.head.appendChild(style)
    window.print()
    setTimeout(() => {
      const el = document.getElementById('pdf-print-style')
      if (el) el.remove()
      setExporting(false)
    }, 500)
  }, [])

  // ── LOADING STATE ──
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-14 h-14 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin shadow-lg" />
        <p className="text-sm font-medium text-indigo-500">Loading analytics dashboard...</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fetching shipment data</p>
      </div>
    )
  }

  const a = analytics
  const now = new Date()
  const currentMonth = now.toLocaleString('default', { month: 'long' })
  const currentYear = now.getFullYear()

  return (
    <div id="analytics-dashboard" className="space-y-5 animate-fade-in">
      {/* ──────────────────────────────────────
          HEADER SECTION
          ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md">
              <BarChart3 size={15} className="text-white" />
            </div>
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">
              Executive Report
            </span>
            {socket?.connected && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">LIVE</span>
              </span>
            )}
          </div>
          <h1 className="text-[32px] font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 dark:from-indigo-400 dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent tracking-tight">
            Management Analytics
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {currentMonth} {currentYear} • {a.total} total shipments • {a.active} active • {a.completionRate}% delivered
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Selector */}
          <div className="flex glass rounded-lg p-0.5 border" style={{ borderColor: 'var(--border-color)' }}>
            {[
              { label: '3M', value: '3m' },
              { label: '6M', value: '6m' },
              { label: '1Y', value: '12m' },
              { label: 'All', value: 'all' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                  dateRange === opt.value
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : ''
                }`}
                style={dateRange !== opt.value ? { color: 'var(--text-secondary)' } : {}}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 glass border rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            style={{ borderColor: 'var(--border-color)' }}
            title="Refresh data"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
              style={{ color: 'var(--text-secondary)' }}
            />
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="px-3.5 py-2.5 glass border rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────
          KPI CARDS ROW
          ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Package, color: 'text-blue-500', bgGrad: 'from-blue-500 to-indigo-600', value: a.total, label: 'Total Shipments', sub: `${a.imp} Imp / ${a.exp} Exp` },
          { icon: Clock, color: 'text-amber-500', bgGrad: 'from-amber-500 to-orange-600', value: a.active, label: 'In Progress', sub: `${a.cancelled} cancelled` },
          { icon: CheckCircle2, color: 'text-emerald-500', bgGrad: 'from-emerald-500 to-teal-600', value: a.delivered, label: 'Delivered', sub: `${a.completionRate}% rate` },
          { icon: Target, color: 'text-violet-500', bgGrad: 'from-violet-500 to-purple-600', value: `${a.completionRate}%`, label: 'Completion', sub: 'delivery rate' },
          { icon: DollarSign, color: 'text-rose-500', bgGrad: 'from-rose-500 to-pink-600', value: `₹${(a.revenueThisMonth / 100000).toFixed(1)}L`, label: 'Revenue (Est.)', sub: 'this month' },
          { icon: Activity, color: 'text-cyan-500', bgGrad: 'from-cyan-500 to-blue-600', value: `${a.growthPositive ? '+' : ''}${a.growth}%`, label: 'vs Last Month', sub: a.growthPositive ? 'Growth ↑' : 'Decline ↓', growth: true, gp: a.growthPositive },
        ].map((card, i) => {
          const Icon = card.icon
          return (
            <div
              key={i}
              className="glass rounded-xl p-4 border hover-lift group relative overflow-hidden animate-scale-in"
              style={{ borderColor: 'var(--glass-border)', animationDelay: `${i * 60}ms` }}
            >
              {/* Gradient blob */}
              <div
                className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${card.bgGrad} opacity-10 rounded-bl-full group-hover:opacity-20 transition-opacity duration-300`}
              />
              <Icon size={16} className={`${card.color} mb-2 relative z-10`} />
              <p className="text-2xl font-bold flex items-center gap-1 relative z-10" style={{ color: 'var(--text-primary)' }}>
                {card.growth && (
                  card.gp
                    ? <ArrowUpRight size={14} className="text-emerald-500" />
                    : <TrendingDown size={14} className="text-red-500" />
                )}
                {card.value}
              </p>
              <p className="text-[10px] font-semibold relative z-10" style={{ color: 'var(--text-secondary)' }}>
                {card.label}
              </p>
              <p className="text-[9px] mt-0.5 relative z-10" style={{ color: 'var(--text-muted)' }}>
                {card.sub}
              </p>
            </div>
          )
        })}
      </div>

      {/* ──────────────────────────────────────
          MONTHLY TREND + TYPE BREAKDOWN
          ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Trend Chart */}
        <div className="lg:col-span-2 glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <TrendingUp size={16} className="text-indigo-500" />
              12-Month Shipment Trend
            </h3>
            <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full" style={{ color: 'var(--text-muted)' }}>
              Total: {a.total}
            </span>
          </div>
          <BarChartSVG data={a.monthly} height={260} color="#6366f1" />
        </div>

        {/* Shipment Type Donut */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <PieChartIcon size={16} className="text-indigo-500" />
            Shipment Mix
          </h3>
          <DonutChart data={a.typeBreakdown} size={170} centerLabel="Total" />
          <div className="space-y-2 mt-4">
            {a.typeBreakdown.map((item, i) => {
              const Icon = item.icon || Package
              const pct = a.total > 0 ? ((item.value / a.total) * 100).toFixed(0) : '0'
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <Icon size={12} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                  </div>
                  <span className="font-bold tabular-nums ml-2 flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {item.value} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────
          STATUS PIPELINE + WEEKLY PERFORMANCE
          ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Layers size={16} className="text-indigo-500" />
            Shipment Status Pipeline
          </h3>
          <div className="space-y-4">
            {a.statusDistribution.map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{s.icon}</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {s.value} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                      ({a.total > 0 ? ((s.value / a.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </span>
                </div>
                <ProgressBar value={s.value} max={a.total} color={s.color} height={10} />
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Performance */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={16} className="text-indigo-500" />
            Last 7 Days Performance
          </h3>
          <BarChartSVG data={a.weekly} height={200} color="#10b981" />
          {a.busiestDay && a.busiestDay.value > 0 && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
              <Zap size={14} className="text-emerald-500" />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{a.busiestDay.label}</strong> was busiest with{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{a.busiestDay.value}</strong> shipments
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────
          TOP CUSTOMERS + TOP ROUTES
          ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 10 Customers */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Building2 size={16} className="text-indigo-500" />
            Top 10 Customers
          </h3>
          <div className="space-y-1">
            {a.topCustomers.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>No customer data available</p>
            )}
            {a.topCustomers.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0
                      ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-md'
                      : i === 1
                        ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700 shadow-sm'
                        : i === 2
                          ? 'bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                  style={i >= 3 ? { color: 'var(--text-secondary)' } : {}}
                >
                  {i < 3 ? <Medal size={12} /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={c.name}>
                    {c.name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{c.shipments} shipments</span>
                    {c.delivered > 0 && (
                      <span className="text-emerald-500 font-medium">• {c.delivered} delivered</span>
                    )}
                    {c.revenue > 0 && (
                      <span className="text-indigo-500 font-medium">• ₹{(c.revenue / 1000).toFixed(0)}K</span>
                    )}
                  </div>
                </div>
                <div className="w-16 flex-shrink-0">
                  <ProgressBar value={c.shipments} max={a.maxCust} color="#6366f1" height={5} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Routes */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Route size={16} className="text-indigo-500" />
            Top 10 Trade Routes
          </h3>
          <div className="space-y-1">
            {a.topRoutes.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>No route data available</p>
            )}
            {a.topRoutes.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0
                      ? 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-md'
                      : i === 1
                        ? 'bg-gradient-to-br from-blue-300 to-indigo-400 text-white shadow-sm'
                        : i === 2
                          ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                  style={i >= 3 ? { color: 'var(--text-secondary)' } : {}}
                >
                  <MapPin size={10} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {r.from} <ArrowRight size={10} className="inline mx-1" style={{ color: 'var(--text-muted)' }} /> {r.to}
                  </p>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{r.shipments} shipments</span>
                    <span>• {r.weight.toFixed(1)} kg</span>
                  </div>
                </div>
                <div className="w-16 flex-shrink-0">
                  <ProgressBar value={r.shipments} max={a.maxRoute} color="#3b82f6" height={5} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────
          OPERATIONAL INSIGHTS + QUICK STATS
          ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Operational Insights */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Zap size={16} className="text-indigo-500" />
            Operational Insights
          </h3>
          <div className="space-y-3">
            {/* Monthly shipments */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <Calendar size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {currentMonth} Shipments
                </p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{a.thisMonthCount}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {a.growthPositive ? '↑' : '↓'} {Math.abs(Number(a.growth))}% vs last month
                </p>
              </div>
            </div>

            {/* Delivery performance */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <CheckCircle2 size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Delivery Performance
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{a.delivered}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    of {a.total} delivered
                  </span>
                </div>
                <ProgressBar value={a.delivered} max={a.total || 1} color="#10b981" height={6} />
              </div>
            </div>

            {/* Revenue estimate */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-50/50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/30">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <DollarSign size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Revenue Estimate (All Time)
                </p>
                <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                  ₹{(a.totalRevenue / 100000).toFixed(2)}L
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Based on selling rate × weight
                </p>
              </div>
            </div>

            {/* Average daily volume */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Avg Daily Volume
                </p>
                <p className="text-lg font-bold text-violet-600 dark:text-violet-400">{a.avgPerDay}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  shipments per day
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Hash size={16} className="text-indigo-500" />
            Quick Stats
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Globe, color: 'text-blue-500', label: 'Import', value: a.imp },
              { icon: Globe, color: 'text-cyan-500', label: 'Export', value: a.exp },
              { icon: Weight, color: 'text-amber-500', label: 'Total Weight', value: `${a.totalWeight} kg` },
              { icon: Weight, color: 'text-violet-500', label: 'Avg Weight', value: `${a.avgWeight} kg` },
              { icon: Users, color: 'text-emerald-500', label: 'Team Members', value: a.team.length },
              { icon: Clock, color: 'text-rose-500', label: 'Cancelled', value: a.cancelled },
            ].map((stat, i) => {
              const Icon = stat.icon
              return (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30"
                >
                  <Icon size={14} className={`${stat.color} mb-1`} />
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Type Quick View */}
        <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Filter size={16} className="text-indigo-500" />
            By Shipment Type
          </h3>
          <div className="space-y-3">
            {a.typeBreakdown.map((item, i) => {
              const Icon = item.icon || Package
              const pct = a.total > 0 ? ((item.value / a.total) * 100).toFixed(0) : '0'
              return (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={14} style={{ color: item.color }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={item.value} max={a.total || 1} color={item.color} height={6} />
                    <span className="text-xs font-bold tabular-nums w-16 text-right" style={{ color: 'var(--text-primary)' }}>
                      {item.value} ({pct}%)
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────
          TEAM PERFORMANCE LEADERBOARD
          ────────────────────────────────────── */}
      <div className="glass rounded-xl border p-5 hover-lift" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users size={16} className="text-indigo-500" />
            Team Performance Leaderboard
          </h3>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {a.team.length} team members
          </span>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                {['#', 'Team Member', 'Total', 'Active', 'Delivered', 'Rate', 'Performance'].map(h => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.team.map((m, i) => {
                const rateNum = Number(m.completionRate)
                const rateClass = rateNum >= 75
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : rateNum >= 40
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                const rankBg = i === 0
                  ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm'
                  : i === 1
                    ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700'
                    : i === 2
                      ? 'bg-gradient-to-br from-amber-600 to-orange-700 text-white'
                      : ''

                return (
                  <tr
                    key={i}
                    className="border-b hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 transition-colors"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <td className="py-3 px-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${rankBg}`}
                        style={!rankBg ? { color: 'var(--text-secondary)' } : {}}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {m.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{m.shipments}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{m.active}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{m.delivered}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rateClass}`}>
                        {m.completionRate}%
                      </span>
                    </td>
                    <td className="py-3 px-3 min-w-[100px]">
                      <ProgressBar value={m.shipments} max={a.maxTeam} color="#6366f1" height={6} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-2">
          {a.team.map((m, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-gray-100 dark:bg-gray-800" style={{ color: 'var(--text-secondary)' }}>
                    {i + 1}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                </div>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{m.shipments} shipments</span>
              </div>
              <ProgressBar value={m.shipments} max={a.maxTeam} color="#6366f1" height={4} />
              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span>Active: <strong className="text-amber-500">{m.active}</strong></span>
                <span>Delivered: <strong className="text-emerald-500">{m.delivered}</strong></span>
                <span>Rate: <strong>{m.completionRate}%</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────────────────────────
          FOOTER
          ────────────────────────────────────── */}
      <div
        className="flex items-center justify-between text-[10px] py-3 border-t"
        style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-900 rounded flex items-center justify-center">
            <Box size={8} className="text-white" />
          </div>
          <span>PAS Freight Management System • Executive Analytics Dashboard</span>
        </div>
        <span>
          Generated: {now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}