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
 * Reports processed before the per-node grid existed only carry a flat list; the
 * grid is rebuilt from it, without each CMM's total peak (that needs hourly data).
 */
function nodeMatrixFrom(calculated) {
  if (calculated.nodeMatrix) return calculated.nodeMatrix;
  const byNode = new Map();
  for (const n of calculated.nodeStats || []) {
    const isAttach = n.measure.startsWith('users');
    const key = `${isAttach ? 'cmm' : 'msc'}|${n.node}`;
    if (!byNode.has(key)) byNode.set(key, { kind: isAttach ? 'cmm' : 'msc', node: n.node, site: n.site });
    byNode.get(key)[n.measure] = { peak: n.peak, avg: n.average };
  }
  const rows = [...byNode.values()].sort(
    (a, b) => String(a.site).localeCompare(String(b.site)) || a.node.localeCompare(b.node)
  );
  const cmm = rows.filter((r) => r.kind === 'cmm');
  cmm.forEach((r) => {
    r.total = { peak: null, avg: ['users4g', 'users3g', 'users2g'].reduce((s, k) => s + (r[k]?.avg || 0), 0) };
  });
  const all = cmm.reduce((s, r) => s + r.total.avg, 0);
  cmm.forEach((r) => {
    r.sharePct = all > 0 ? Math.round((r.total.avg / all) * 1000) / 10 : 0;
  });
  return { cmm, msc: rows.filter((r) => r.kind === 'msc') };
}

