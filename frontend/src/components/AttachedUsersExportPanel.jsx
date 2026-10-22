import clsx from 'clsx';
import { Download, Radio, Signal } from 'lucide-react';
import { buildCsvFilename, downloadCsv } from '../utils/csv';
import { EXPORT_HEADERS, buildExportSections } from '../utils/attachedUsersExport';

const ICON_STROKE = 1.75;

const GROUP_ICON = { packet: Signal, voice: Radio };

/** Full figures, not "4.13M": peak and average are here to be compared. */
function figure(value, unit) {
  if (!Number.isFinite(Number(value))) return '—';
  const text = Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return unit === 'Erlang' ? `${text} Erl` : text;
}

/**
 * The downloadable data points for Peak Attached Users, reorganised: voice and
 * packet in separate sections, and each measure's peak and average side by side
 * on one row.
 *
 * On screen this shows the overall figures per group; the CSV carries those
 * plus the day-by-day and per-node rows, long-format and machine-readable (see
 * ../utils/attachedUsersExport.js).
 *
 * @param {Object} calculated   a report's `calculated` block.
 * @param {Array}  fileNameParts fragments for the ASCII-safe CSV filename.
 */
export default function AttachedUsersExportPanel({
  calculated,
  fileNameParts = ['peak-attached-users'],
  className,
}) {
  const { groups, rows } = buildExportSections(calculated);
  if (!groups.length) return null;

  const handleExport = () => {
    downloadCsv(
      buildCsvFilename([...fileNameParts, 'voice-and-packet']),
      EXPORT_HEADERS,
      rows
    );
  };

  return (
    <div className={clsx('card overflow-hidden p-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-noc-border px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Downloadable data points</p>
          <h3 className="text-sm font-semibold tracking-tight text-noc-text">
            Voice and packet, peak beside average
          </h3>
          <p className="tabular mt-1 max-w-[80ch] text-xs leading-relaxed text-noc-muted">
            {groups.map((g) => g.label).join(' and ')} grouped separately. The download carries{' '}
            {rows.length} rows: the overall figures below, each day, and each node.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3 py-2 text-xs"
          onClick={handleExport}
          disabled={rows.length === 0}
          title="Export voice and packet data points as CSV"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Export CSV
        </button>
      </div>

      <div className="divide-y divide-noc-border/40">
        {groups.map((group) => {
          const Icon = GROUP_ICON[group.id] || Signal;
          return (
            <section key={group.id} className="px-5 py-4">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-noc-accent">
                <Icon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                {group.label}
              </h4>
              <p className="mt-1.5 max-w-[80ch] text-[11px] leading-relaxed text-noc-muted">
                {group.groupNote}
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="tabular w-full text-sm">
                  <thead>
                    <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                      <th className="py-2 pr-5 font-medium">Measure</th>
                      <th className="py-2 pr-5 text-right font-medium">Peak</th>
                      <th className="py-2 pr-5 text-right font-medium">Average</th>
                      <th className="py-2 pr-5 font-medium">Peak hour</th>
                      {group.hasShare && (
                        <th className="py-2 text-right font-medium">Share of attached</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {group.overall.map((entry) => (
                      <tr
                        key={entry.measure.key}
                        className="border-b border-noc-border/40 last:border-0"
                      >
                        <td className="py-2 pr-5 font-medium text-noc-text">
                          {entry.measure.label}
                        </td>
                        <td className="py-2 pr-5 text-right font-mono text-xs font-semibold text-noc-text">
                          {figure(entry.peak, entry.measure.unit)}
                        </td>
                        <td className="py-2 pr-5 text-right font-mono text-xs text-noc-textDim">
                          {figure(entry.average, entry.measure.unit)}
                        </td>
                        <td className="py-2 pr-5 text-xs text-noc-muted">{entry.peakAt || '—'}</td>
                        {group.hasShare && (
                          <td className="py-2 text-right font-mono text-xs text-noc-textDim">
                            {entry.measure.derived
                              ? '100%'
                              : `${calculated?.metrics?.[entry.measure.shareField] ?? '—'}%`}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
