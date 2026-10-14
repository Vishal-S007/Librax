import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useChartColors } from '@/hooks/useChartColors';

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: ReactNode; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-control border border-line bg-surface-raised px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="mb-1 font-medium text-ink">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-ink tabular">{format ? format(p.value ?? 0) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ data, height = 260 }: { data: { label: string; issued: number; returned: number }[]; height?: number }) {
  const c = useChartColors();
  return (
    <div style={{ height }} role="img" aria-label={`Circulation trend: ${data.reduce((a, b) => a + b.issued, 0)} issues and ${data.reduce((a, b) => a + b.returned, 0)} returns in the period`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="g-issued" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.brass} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c.brass} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-returned" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.sage} stopOpacity={0.25} />
              <stop offset="100%" stopColor={c.sage} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.line }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: c.line }} />
          <Area type="monotone" dataKey="issued" name="Issued" stroke={c.brass} strokeWidth={2} fill="url(#g-issued)" isAnimationActive={false} />
          <Area type="monotone" dataKey="returned" name="Returned" stroke={c.sage} strokeWidth={2} fill="url(#g-returned)" isAnimationActive={false} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.muted }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, height, color, label, format }: { data: { name: string; value: number }[]; height?: number; color?: 'brass' | 'sage' | 'sky' | 'plum'; label: string; format?: (v: number) => string }) {
  const c = useChartColors();
  const h = height ?? Math.max(160, data.length * 34 + 20);
  return (
    <div style={{ height: h }} role="img" aria-label={`${label}: ${data.map((d) => `${d.name} ${format ? format(d.value) : d.value}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false}
            tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
          <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: c.line, opacity: 0.4 }} />
          <Bar dataKey="value" name={label} fill={c[color ?? 'brass']} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ColumnChart({ data, keys, height = 240, format }: { data: Record<string, string | number>[]; keys: { key: string; name: string; color: 'brass' | 'sage' | 'sky' | 'plum' | 'rose' }[]; height?: number; format?: (v: number) => string }) {
  const c = useChartColors();
  return (
    <div style={{ height }} role="img" aria-label={`Chart of ${keys.map((k) => k.name).join(' and ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.line }} />
          <YAxis tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={format} allowDecimals={false} />
          <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: c.line, opacity: 0.35 }} />
          {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={c[k.color]} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
          {keys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.muted }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, height = 220, centerLabel, centerValue }: { data: { name: string; value: number }[]; height?: number; centerLabel: string; centerValue: ReactNode }) {
  const c = useChartColors();
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ height, width: height }} role="img" aria-label={`${centerLabel}: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={c.series[i % c.series.length]} />)}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl text-ink tabular">{centerValue}</span>
          <span className="text-[11px] text-ink-faint">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.series[i % c.series.length] }} />
            <span className="flex-1 truncate text-ink-muted">{d.name}</span>
            <span className="tabular text-ink">{d.value}</span>
            <span className="w-10 text-right text-xs tabular text-ink-faint">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
