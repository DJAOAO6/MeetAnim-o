"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  periodOptions,
  serviceOptions,
  speciesOptions,
  type StatsPeriod,
  type StatsService,
  type StatsSpecies,
} from "@/data/stats-mock-data";

const selectClassName = "h-11 w-full rounded-[12px] border border-[var(--theme-border)] bg-animeo-bg px-3 text-sm font-bold text-animeo-dark outline-none transition focus:border-animeo sm:min-w-48";

export function StatsFilters({ period, service, species, startDate, endDate, onPeriodChange, onServiceChange, onSpeciesChange, onStartDateChange, onEndDateChange }: {
  period: StatsPeriod;
  service: StatsService;
  species: StatsSpecies;
  startDate: string;
  endDate: string;
  onPeriodChange: (value: StatsPeriod) => void;
  onServiceChange: (value: StatsService) => void;
  onSpeciesChange: (value: StatsSpecies) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <Card className="mb-5 p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <FilterField label="Période">
          <select value={period} onChange={(event) => onPeriodChange(event.target.value as StatsPeriod)} className={selectClassName}>
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FilterField>
        <FilterField label="Prestation">
          <select value={service} onChange={(event) => onServiceChange(event.target.value as StatsService)} className={selectClassName}>
            {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FilterField>
        <FilterField label="Espèce">
          <select value={species} onChange={(event) => onSpeciesChange(event.target.value as StatsSpecies)} className={selectClassName}>
            {speciesOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FilterField>
      </div>
      {period === "custom" ? (
        <div className="mt-4 grid gap-4 border-t border-[var(--theme-border)] pt-4 sm:grid-cols-2 md:max-w-xl">
          <FilterField label="Du"><input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} className={selectClassName} /></FilterField>
          <FilterField label="Au"><input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} className={selectClassName} /></FilterField>
        </div>
      ) : null}
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">{label}</span>{children}</label>;
}

export function MetricStrip({ children }: { children: ReactNode }) {
  return <Card className="mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-5">{children}</Card>;
}

export function StatMetric({ label, value, detail, icon, positive = false }: { label: string; value: string; detail?: string; icon: IconName; positive?: boolean }) {
  return (
    <div className="flex min-h-28 items-start gap-3 border-b border-[var(--theme-border)] p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0 xl:[&:nth-child(odd)]:border-r">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-animeo-soft text-animeo-dark"><Icon name={icon} className="h-4.5 w-4.5" /></span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-animeo-muted">{label}</span>
        <span className="mt-1 block text-2xl font-black text-animeo-dark">{value}</span>
        {detail ? <span className={`mt-1 block text-[11px] font-bold ${positive ? "text-animeo-success" : "text-animeo-muted"}`}>{detail}</span> : null}
      </span>
    </div>
  );
}

export function StatSection({ title, description, action, className = "", children }: { title: string; description?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={`p-5 sm:p-6 ${className}`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-animeo-dark">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-animeo-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function SimpleBarChart({ items, formatter = (value) => `${value} %`, maxValue }: { items: ReadonlyArray<{ label: string; value: number }>; formatter?: (value: number) => string; maxValue?: number }) {
  const maximum = maxValue ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-bold text-animeo-dark">{item.label}</span>
            <span className="font-extrabold tabular-nums text-animeo-dark">{formatter(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-animeo-bg">
            <div className="h-full rounded-full bg-animeo" style={{ width: `${Math.max(2, (item.value / maximum) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: ReadonlyArray<{ label: string; value: number }> }) {
  const width = 720;
  const height = 250;
  const left = 54;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(500, Math.ceil(Math.max(...data.map((item) => item.value)) / 500) * 500);
  const points = data.map((item, index) => ({
    ...item,
    x: left + (index / Math.max(data.length - 1, 1)) * chartWidth,
    y: top + chartHeight - (item.value / maxValue) * chartHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `M ${points[0]?.x ?? left} ${top + chartHeight} L ${line.replaceAll(" ", " L ")} L ${points.at(-1)?.x ?? left} ${top + chartHeight} Z`;
  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe mensuelle du chiffre d’affaires" className="min-w-[620px]">
        <title>Évolution mensuelle du chiffre d’affaires</title>
        {gridValues.map((ratio) => {
          const y = top + chartHeight - ratio * chartHeight;
          return (
            <g key={ratio}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--theme-border)" strokeWidth="1" />
              <text x={left - 8} y={y + 4} textAnchor="end" fill="var(--theme-muted)" fontSize="10">{Math.round(maxValue * ratio).toLocaleString("fr-FR")} €</text>
            </g>
          );
        })}
        <path d={area} fill="color-mix(in srgb, var(--theme-primary) 12%, transparent)" />
        <polyline points={line} fill="none" stroke="var(--theme-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4.5" fill="var(--theme-surface)" stroke="var(--theme-primary)" strokeWidth="3"><title>{point.label} : {point.value.toLocaleString("fr-FR")} €</title></circle>
            <text x={point.x} y={height - 12} textAnchor="middle" fill="var(--theme-muted)" fontSize="10" fontWeight="700">{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DonutChart({ items, centerLabel }: { items: ReadonlyArray<{ label: string; value: number; color: string }>; centerLabel: string }) {
  const gradient = items.reduce<{ offset: number; parts: string[] }>(
    (acc, item) => {
      const start = acc.offset;
      const end = start + item.value;
      acc.parts.push(`${item.color} ${start}% ${end}%`);
      return { offset: end, parts: acc.parts };
    },
    { offset: 0, parts: [] },
  ).parts.join(", ");

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={items.map((item) => `${item.label} ${item.value} %`).join(", ")}>
        <div className="absolute inset-7 flex items-center justify-center rounded-full bg-white text-center text-xs font-extrabold text-animeo-dark">{centerLabel}</div>
      </div>
      <div className="w-full space-y-2.5">
        {items.map((item) => <div key={item.label} className="flex items-center justify-between gap-4 text-sm"><span className="flex items-center gap-2 font-bold text-animeo-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><strong className="text-animeo-dark">{item.value} %</strong></div>)}
      </div>
    </div>
  );
}
