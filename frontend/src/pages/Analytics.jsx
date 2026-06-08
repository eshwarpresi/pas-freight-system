import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  CheckCircle2, Clock, Users, MapPin,
  BarChart3, PieChartIcon, Activity, Layers,
  Target, Globe, Building2,
  Box, Scale, Weight, Percent,
  RefreshCw, Download
} from 'lucide-react'

// ==========================================
// PURE SVG CHART COMPONENTS (No Dependencies)
// ==========================================

// Simple Bar Chart
function SimpleBarChart({ data, dataKey, color = '#6366f1', height = 200 }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const barWidth = Math.max(20, Math.min(40, (100 / data.length) - 4))
  
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${data.length * 50} ${height}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const barHeight = (d.value / max) * (height - 40)
        return (
          <g key={i}>
            <rect
              x={i * 50 + (50 - barWidth) / 2}
              y={height - 40 - barHeight}
              width={barWidth}
              height={barHeight}
              fill={d.color || color}
              rx={4}
              opacity={0.9}
            />
            <text x={i * 50 + 25} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
              {d.label?.substring(0, 3)}
            </text>
            <text x={i * 50 + 25} y={height - 45 - barHeight} textAnchor="middle" fontSize="9" fill="var(--text-primary)" fontWeight="600">
              {d.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Simple Donut Chart
function SimpleDonutChart({ data, size = 200 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  let cumulative = 0
  
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {data.map((d, i) => {
        const percentage = (d.value / total) * 100
        const startAngle = (cumulative / total) * 360
        const endAngle = ((cumulative + d.value) / total) * 360
        cumulative += d.value
        
        const startRad = (startAngle - 90) * Math.PI / 180
        const endRad = (endAngle - 90) * Math.PI / 180
        const r = 35
        const innerR = 20
        const cx = 50, cy = 50
        
        const x1 = cx + r * Math.cos(startRad)
        const y1 = cy + r * Math.sin(startRad)
        const x2 = cx + r * Math.cos(endRad)
        const y2 = cy + r * Math.sin(endRad)
        const x3 = cx + innerR * Math.cos(endRad)
        const y3 = cy + innerR * Math.sin(endRad)
        const x4 = cx + innerR * Math.cos(startRad)
        const y4 = cy + innerR * Math.sin(startRad)
        
        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0
        
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`}
            fill={d.color}
          />
        )
      })}
      <text x="50" y="48" textAnchor="middle" fontSize="12" fontWeight="bold" fill="var(--text-primary)">{total}</text>
      <text x="50" y="60" textAnchor="middle" fontSize="8" fill="var(--text-muted)">Total</text>
    </svg>
  )
}

// Simple Line/Area Chart
function SimpleAreaChart({ data, dataKey, color = '#6366f1', height = 200 }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const padding = { top: 20, right: 10, bottom: 30, left: 10 }
  const chartWidth = 100
  const chartHeight = 100
  const w = chartWidth - padding.left - padding.right
  const h = chartHeight - padding.top - padding.bottom
  
  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * w
    const y = padding.top + h - (d.value / max) * h
    return `${x},${y}`
  }).join(' ')
  
  const areaPoints = `${padding.left},${padding.top + h} ${points} ${padding.left + w},${padding.top + h}`
  
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 100`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      {data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1)) * w
        const y = padding.top + h - (d.value / max) * h
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="1.5" fill={color} />
            <text x={x} y={chartHeight - 5} textAnchor="middle" fontSize="6" fill="var(--text-muted)">
              {d.label?.substring(0, 3)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ==========================================
// COLOR CONSTANTS
// ==========================================
const COLORS = {
  freight: '#6366f1',
  ffOnly: '#8b5cf6',
  chaOnly: '#10b981',
  transport: '#3b82f6',
  doRelease: '#06b6d4',
}

// ==========================================
// SKELETON
// ==========================================
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 border border-[var(--glass-border)] animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 mb-2" />
            <div className="h-8 w-24 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
            <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ==========================================
// ANIMATED NUMBER
// ==========================================
function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  return <span>{prefix}{Number(value || 0).toLocaleString()}{suffix}</span>
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Analytics() {
  const [dateRange, setDateRange] = useState('12m')
  const [refreshing, setRefreshing] = useState(false)

  const { data: allShipmentsData, isLoading, refetch } = useQuery({
    queryKey: ['analytics-all-shipments'],
    queryFn: async () => {
      const res = await api.get('/freight/shipments', {
        params: { isArchived: 'false', page: 1, limit: 1 }
      })
      const total = res.data.pagination?.total || 0
      if (total === 0) return []
      
      const limit = 100
      const totalPages = Math.ceil(total / limit)
      const promises = []
      for (let i = 1; i <= totalPages; i++) {
        promises.push(
          api.get('/freight/shipments', {
            params: { isArchived: 'false', page: i, limit }
          })
        )
      }
      const responses = await Promise.all(promises)
      return responses.flatMap(r => r.data.data || [])
    },
    staleTime: 300000,
  })

  const shipments = allShipmentsData || []

  const analytics = useMemo(() => {
    const now = new Date()
    const months = dateRange === '3m' ? 3 : dateRange === '6m' ? 6 : dateRange === '12m' ? 12 : 999
    
    const filteredShipments = shipments.filter(s => {
      const created = new Date(s.createdAt)
      const diffMonths = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth())
      return diffMonths <= months
    })

    const totalShipments = filteredShipments.length
    const deliveredShipments = filteredShipments.filter(s => 
      ['DELIVERED', 'HAND_OVER', 'COMPLETED'].includes(s.currentStatus)
    ).length
    const activeShipments = filteredShipments.filter(s => 
      !['DELIVERED', 'HAND_OVER', 'COMPLETED', 'CANCELLED'].includes(s.currentStatus)
    ).length
    const completionRate = totalShipments > 0 ? ((deliveredShipments / totalShipments) * 100).toFixed(1) : 0

    const totalRevenue = filteredShipments.reduce((sum, s) => {
      return sum + (parseFloat(s.freightForwarding?.sellingRate) || 0)
    }, 0)
    const avgRevenuePerShipment = totalShipments > 0 ? Math.round(totalRevenue / totalShipments) : 0
    
    const thisMonth = now.getMonth()
    const revenueThisMonth = filteredShipments
      .filter(s => new Date(s.createdAt).getMonth() === thisMonth)
      .reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.sellingRate) || 0), 0)
    const revenueLastMonth = filteredShipments
      .filter(s => new Date(s.createdAt).getMonth() === thisMonth - 1)
      .reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.sellingRate) || 0), 0)
    const revenueGrowth = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : 0

    const shipmentTypeBreakdown = [
      { name: 'Freight', value: filteredShipments.filter(s => !['CHA Only', 'Transport', 'DO Release', 'FF Only'].includes(s.shipmentType)).length, color: COLORS.freight },
      { name: 'FF Only', value: filteredShipments.filter(s => s.shipmentType === 'FF Only').length, color: COLORS.ffOnly },
      { name: 'CHA Only', value: filteredShipments.filter(s => s.shipmentType === 'CHA Only').length, color: COLORS.chaOnly },
      { name: 'Transport', value: filteredShipments.filter(s => s.shipmentType === 'Transport').length, color: COLORS.transport },
      { name: 'DO Release', value: filteredShipments.filter(s => s.shipmentType === 'DO Release').length, color: COLORS.doRelease },
    ].filter(item => item.value > 0)

    const monthlyTrends = []
    for (let i = months - 1; i >= 0; i--) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthShipments = filteredShipments.filter(s => {
        const created = new Date(s.createdAt)
        return created.getMonth() === targetMonth.getMonth() && created.getFullYear() === targetMonth.getFullYear()
      })
      monthlyTrends.push({
        label: targetMonth.toLocaleString('default', { month: 'short', year: '2-digit' }),
        value: Math.round(monthShipments.reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.sellingRate) || 0), 0)),
        shipments: monthShipments.length,
      })
    }

    const statusDistribution = [
      { name: 'Enquiry', value: filteredShipments.filter(s => s.currentStatus === 'ENQUIRY').length, color: '#fbbf24' },
      { name: 'Booked/Scheduled', value: filteredShipments.filter(s => ['BOOKED', 'SCHEDULED', 'AWB_GENERATED'].includes(s.currentStatus)).length, color: '#6366f1' },
      { name: 'Customs', value: filteredShipments.filter(s => ['CHECKLIST_APPROVED', 'BOE_FILED', 'DO_COLLECTED', 'SB_FILED', 'OOC_DONE', 'GATE_PASS', 'LEO_DONE'].includes(s.currentStatus)).length, color: '#f59e0b' },
      { name: 'Delivered', value: filteredShipments.filter(s => ['DELIVERED', 'HAND_OVER'].includes(s.currentStatus)).length, color: '#10b981' },
      { name: 'Invoiced', value: filteredShipments.filter(s => ['INVOICE_GENERATED', 'INVOICE_SENT'].includes(s.currentStatus)).length, color: '#f43f5e' },
    ].filter(item => item.value > 0)

    const customerMap = {}
    filteredShipments.forEach(s => {
      const name = s.freightForwarding?.consigneeName || s.freightForwarding?.customerName || 'Unknown'
      const revenue = parseFloat(s.freightForwarding?.sellingRate) || 0
      if (!customerMap[name]) customerMap[name] = { name, revenue: 0, shipments: 0 }
      customerMap[name].revenue += revenue
      customerMap[name].shipments++
    })
    const topCustomers = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

    const routeMap = {}
    filteredShipments.forEach(s => {
      const from = s.freightForwarding?.fromLocation || 'Unknown'
      const to = s.freightForwarding?.toLocation || 'Unknown'
      if (from === 'Unknown' && to === 'Unknown') return
      const route = `${from} → ${to}`
      if (!routeMap[route]) routeMap[route] = { route, count: 0, revenue: 0 }
      routeMap[route].count++
      routeMap[route].revenue += parseFloat(s.freightForwarding?.sellingRate) || 0
    })
    const topRoutes = Object.values(routeMap).sort((a, b) => b.count - a.count).slice(0, 10)

    const teamMap = {}
    filteredShipments.forEach(s => {
      const name = s.createdByName || 'Unassigned'
      if (!teamMap[name]) teamMap[name] = { name, shipments: 0, revenue: 0, delivered: 0 }
      teamMap[name].shipments++
      teamMap[name].revenue += parseFloat(s.freightForwarding?.sellingRate) || 0
      if (['DELIVERED', 'HAND_OVER'].includes(s.currentStatus)) teamMap[name].delivered++
    })
    const teamPerformance = Object.values(teamMap)
      .map(t => ({ ...t, completionRate: t.shipments > 0 ? ((t.delivered / t.shipments) * 100).toFixed(0) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)

    const importCount = filteredShipments.filter(s => s.importExport === 'Import').length
    const exportCount = filteredShipments.filter(s => s.importExport === 'Export').length

    const totalWeight = filteredShipments.reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.weight) || 0), 0)
    const totalCBM = filteredShipments.reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.cbm) || 0), 0)

    return {
      totalShipments, deliveredShipments, activeShipments, completionRate,
      totalRevenue, avgRevenuePerShipment, revenueThisMonth, revenueGrowth,
      shipmentTypeBreakdown, monthlyTrends, statusDistribution,
      topCustomers, topRoutes, teamPerformance,
      importCount, exportCount, totalWeight, totalCBM,
    }
  }, [shipments, dateRange])

  const formatCurrency = (val) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`
    return `₹${val.toLocaleString()}`
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (isLoading) return <AnalyticsSkeleton />

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={18} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">
              Executive Analytics
            </span>
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">
            Management Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
            {[
              { label: '3M', value: '3m' },
              { label: '6M', value: '6m' },
              { label: '1Y', value: '12m' },
              { label: 'All', value: 'all' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  dateRange === opt.value
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="p-2.5 glass border border-[var(--border-color)] rounded-lg text-[var(--text-secondary)]">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ROW 1: SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <DollarSign size={18} className="text-white" />
            </div>
            <div className={`flex items-center gap-0.5 text-xs font-bold ${parseFloat(analytics.revenueGrowth) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {parseFloat(analytics.revenueGrowth) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(parseFloat(analytics.revenueGrowth))}%
            </div>
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]"><AnimatedNumber value={analytics.revenueThisMonth} prefix="₹" /></p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">Revenue This Month</p>
          <p className="text-[10px] text-[var(--text-muted)]">Total: {formatCurrency(analytics.totalRevenue)}</p>
        </div>

        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg mb-2">
            <Package size={18} className="text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]"><AnimatedNumber value={analytics.totalShipments} /></p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">Total Shipments</p>
          <p className="text-[10px] text-[var(--text-muted)]">Active: {analytics.activeShipments} | Delivered: {analytics.deliveredShipments}</p>
        </div>

        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg mb-2">
            <Target size={18} className="text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]"><AnimatedNumber value={analytics.completionRate} suffix="%" /></p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">Completion Rate</p>
          <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600" style={{ width: `${analytics.completionRate}%` }} />
          </div>
        </div>

        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg mb-2">
            <Activity size={18} className="text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]"><AnimatedNumber value={analytics.avgRevenuePerShipment} prefix="₹" /></p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">Avg Revenue/Shipment</p>
        </div>
      </div>

      {/* ROW 2: MONTHLY TREND + SHIPMENT TYPE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-xl border border-[var(--glass-border)] p-5 hover-lift">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-500" />
            Monthly Revenue Trend
          </h3>
          <SimpleAreaChart data={analytics.monthlyTrends} dataKey="value" color="#6366f1" height={250} />
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-indigo-500" />
              <span className="text-[var(--text-secondary)]">Revenue</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl border border-[var(--glass-border)] p-5 hover-lift">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <PieChartIcon size={16} className="text-indigo-500" />
            Shipment Type Mix
          </h3>
          {analytics.shipmentTypeBreakdown.length > 0 ? (
            <>
              <div className="flex justify-center">
                <SimpleDonutChart data={analytics.shipmentTypeBreakdown} size={180} />
              </div>
              <div className="space-y-1.5 mt-3">
                {analytics.shipmentTypeBreakdown.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--text-secondary)]">{item.name}</span>
                    </div>
                    <span className="font-semibold text-[var(--text-primary)]">{item.value} ({analytics.totalShipments > 0 ? ((item.value / analytics.totalShipments) * 100).toFixed(0) : 0}%)</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)] text-center py-16">No data</p>
          )}
        </div>
      </div>

      {/* ROW 3: STATUS + CUSTOMERS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-5 hover-lift">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Layers size={16} className="text-indigo-500" />
            Status Pipeline
          </h3>
          <div className="space-y-3">
            {analytics.statusDistribution.map((status, i) => {
              const percentage = analytics.totalShipments > 0 ? (status.value / analytics.totalShipments) * 100 : 0
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                      <span className="text-xs font-medium text-[var(--text-secondary)]">{status.name}</span>
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">{status.value} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: `${percentage}%`, background: `linear-gradient(90deg, ${status.color}, ${status.color}88)` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass rounded-xl border border-[var(--glass-border)] p-5 hover-lift">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-indigo-500" />
            Top 10 Customers
          </h3>
          <div className="space-y-2">
            {analytics.topCustomers.map((customer, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-[var(--text-muted)] w-5">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{customer.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{customer.shipments} shipments</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-3">{formatCurrency(customer.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 4: ROUTES + TEAM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-5 hover-lift">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-indigo-500" />
            Top 10 Routes
          </h3>
          <div className="space-y-2">
            {analytics.topRoutes.map((route, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-[var(--text-muted)] w-5">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{route.route}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{formatCurrency(route.revenue)} revenue</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-3">{route.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-xl border border-[var(--glass-border)] p-5 hover-lift">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Users size={16} className="text-indigo-500" />
            Team Performance
          </h3>
          <div className="space-y-2">
            {analytics.teamPerformance.map((member, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{member.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{member.shipments} • {member.completionRate}% complete</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 ml-3">{formatCurrency(member.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 5: IMPORT/EXPORT + WEIGHT */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift text-center">
          <Globe size={16} className="text-violet-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{analytics.importCount}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Import</p>
        </div>
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift text-center">
          <Globe size={16} className="text-amber-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{analytics.exportCount}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Export</p>
        </div>
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift">
          <Scale size={14} className="text-indigo-500 mb-1" />
          <p className="text-xl font-bold text-[var(--text-primary)]"><AnimatedNumber value={analytics.totalWeight} suffix=" kg" /></p>
          <p className="text-[10px] text-[var(--text-muted)]">Total Weight</p>
        </div>
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift">
          <Box size={14} className="text-indigo-500 mb-1" />
          <p className="text-xl font-bold text-[var(--text-primary)]"><AnimatedNumber value={analytics.totalCBM} suffix=" m³" /></p>
          <p className="text-[10px] text-[var(--text-muted)]">Total CBM</p>
        </div>
      </div>
    </div>
  )
}