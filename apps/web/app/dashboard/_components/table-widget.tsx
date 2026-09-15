'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { resolveColor } from '@/lib/widget-colors'

export function TableWidget({
  data,
  colorScheme,
  colors,
  pageSize: pageSizeProp,
}: {
  data: any[]
  colorScheme?: string
  colors?: string[]
  pageSize?: number
}) {
  const safeData = Array.isArray(data) ? data : []
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)

  const pageSize = Number.isFinite(Number(pageSizeProp)) && Number(pageSizeProp) > 0
    ? Math.min(100, Math.floor(Number(pageSizeProp)))
    : 8
  const accent = colorScheme ? resolveColor(colorScheme) : undefined

  if (safeData.length === 0) return <div className="text-xs text-muted-foreground text-center">No data</div>

  const columns = Object.keys(safeData[0] ?? {}).filter(c => c.toLowerCase() !== 'color')

  const sorted = sortKey
    ? [...safeData].sort((a, b) => {
        const av = a?.[sortKey] ?? '';
        const bv = b?.[sortKey] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      })
    : safeData

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(sorted.length / pageSize)

  const rowColor = (row: any, absIndex: number): string | undefined =>
    colors?.[absIndex] ?? (typeof row?.color === 'string' ? row.color : undefined)

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              {columns.map((col, ci) => (
                <th
                  key={col}
                  className="px-2 py-1.5 text-left font-medium cursor-pointer hover:text-foreground whitespace-nowrap"
                  style={{ color: ci === 0 && accent ? accent : undefined }}
                  onClick={() => {
                    if (sortKey === col) setSortAsc(!sortAsc)
                    else { setSortKey(col); setSortAsc(true) }
                  }}
                >
                  <span className={`flex items-center gap-1 ${ci === 0 && accent ? '' : 'text-muted-foreground'}`}>
                    {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    {sortKey === col && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row: any, i: number) => {
              const absIndex = page * pageSize + i
              const rc = rowColor(row, absIndex)
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  {columns.map((col, ci) => (
                    <td
                      key={col}
                      className="px-2 py-1.5 whitespace-nowrap text-foreground/80"
                      style={ci === 0 && rc ? { boxShadow: `inset 3px 0 0 0 ${rc}`, color: rc, fontWeight: 500 } : undefined}
                    >
                      {typeof row?.[col] === 'object' ? JSON.stringify(row[col]) : String(row?.[col] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1 border-t border-white/5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground">{sorted.length} rows &middot; {pageSize}/page</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-2 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-foreground">Prev</button>
            <span className="text-[10px] text-muted-foreground px-1">{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-2 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-foreground">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