/** Nodes down the side, measures across the top, each split into peak and average. */
function NodeGrid({ title, groups, rows, totalRow, share = false }) {
  if (!groups.length) return null;
  // Site is written once per run of nodes at the same site (a merged cell).
  const siteSpan = rows.map((r, i) =>
    i > 0 && rows[i - 1].site === r.site ? 0 : rows.slice(i).findIndex((x) => x.site !== r.site) === -1
      ? rows.length - i
      : rows.slice(i).findIndex((x) => x.site !== r.site)
  );
  const cell = 'px-3 py-2.5 text-right font-mono text-sm';
  const unitOf = (key) => (key === 'bhca' ? ' Erl' : '');

  return (
    <div className="border-b border-noc-border/50 last:border-0">
      <p className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-noc-accent">{title}</p>
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-noc-muted">
              <th rowSpan={2} className="border-b border-noc-border px-4 py-2 text-left align-bottom font-medium">Site</th>
              <th rowSpan={2} className="border-b border-noc-border px-4 py-2 text-left align-bottom font-medium">Node</th>
              {groups.map((g) => (
                <th
                  key={g.key}
                  colSpan={2}
                  className="border-b border-l border-noc-border px-3 py-2 text-center font-semibold text-noc-text"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.accent }} />
                    {g.label}
                  </span>
                </th>
              ))}
              {share && (
                <th rowSpan={2} className="border-b border-l border-noc-border px-3 py-2 text-right align-bottom font-medium">
                  Share
                </th>
              )}
            </tr>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-noc-muted">
              {groups.map((g) => [
                <th key={`${g.key}-p`} className="border-b border-l border-noc-border px-3 py-1.5 text-right font-medium">Peak</th>,
                <th key={`${g.key}-a`} className="border-b border-noc-border px-3 py-1.5 text-right font-medium">Avg</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.node} className="border-b border-noc-border/50 hover:bg-noc-accent/[0.04]">
                {siteSpan[i] > 0 && (
                  <td
                    rowSpan={siteSpan[i]}
                    className="border-r border-noc-border/50 px-4 py-2.5 align-middle text-xs font-semibold text-noc-text"
                  >
                    {r.site || '—'}
                  </td>
                )}
                <td className="px-4 py-2.5 font-mono text-xs text-noc-textDim">{r.node}</td>
                {groups.map((g) => [
                  <td key={`${g.key}-p`} className={clsx(cell, 'border-l border-noc-border/50', g.strong ? 'font-semibold text-noc-text' : 'text-noc-text')}>
                    {r[g.key]?.peak != null ? `${formatCount(r[g.key].peak)}${unitOf(g.key)}` : '—'}
                  </td>,
                  <td key={`${g.key}-a`} className={clsx(cell, g.strong ? 'text-noc-text' : 'text-noc-muted')}>
                    {r[g.key]?.avg != null ? `${formatCount(r[g.key].avg)}${unitOf(g.key)}` : '—'}
                  </td>,
                ])}
                {share && <td className={clsx(cell, 'border-l border-noc-border/50 text-noc-textDim')}>{r.sharePct}%</td>}
              </tr>
            ))}
            {totalRow && (
              <tr className="bg-noc-accent/[0.06]">
                <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-noc-accent">
                  {totalRow.label}
                </td>
                {groups.map((g) => [
                  <td key={`${g.key}-p`} className={clsx(cell, 'border-l border-noc-border/50 font-semibold text-noc-text')}>
                    {totalRow[g.key]?.peak != null ? `${formatCount(totalRow[g.key].peak)}${unitOf(g.key)}` : '—'}
                  </td>,
                  <td key={`${g.key}-a`} className={clsx(cell, 'text-noc-text')}>
                    {totalRow[g.key]?.avg != null ? `${formatCount(totalRow[g.key].avg)}${unitOf(g.key)}` : '—'}
                  </td>,
                ])}
                {share && <td className={clsx(cell, 'border-l border-noc-border/50 text-noc-text')}>100%</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
  const matrix = nodeMatrixFrom(calculated);
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
                  {hasBhca && <th className="px-4 py-2 text-right font-medium">BHCA avg</th>}
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
                      {hasBhca && <td className="px-4 py-2.5 text-right font-mono text-noc-textDim">{formatCount(d.avgBhca)} Erl</td>}
                      {hasBhca && <td className="px-4 py-2.5 text-right font-mono text-noc-textDim">{formatCount(d.peakBhca)} Erl</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(matrix.cmm.length > 0 || matrix.msc.length > 0) && (
        <div className="card overflow-hidden p-0">
          <header className="border-b border-noc-border/70 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-noc-text">Per node</h3>
            <p className="mt-0.5 text-xs text-noc-muted">
              One row per node, every measure side by side. Peak is the node&rsquo;s busiest hour;
              avg is its average hour.
            </p>
          </header>
          {matrix.cmm.length > 0 && (
            <NodeGrid
              title="Attached users per CMM"
              groups={[
                { key: 'users4g', label: '4G', accent: '#4ADE80' },
                { key: 'users3g', label: '3G', accent: '#3B9EFF' },
                { key: 'users2g', label: '2G', accent: '#A78BFA' },
                { key: 'total', label: 'Total attached', accent: '#E6EDF3', strong: true },
              ]}
              rows={matrix.cmm}
              share
              totalRow={{
                label: `All ${matrix.cmm.length} CMMs`,
                users4g: { peak: m.users4g?.peak, avg: m.users4g?.average },
                users3g: { peak: m.users3g?.peak, avg: m.users3g?.average },
                users2g: { peak: m.users2g?.peak, avg: m.users2g?.average },
                total: { peak: m.peakTotalUsers, avg: m.averageTotalUsers },
                sharePct: 100,
              }}
            />
          )}
          {matrix.msc.length > 0 && (
            <NodeGrid
              title="Voice per MSC"
              groups={[
                ...(hasVlr ? [{ key: 'vlr', label: 'VLR subscribers', accent: '#FBBF24' }] : []),
                ...(hasBhca ? [{ key: 'bhca', label: 'BHCA (Erlang)', accent: '#F472B6' }] : []),
              ]}
              rows={matrix.msc}
              totalRow={{
                label: `All ${matrix.msc.length} MSCs`,
                vlr: { peak: m.vlr?.peak, avg: m.vlr?.average },
                bhca: { peak: m.bhca?.peak, avg: m.bhca?.average },
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
