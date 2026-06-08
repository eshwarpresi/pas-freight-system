import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useSocket } from '../App'
import {
  TrendingUp, Package, CheckCircle2, Clock, Users, MapPin,
  BarChart3, PieChartIcon, Layers, Globe, Building2,
  Box, RefreshCw, Truck, FileCheck, FileText, Ship,
  ClipboardList, Target, Activity, Award, Zap, Calendar,
  ArrowUpRight, ArrowDownRight, Medal, Download
} from 'lucide-react'

// Helper: Create element with className
function cE(type, props, ...children) {
  return React.createElement(type, props, ...children)
}

function ProgressBar(props) {
  var pct = props.max > 0 ? Math.min((props.value / props.max) * 100, 100) : 0
  var hpx = (props.height || 8) + 'px'
  var col = props.color || '#6366f1'
  return cE('div', { style: { height: hpx, background: 'rgba(229,231,235,0.5)' }, className: 'w-full rounded-full overflow-hidden' },
    cE('div', { style: { width: pct + '%', background: 'linear-gradient(90deg, ' + col + ', ' + col + '88)' }, className: 'h-full rounded-full' })
  )
}

function DonutChart(props) {
  var data = props.data || []
  var size = props.size || 180
  var total = data.reduce(function(s, d) { return s + d.value }, 0)
  if (total === 0) return cE('p', { className: 'text-xs text-center py-12', style: { color: 'var(--text-muted)' } }, 'No data')
  
  var cumulative = 0
  var strokes = data.map(function(d) { var p = d.value / total; var s = cumulative; cumulative += p; return { color: d.color, start: s, end: cumulative, pct: p } })
  
  return cE('div', { className: 'relative flex items-center justify-center' },
    cE('svg', { width: size, height: size, viewBox: '0 0 100 100' },
      strokes.map(function(d, i) {
        if (d.pct === 0) return null
        var sa = (d.start * 360 - 90) * Math.PI / 180, ea = (d.end * 360 - 90) * Math.PI / 180, r = 38, ir = 22
        var x1 = 50 + r * Math.cos(sa), y1 = 50 + r * Math.sin(sa), x2 = 50 + r * Math.cos(ea), y2 = 50 + r * Math.sin(ea)
        var x3 = 50 + ir * Math.cos(ea), y3 = 50 + ir * Math.sin(ea), x4 = 50 + ir * Math.cos(sa), y4 = 50 + ir * Math.sin(sa)
        var la = (d.end - d.start) > 0.5 ? 1 : 0
        return cE('path', { key: i, d: 'M'+x1+','+y1+' A'+r+','+r+' 0 '+la+' 1 '+x2+','+y2+' L'+x3+','+y3+' A'+ir+','+ir+' 0 '+la+' 0 '+x4+','+y4+' Z', fill: d.color, stroke: 'var(--bg-primary)', strokeWidth: '1.5' })
      }),
      cE('text', { x: '50', y: '46', textAnchor: 'middle', fontSize: '16', fontWeight: 'bold', fill: 'var(--text-primary)' }, total),
      cE('text', { x: '50', y: '60', textAnchor: 'middle', fontSize: '9', fill: 'var(--text-muted)' }, 'Total')
    )
  )
}

function BarChartSVG(props) {
  var data = props.data || []
  var height = props.height || 260
  var color = props.color || '#6366f1'
  var max = Math.max.apply(null, data.map(function(d) { return d.value })) || 1
  var barGap = 8, barW = Math.min(44, Math.max(24, (900 / data.length) - barGap))
  var totalW = Math.max(data.length * (barW + barGap) + 40, 400), topP = 30, botP = 35
  
  return cE('svg', { width: '100%', height: height, viewBox: '0 0 ' + totalW + ' ' + height, preserveAspectRatio: 'xMidYMid meet', style: { overflow: 'visible' } },
    data.map(function(d, i) {
      var barH = Math.max(6, (d.value / max) * (height - topP - botP))
      var x = i * (barW + barGap) + 20, y = height - botP - barH
      return cE('g', { key: i },
        cE('defs', null, cE('linearGradient', { id: 'bg-'+i, x1: '0', y1: '0', x2: '0', y2: '1' },
          cE('stop', { offset: '0%', stopColor: d.color || color, stopOpacity: '1' }),
          cE('stop', { offset: '100%', stopColor: d.color || color, stopOpacity: '0.4' })
        )),
        cE('rect', { x: x, y: y, width: barW, height: barH, fill: 'url(#bg-'+i+')', rx: '4' }),
        d.value > 0 ? cE('text', { x: x + barW/2, y: y - 8, textAnchor: 'middle', fontSize: '11', fontWeight: '700', fill: 'var(--text-primary)' }, d.value) : null,
        cE('text', { x: x + barW/2, y: height - 10, textAnchor: 'middle', fontSize: '10', fill: 'var(--text-muted)' }, d.label ? d.label.substring(0, 4) : '')
      )
    })
  )
}

