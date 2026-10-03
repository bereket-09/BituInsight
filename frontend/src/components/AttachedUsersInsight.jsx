import clsx from 'clsx';
import { ArrowRight, Calculator, Calendar, Clock, Database, Layers, Server, Users } from 'lucide-react';
import { formatCount } from './AttachedUsersExplorer';

const PIPELINE_ICONS = { database: Database, calculator: Calculator, layers: Layers };

function Chip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-noc-border/80 bg-noc-surface/60 px-2.5 py-1 text-[11px] text-noc-muted">
      {Icon && <Icon className="h-3 w-3 shrink-0 text-noc-accent/80" />}
      {children}
    </span>
  );
}

function StatRow({ label, accent, peak, peakAt, average, unit = '' }) {
  return (
    <tr className="border-b border-noc-border/50 last:border-0">
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm text-noc-text">
          {accent && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />}
          {label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-noc-text">
        {formatCount(peak)}
        {unit}
      </td>
      <td className="px-4 py-2.5 text-xs text-noc-muted">{peakAt}</td>
      <td className="px-4 py-2.5 text-right font-mono text-sm text-noc-textDim">
        {formatCount(average)}
        {unit}
      </td>
    </tr>
  );
}

/**
 * "How this KPI is calculated" for Peak Attached Users, followed by the figures
 * people ask for first: overall peak and average per measure, each day's average
 * and peak hour, and each node's own peak and average.
 */
export default function AttachedUsersInsight({ summary = {}, calculated = {} }) {
  const insight = summary.insight;
  const m = calculated.metrics;
  if (!insight || !m) return null;

  const { formula, pipeline, scope } = insight;
  const dailyStats = calculated.dailyStats || [];
  const nodeStats = calculated.nodeStats || [];
  const hasVlr = m.measuresFound?.includes('vlr');
  const hasBhca = m.measuresFound?.includes('bhca');

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-noc-border bg-gradient-to-br from-noc-card via-noc-card to-noc-accent/5">
        <div className="border-b border-noc-border/60 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-noc-accent/15 text-noc-accent">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-noc-text">How this KPI is calculated</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-noc-muted">{insight.subtitle}</p>
              </div>
            </div>
            <span className="rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-3 py-1 text-xs font-medium text-[#4ADE80]">
              Unit: users
            </span>
          </div>
        </div>

        <div className="grid gap-4 border-b border-noc-border/40 px-5 py-4 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            {pipeline.map((step, i) => {
              const Icon = PIPELINE_ICONS[step.icon] || Layers;
              return (
                <div key={step.step} className="flex flex-1 items-center gap-2 sm:gap-3">
                  {i > 0 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-noc-muted/50 sm:block" />}
                  <div className="flex flex-1 gap-3 rounded-xl border border-noc-border/50 bg-noc-surface/30 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noc-accent/10 text-xs font-bold text-noc-accent">
                      {step.step}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-noc-accent" />
                        <p className="text-xs font-semibold text-noc-text">{step.title}</p>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-noc-muted">{step.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-dashed border-noc-accent/30 bg-noc-accent/5 px-4 py-3 lg:max-w-[300px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-noc-accent">{formula.title}</p>
            <p className="mt-1.5 text-sm font-medium text-noc-text">{formula.expression}</p>
            <p className="mt-2 text-[10px] leading-relaxed text-noc-muted/90">{formula.note}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-5 py-3">
          <Chip icon={Calendar}>{scope.timeSpan}</Chip>
          <Chip icon={Clock}>
            {scope.periodCount} hours · {scope.dayLabel}
          </Chip>
          <Chip icon={Database}>{Number(scope.rawRows).toLocaleString()} rows</Chip>
          {scope.cmmNodes?.length > 0 && (
            <Chip icon={Server}>
              {scope.cmmNodes.length} CMMs: {scope.cmmNodes.join(', ')}
            </Chip>
          )}
          {scope.mscNodes?.length > 0 && (
            <Chip icon={Server}>
              {scope.mscNodes.length} MSCs: {scope.mscNodes.join(', ')}
            </Chip>
          )}
        </div>

        {/* Overall peak and average for every measure */}
        <div className="border-t border-noc-border/40 bg-noc-surface/20">
          <div className="overflow-x-auto">
            <table className="tabular w-full">
              <thead>
                <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-4 py-2 font-medium">Measure (all nodes added)</th>
                  <th className="px-4 py-2 text-right font-medium">Overall peak</th>
                  <th className="px-4 py-2 font-medium">Peak hour</th>
                  <th className="px-4 py-2 text-right font-medium">Overall average</th>
                </tr>
              </thead>
              <tbody>
                <StatRow
                  label="Total attached users"
                  accent="#E6EDF3"
                  peak={m.peakTotalUsers}
                  peakAt={m.peakPeriod}
                  average={m.averageTotalUsers}
                />
                <StatRow label="4G attached" accent="#4ADE80" peak={m.users4g?.peak} peakAt={m.users4g?.peakAt} average={m.users4g?.average} />
                <StatRow label="3G attached" accent="#3B9EFF" peak={m.users3g?.peak} peakAt={m.users3g?.peakAt} average={m.users3g?.average} />
                <StatRow label="2G attached" accent="#A78BFA" peak={m.users2g?.peak} peakAt={m.users2g?.peakAt} average={m.users2g?.average} />
                {hasVlr && (
                  <StatRow label="VLR subscribers" accent="#FBBF24" peak={m.vlr.peak} peakAt={m.vlr.peakAt} average={m.vlr.average} />
                )}
                {hasBhca && (
                  <StatRow label="BHCA" accent="#F472B6" peak={m.bhca.peak} peakAt={m.bhca.peakAt} average={m.bhca.average} unit=" Erl" />
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-noc-border/40 px-4 py-2.5 text-[11px] text-noc-muted">
            Average daily peak: <span className="font-mono text-noc-text">{formatCount(m.averageDailyPeak)}</span>{' '}
            attached users — the busiest hour of a typical day. Lowest hour:{' '}
            <span className="font-mono text-noc-text">{formatCount(m.lowestTotalUsers)}</span> ({m.lowestPeriod}).
          </p>
        </div>
      </div>

      {dailyStats.length > 0 && (
        <div className="card overflow-hidden p-0">
          <header className="border-b border-noc-border/70 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-noc-text">Day by day</h3>
            <p className="mt-0.5 text-xs text-noc-muted">
              Each day&rsquo;s average hour and its busiest hour. Days with fewer than 24 hours are partial.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 text-right font-medium">Daily average</th>
                  <th className="px-4 py-2 text-right font-medium">Daily peak</th>
                  <th className="px-4 py-2 font-medium">Peak hour</th>
                  <th className="px-4 py-2 text-right font-medium">4G avg</th>
                  {hasVlr && <th className="px-4 py-2 text-right font-medium">VLR peak</th>}
                  {hasBhca && <th className="px-4 py-2 text-right font-medium">BHCA peak</th>}
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((d) => {
                  const isTop = d.peakTotal === Math.max(...dailyStats.map((x) => x.peakTotal));
                  return (
                    <tr key={d.day} className="border-b border-noc-border/50 last:border-0 hover:bg-noc-accent/[0.04]">
                      <td className="px-4 py-2.5 text-noc-text">
                        {d.day}
                        {d.hours < 24 && <span className="ml-1.5 text-[10px] text-noc-muted">({d.hours}h)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-noc-textDim">{formatCount(d.avgTotal)}</td>
                      <td className={clsx('px-4 py-2.5 text-right font-mono', isTop ? 'font-semibold text-noc-accent' : 'text-noc-text')}>
                        {formatCount(d.peakTotal)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-noc-muted">{d.peakAt}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-noc-textDim">{formatCount(d.avg4g)}</td>
                      {hasVlr && <td className="px-4 py-2.5 text-right font-mono text-noc-textDim">{formatCount(d.peakVlr)}</td>}
                      {hasBhca && <td className="px-4 py-2.5 text-right font-mono text-noc-textDim">{formatCount(d.peakBhca)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nodeStats.length > 0 && (
        <div className="card overflow-hidden p-0">
          <header className="border-b border-noc-border/70 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-noc-text">Per node</h3>
            <p className="mt-0.5 text-xs text-noc-muted">
              Each CMM and MSC on its own, so one node carrying more or less than its peers stands out.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-4 py-2 font-medium">Measure</th>
                  <th className="px-4 py-2 font-medium">Node</th>
                  <th className="px-4 py-2 font-medium">Site</th>
                  <th className="px-4 py-2 text-right font-medium">Peak</th>
                  <th className="px-4 py-2 text-right font-medium">Average</th>
                </tr>
              </thead>
              <tbody>
                {nodeStats.map((n) => (
                  <tr key={`${n.measure}-${n.node}`} className="border-b border-noc-border/50 last:border-0 hover:bg-noc-accent/[0.04]">
                    <td className="px-4 py-2 text-noc-textDim">{n.measureLabel}</td>
                    <td className="px-4 py-2 font-mono text-xs text-noc-text">{n.node}</td>
                    <td className="px-4 py-2 text-xs text-noc-muted">{n.site || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-noc-text">{formatCount(n.peak)}</td>
                    <td className="px-4 py-2 text-right font-mono text-noc-textDim">{formatCount(n.average)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