var COLORS = { freight: '#6366f1', ffOnly: '#8b5cf6', chaOnly: '#10b981', transport: '#3b82f6', doRelease: '#06b6d4', delivered: '#10b981', customs: '#f59e0b', booked: '#6366f1', enquiry: '#fbbf24', invoiced: '#f43f5e' }

var SHIPMENT_ICONS = { 'Freight': Ship, 'FF Only': FileText, 'CHA': FileCheck, 'Transport': Truck, 'DO Release': ClipboardList }

export default function Analytics() {
  var sv = useState('12m'); var dateRange = sv[0]; var setDateRange = sv[1]
  var rv = useState(false); var refreshing = rv[0]; var setRefreshing = rv[1]
  var ev = useState(false); var exporting = ev[0]; var setExporting = ev[1]
  var queryClient = useQueryClient()
  var socket = useSocket()

  useEffect(function() {
    if (!socket) return
    var hr = function() { queryClient.invalidateQueries({ queryKey: ['analytics-all-shipments'] }) }
    socket.on('shipment:new', hr); socket.on('shipment:update', hr)
    socket.on('shipment:statusUpdate', hr); socket.on('shipment:archiveUpdate', hr)
    return function() { socket.off('shipment:new', hr); socket.off('shipment:update', hr); socket.off('shipment:statusUpdate', hr); socket.off('shipment:archiveUpdate', hr) }
  }, [socket, queryClient])

  var qr = useQuery({
    queryKey: ['analytics-all-shipments'],
    queryFn: async function() {
      var res = await api.get('/freight/shipments', { params: { isArchived: 'false', page: 1, limit: 1 } })
      var total = res.data.pagination?.total || 0
      if (total === 0) return []
      var limit = 100, totalPages = Math.ceil(total / limit), promises = []
      for (var i = 1; i <= totalPages; i++) promises.push(api.get('/freight/shipments', { params: { isArchived: 'false', page: i, limit } }))
      return (await Promise.all(promises)).flatMap(function(r) { return r.data.data || [] })
    },
    staleTime: 300000, refetchOnWindowFocus: false
  })
  var allShipmentsData = qr.data; var isLoading = qr.isLoading; var refetch = qr.refetch
  var shipments = allShipmentsData || []

  var analytics = useMemo(function() {
    var now = new Date(), months = dateRange==='3m'?3:dateRange==='6m'?6:dateRange==='12m'?12:999
    var filtered = shipments.filter(function(s) { var dm = (now.getFullYear()-new Date(s.createdAt).getFullYear())*12+(now.getMonth()-new Date(s.createdAt).getMonth()); return dm <= months })
    var total = filtered.length
    var delivered = filtered.filter(function(s) { return ['DELIVERED','HAND_OVER','COMPLETED'].includes(s.currentStatus) }).length
    var active = filtered.filter(function(s) { return !['DELIVERED','HAND_OVER','COMPLETED','CANCELLED'].includes(s.currentStatus) }).length
    var cr = total>0?(delivered/total*100).toFixed(1):0
    var imp = filtered.filter(function(s){return s.importExport==='Import'}).length
    var exp = filtered.filter(function(s){return s.importExport==='Export'}).length
    var thisMonth = now.getMonth()
    var thisMonthCount = filtered.filter(function(s){return new Date(s.createdAt).getMonth()===thisMonth}).length
    var lastMonthCount = filtered.filter(function(s){return new Date(s.createdAt).getMonth()===thisMonth-1}).length
    var mg = lastMonthCount>0?((thisMonthCount-lastMonthCount)/lastMonthCount*100).toFixed(1):0
    var gp = Number(mg)>=0

    var typeBreakdown = [
      {name:'Freight',value:filtered.filter(function(s){return !['CHA Only','Transport','DO Release','FF Only'].includes(s.shipmentType)}).length,color:COLORS.freight,icon:Ship},
      {name:'CHA',value:filtered.filter(function(s){return s.shipmentType==='CHA Only'}).length,color:COLORS.chaOnly,icon:FileCheck},
      {name:'Transport',value:filtered.filter(function(s){return s.shipmentType==='Transport'}).length,color:COLORS.transport,icon:Truck},
      {name:'FF Only',value:filtered.filter(function(s){return s.shipmentType==='FF Only'}).length,color:COLORS.ffOnly,icon:FileText},
      {name:'DO Release',value:filtered.filter(function(s){return s.shipmentType==='DO Release'}).length,color:COLORS.doRelease,icon:ClipboardList}
    ].filter(function(item){return item.value>0}).sort(function(a,b){return b.value-a.value})

    var monthly = []
    for(var i=11;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth()-i,1);var count=filtered.filter(function(s){var sd=new Date(s.createdAt);return sd.getMonth()===d.getMonth()&&sd.getFullYear()===d.getFullYear()}).length;monthly.push({label:d.toLocaleString('default',{month:'short'}),value:count,color:count>0?'#6366f1':'#cbd5e1'})}

    var weekly = []
    for(var i=6;i>=0;i--){var d=new Date(now);d.setDate(d.getDate()-i);var count=filtered.filter(function(s){return new Date(s.createdAt).toDateString()===d.toDateString()}).length;weekly.push({label:d.toLocaleString('default',{weekday:'short'}),value:count,color:'#10b981'})}

    var statuses = [
      {name:'Enquiry',value:filtered.filter(function(s){return s.currentStatus==='ENQUIRY'}).length,color:COLORS.enquiry,icon:'🔍'},
      {name:'Booked/Scheduled',value:filtered.filter(function(s){return ['BOOKED','SCHEDULED','AWB_GENERATED','NOMINATED'].includes(s.currentStatus)}).length,color:COLORS.booked,icon:'📋'},
      {name:'Customs Clearance',value:filtered.filter(function(s){return ['CHECKLIST_APPROVED','BOE_FILED','DO_COLLECTED','SB_FILED','OOC_DONE','GATE_PASS','LEO_DONE'].includes(s.currentStatus)}).length,color:COLORS.customs,icon:'🛃'},
      {name:'Delivered',value:delivered,color:COLORS.delivered,icon:'✅'},
      {name:'Invoiced',value:filtered.filter(function(s){return ['INVOICE_GENERATED','INVOICE_SENT'].includes(s.currentStatus)}).length,color:COLORS.invoiced,icon:'💰'}
    ].filter(function(item){return item.value>0})

    var custMap={}
    filtered.forEach(function(s){var name=s.freightForwarding?.consigneeName||s.freightForwarding?.customerName||'Unknown';if(!custMap[name])custMap[name]={name:name,shipments:0,delivered:0};custMap[name].shipments++;if(['DELIVERED','HAND_OVER'].includes(s.currentStatus))custMap[name].delivered++})
    var topCustomers=Object.values(custMap).sort(function(a,b){return b.shipments-a.shipments}).slice(0,10)

    var teamMap={}
    filtered.forEach(function(s){var name=s.createdByName||'Unassigned';if(!teamMap[name])teamMap[name]={name:name,shipments:0,delivered:0,active:0};teamMap[name].shipments++;if(['DELIVERED','HAND_OVER'].includes(s.currentStatus))teamMap[name].delivered++;else if(!['CANCELLED'].includes(s.currentStatus))teamMap[name].active++})
    var team=Object.values(teamMap).map(function(t){return{name:t.name,shipments:t.shipments,delivered:t.delivered,active:t.active,completionRate:t.shipments>0?((t.delivered/t.shipments)*100).toFixed(0):0}}).sort(function(a,b){return b.shipments-a.shipments})

    var totalDays=Math.max(1,months*30)
    var avgPerDay=total>0?(total/totalDays).toFixed(1):0
    var busiestDay=weekly.length>0?weekly.reduce(function(a,b){return a.value>b.value?a:b}):null

    return {total:total,delivered:delivered,active:active,completionRate:cr,imp:imp,exp:exp,thisMonthCount:thisMonthCount,growth:mg,growthPositive:gp,typeBreakdown:typeBreakdown,monthly:monthly,weekly:weekly,statuses:statuses,topCustomers:topCustomers,team:team,avgPerDay:avgPerDay,busiestDay:busiestDay}
  }, [shipments, dateRange])

  var handleRefresh = async function() { setRefreshing(true); await refetch(); setRefreshing(false) }
  var handlePDF = function() { setExporting(true); var s=document.createElement('style');s.id='pdf-print-style';s.textContent='@media print{body *{visibility:hidden!important}#analytics-dashboard,#analytics-dashboard *{visibility:visible!important}#analytics-dashboard{position:absolute;left:0;top:0;width:100%}}';document.head.appendChild(s);window.print();setTimeout(function(){var el=document.getElementById('pdf-print-style');if(el)el.remove();setExporting(false)},500) }

  if (isLoading) return cE('div', { className: 'text-center py-20' }, cE('p', { className: 'text-lg', style: { color: 'var(--text-muted)' } }, 'Loading analytics...'))

  var a = analytics
  var maxTeam = Math.max.apply(null, a.team.map(function(t){return t.shipments})) || 1
  var maxCust = Math.max.apply(null, a.topCustomers.map(function(c){return c.shipments})) || 1
  var now = new Date()
  var cm = now.toLocaleString('default',{month:'long'})
  var cy = now.getFullYear()
  var st = { color: 'var(--text-muted)' }
  var sp = { color: 'var(--text-primary)' }
  var ss = { color: 'var(--text-secondary)' }
  var bc = { borderColor: 'var(--border-color)' }
  var gc = { borderColor: 'var(--glass-border)' }

  return cE('div', { id: 'analytics-dashboard', className: 'space-y-6' },
    // HEADER
    cE('div', { className: 'flex flex-col lg:flex-row lg:items-center justify-between gap-4' },
      cE('div', null,
        cE('div', { className: 'flex items-center gap-2 mb-1' },
          cE('div', { className: 'w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md' },
            cE(BarChart3, { size: 15, className: 'text-white' })
          ),
          cE('span', { className: 'text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md' }, 'Executive Report'),
          socket && socket.connected ? cE('span', { className: 'flex items-center gap-1' },
            cE('span', { className: 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' }),
            cE('span', { className: 'text-[10px] text-emerald-600 dark:text-emerald-400 font-medium' }, 'LIVE')
          ) : null
        ),
        cE('h1', { className: 'text-[32px] font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 dark:from-indigo-400 dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent tracking-tight' }, 'Management Analytics'),
        cE('p', { className: 'text-xs mt-1', style: st }, cm + ' ' + cy + ' • ' + a.total + ' total shipments • ' + a.active + ' in progress')
      ),
      cE('div', { className: 'flex items-center gap-2' },
        cE('div', { className: 'flex glass rounded-lg p-0.5 border', style: bc },
          [{label:'3M',value:'3m'},{label:'6M',value:'6m'},{label:'1Y',value:'12m'},{label:'All',value:'all'}].map(function(opt) {
            return cE('button', { key: opt.value, onClick: function() { setDateRange(opt.value) }, className: 'px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap ' + (dateRange===opt.value?'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm':'text-[var(--text-secondary)]') }, opt.label)
          })
        ),
        cE('button', { onClick: handleRefresh, disabled: refreshing, className: 'p-2.5 glass border rounded-lg', style: bc },
          cE(RefreshCw, { size: 16, className: refreshing ? 'animate-spin' : '', style: ss })
        ),
        cE('button', { onClick: handlePDF, disabled: exporting, className: 'px-3.5 py-2.5 glass border rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2', style: bc },
          cE(Download, { size: 14 }), ' PDF'
        )
      )
    ),

    // KPI CARDS
    cE('div', { className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3' },
      [
        {icon:Package,cc:'text-blue-500',bg:'from-blue-500 to-indigo-600',val:String(a.total),label:'Total Shipments'},
        {icon:Clock,cc:'text-amber-500',bg:'from-amber-500 to-orange-600',val:String(a.active),label:'In Progress'},
        {icon:CheckCircle2,cc:'text-emerald-500',bg:'from-emerald-500 to-teal-600',val:String(a.delivered),label:'Delivered'},
        {icon:Target,cc:'text-violet-500',bg:'from-violet-500 to-purple-600',val:a.completionRate+'%',label:'Completion Rate'},
        {icon:Globe,cc:'text-cyan-500',bg:'from-cyan-500 to-blue-600',val:a.imp+'/'+a.exp,label:'Import / Export'},
        {icon:Activity,cc:'text-rose-500',bg:'from-rose-500 to-pink-600',val:(a.growthPositive?'+':'')+a.growth+'%',label:'vs Last Month',growth:true,gp:a.growthPositive}
      ].map(function(card,i) {
        var Icon = card.icon
        return cE('div', { key: i, className: 'glass rounded-xl p-4 border hover-lift group relative overflow-hidden', style: gc },
          cE('div', { className: 'absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ' + card.bg + ' opacity-10 rounded-bl-full group-hover:opacity-20 transition-opacity' }),
          cE(Icon, { size: 16, className: card.cc + ' mb-2' }),
          cE('p', { className: 'text-2xl font-bold flex items-center gap-1', style: sp },
            card.growth ? (card.gp ? cE(ArrowUpRight, { size: 14, className: 'text-emerald-500' }) : cE(ArrowDownRight, { size: 14, className: 'text-red-500' })) : null,
            card.val
          ),
          cE('p', { className: 'text-[10px] font-semibold', style: ss }, card.label)
        )
      })
    ),

    // MONTHLY TREND + TYPE
    cE('div', { className: 'grid grid-cols-1 lg:grid-cols-3 gap-4' },
      cE('div', { className: 'lg:col-span-2 glass rounded-xl border p-5 hover-lift', style: gc },
        cE('div', { className: 'flex items-center justify-between mb-4' },
          cE('h3', { className: 'text-sm font-bold flex items-center gap-2', style: sp }, cE(TrendingUp, { size: 16, className: 'text-indigo-500' }), '12-Month Shipment Trend'),
          cE('span', { className: 'text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full', style: st }, 'Total: ' + a.total)
        ),
        cE('div', { className: 'overflow-x-auto pb-2' }, cE(BarChartSVG, { data: a.monthly, height: 260, color: '#6366f1' }))
      ),
      cE('div', { className: 'glass rounded-xl border p-5 hover-lift', style: gc },
        cE('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: sp }, cE(PieChartIcon, { size: 16, className: 'text-indigo-500' }), 'Shipment Type Mix'),
        cE(DonutChart, { data: a.typeBreakdown, size: 170 }),
        cE('div', { className: 'space-y-2 mt-4' },
          a.typeBreakdown.map(function(item,i) {
            var Ico = item.icon || Package
            var pct = a.total>0?((item.value/a.total)*100).toFixed(0):0
            return cE('div', { key: i, className: 'flex items-center justify-between text-xs' },
              cE('div', { className: 'flex items-center gap-2 min-w-0' },
                cE('div', { className: 'w-3 h-3 rounded-full flex-shrink-0', style: { backgroundColor: item.color } }),
                cE(Ico, { size: 12, className: 'flex-shrink-0', style: st }),
                cE('span', { className: 'font-medium truncate', style: ss }, item.name)
              ),
              cE('span', { className: 'font-bold tabular-nums ml-2 flex-shrink-0', style: sp }, item.value + ' ', cE('span', { className: 'font-normal', style: st }, '(' + pct + '%)'))
            )
          })
        )
      )
    ),

    // STATUS + WEEKLY
    cE('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-4' },
      cE('div', { className: 'glass rounded-xl border p-5 hover-lift', style: gc },
        cE('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: sp }, cE(Layers, { size: 16, className: 'text-indigo-500' }), 'Shipment Status Pipeline'),
        cE('div', { className: 'space-y-4' },
          a.statuses.map(function(s,i) {
            return cE('div', { key: i },
              cE('div', { className: 'flex items-center justify-between mb-2' },
                cE('div', { className: 'flex items-center gap-2' },
                  cE('span', { className: 'text-sm' }, s.icon),
                  cE('span', { className: 'text-xs font-semibold', style: sp }, s.name)
                ),
                cE('span', { className: 'text-xs font-bold', style: sp }, s.value + ' ', cE('span', { className: 'font-normal', style: st }, '(' + ((s.value/a.total)*100).toFixed(0) + '%)'))
              ),
              cE(ProgressBar, { value: s.value, max: a.total, color: s.color, height: 10 })
            )
          })
        )
      ),
      cE('div', { className: 'glass rounded-xl border p-5 hover-lift', style: gc },
        cE('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: sp }, cE(Calendar, { size: 16, className: 'text-indigo-500' }), 'Last 7 Days Performance'),
        cE('div', { className: 'overflow-x-auto pb-2' }, cE(BarChartSVG, { data: a.weekly, height: 220, color: '#10b981' })),
        a.busiestDay ? cE('div', { className: 'flex items-center gap-2 mt-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg' },
          cE(Zap, { size: 14, className: 'text-emerald-500' }),
          cE('span', { className: 'text-xs', style: ss }, 'Busiest day: ', cE('strong', { style: sp }, a.busiestDay.label), ' with ' + a.busiestDay.value + ' shipments')
        ) : null
      )
    ),

    // CUSTOMERS + INSIGHTS
    cE('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-4' },
      cE('div', { className: 'glass rounded-xl border p-5 hover-lift', style: gc },
        cE('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: sp }, cE(Building2, { size: 16, className: 'text-indigo-500' }), 'Top 10 Customers'),
        cE('div', { className: 'space-y-1' },
          a.topCustomers.map(function(c,i) {
            return cE('div', { key: i, className: 'flex items-center gap-3 p-2 rounded-lg hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10' },
              cE('div', { className: 'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ' + (i===0?'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-md':i===1?'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700 shadow-sm':i===2?'bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-sm':'bg-gray-100 dark:bg-gray-800'), style: i>=3?st:{} }, i<3 ? cE(Medal, { size: 12 }) : i+1),
              cE('div', { className: 'flex-1 min-w-0' },
                cE('p', { className: 'text-xs font-semibold truncate', style: sp, title: c.name }, c.name),
                cE('div', { className: 'flex items-center gap-2 text-[10px]', style: st },
                  cE('span', null, c.shipments + ' shipments'),
                  c.delivered > 0 ? cE('span', { className: 'text-emerald-500' }, ' • ' + c.delivered + ' delivered') : null
                )
              ),
              cE('div', { className: 'w-20 flex-shrink-0' }, cE(ProgressBar, { value: c.shipments, max: maxCust, color: '#6366f1', height: 5 }))
            )
          })
        )
      ),
      cE('div', { className: 'glass rounded-xl border p-5 hover-lift', style: gc },
        cE('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: sp }, cE(Zap, { size: 16, className: 'text-indigo-500' }), 'Operational Insights'),
        cE('div', { className: 'space-y-3' },
          cE('div', { className: 'flex items-center gap-3 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30' },
            cE('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md' }, cE(Calendar, { size: 18, className: 'text-white' })),
            cE('div', null, cE('p', { className: 'text-xs font-semibold', style: sp }, cm + ' Shipments'), cE('p', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' }, a.thisMonthCount), cE('p', { className: 'text-[10px]', style: st }, (a.growthPositive?'↑':'↓') + ' ' + Math.abs(Number(a.growth)) + '% vs last month'))
          ),
          cE('div', { className: 'flex items-center gap-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30' },
            cE('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-md' }, cE(CheckCircle2, { size: 18, className: 'text-white' })),
            cE('div', { className: 'flex-1' },
              cE('p', { className: 'text-xs font-semibold', style: sp }, 'Delivery Performance'),
              cE('div', { className: 'flex items-center gap-2 mt-1' }, cE('span', { className: 'text-lg font-bold text-emerald-600 dark:text-emerald-400' }, a.delivered), cE('span', { className: 'text-xs', style: st }, 'of ' + a.total + ' delivered')),
              cE(ProgressBar, { value: a.delivered, max: a.total, color: '#10b981', height: 6 })
            )
          ),
          cE('div', { className: 'flex items-center gap-3 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30' },
            cE('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md' }, cE(Clock, { size: 18, className: 'text-white' })),
            cE('div', { className: 'flex-1' },
              cE('p', { className: 'text-xs font-semibold', style: sp }, 'Pending Clearance'),
              cE('div', { className: 'flex items-center gap-2 mt-1' }, cE('span', { className: 'text-lg font-bold text-amber-600 dark:text-amber-400' }, (a.statuses.find(function(s){return s.name==='Customs Clearance'})||{}).value||0), cE('span', { className: 'text-xs', style: st }, 'in customs')),
              cE(ProgressBar, { value: (a.statuses.find(function(s){return s.name==='Customs Clearance'})||{}).value||0, max: a.total, color: '#f59e0b', height: 6 })
            )
          ),
          cE('div', { className: 'flex items-center gap-3 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30' },
            cE('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md' }, cE(Activity, { size: 18, className: 'text-white' })),
            cE('div', null, cE('p', { className: 'text-xs font-semibold', style: sp }, 'Avg Daily Volume'), cE('p', { className: 'text-lg font-bold text-violet-600 dark:text-violet-400' }, a.avgPerDay), cE('p', { className: 'text-[10px]', style: st }, 'shipments per day'))
          )
        )
      )
    ),

    // TEAM LEADERBOARD
    cE('div', { className: 'glass rounded-xl border p-5 hover-lift', style: gc },
      cE('div', { className: 'flex items-center justify-between mb-4' },
        cE('h3', { className: 'text-sm font-bold flex items-center gap-2', style: sp }, cE(Users, { size: 16, className: 'text-indigo-500' }), 'Team Performance Leaderboard'),
        cE('span', { className: 'text-[10px]', style: st }, a.team.length + ' members')
      ),
      cE('div', { className: 'hidden md:block overflow-x-auto' },
        cE('table', { className: 'w-full' },
          cE('thead', null,
            cE('tr', { className: 'border-b', style: bc },
              ['Rank','Team Member','Shipments','Active','Delivered','Rate','Performance'].map(function(h){ return cE('th', { key: h, className: 'text-left py-3 px-3 text-[10px] font-semibold uppercase', style: st }, h) })
            )
          ),
          cE('tbody', null,
            a.team.map(function(m,i) {
              var rateClass = Number(m.completionRate)>=50?'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400':Number(m.completionRate)>=25?'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400':'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              var rankClass = i===0?'bg-gradient-to-br from-amber-400 to-yellow-500 text-white':i===1?'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700':i===2?'bg-gradient-to-br from-amber-600 to-orange-700 text-white':''
              return cE('tr', { key: i, className: 'border-b hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10', style: bc },
                cE('td', { className: 'py-3 px-3' }, cE('span', { className: 'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ' + rankClass, style: i>=3?st:{} }, i+1)),
                cE('td', { className: 'py-3 px-3' },
                  cE('div', { className: 'flex items-center gap-2' },
                    cE('div', { className: 'w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0' }, m.name.charAt(0).toUpperCase()),
                    cE('span', { className: 'text-xs font-semibold whitespace-nowrap', style: sp }, m.name)
                  )
                ),
                cE('td', { className: 'py-3 px-3 text-center' }, cE('span', { className: 'text-xs font-bold', style: sp }, m.shipments)),
                cE('td', { className: 'py-3 px-3 text-center' }, cE('span', { className: 'text-xs text-amber-600 dark:text-amber-400 font-medium' }, m.active)),
                cE('td', { className: 'py-3 px-3 text-center' }, cE('span', { className: 'text-xs text-emerald-600 dark:text-emerald-400 font-medium' }, m.delivered)),
                cE('td', { className: 'py-3 px-3 text-center' }, cE('span', { className: 'text-xs font-bold px-2 py-0.5 rounded-full ' + rateClass }, m.completionRate + '%')),
                cE('td', { className: 'py-3 px-3' }, cE(ProgressBar, { value: m.shipments, max: maxTeam, color: '#6366f1', height: 6 }))
              )
            })
          )
        )
      )
    ),

    // BOTTOM STATS
    cE('div', { className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3' },
      a.typeBreakdown.map(function(item,i) {
        var Ico = item.icon || Package
        return cE('div', { key: i, className: 'glass rounded-xl p-4 border hover-lift text-center', style: gc },
          cE(Ico, { size: 18, className: 'mx-auto mb-2', style: { color: item.color } }),
          cE('p', { className: 'text-xl font-bold', style: sp }, item.value),
          cE('p', { className: 'text-[10px] font-medium', style: st }, item.name)
        )
      }).concat([
        cE('div', { key: 'avg', className: 'glass rounded-xl p-4 border hover-lift text-center', style: gc },
          cE(Award, { size: 18, className: 'text-indigo-400 mx-auto mb-2' }),
          cE('p', { className: 'text-xl font-bold', style: sp }, a.avgPerDay),
          cE('p', { className: 'text-[10px] font-medium', style: st }, 'Avg/Day')
        )
      ])
    ),

    // FOOTER
    cE('div', { className: 'flex items-center justify-between text-[10px] py-2 border-t', style: { color: 'var(--text-muted)', borderColor: 'var(--border-color)' } },
      cE('span', null, 'PAS Freight Management System • Executive Dashboard'),
      cE('span', null, 'Updated: ' + now.toLocaleDateString() + ' at ' + now.toLocaleTimeString())
    )
  )
}