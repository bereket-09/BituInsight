import clsx from 'clsx';
import { FileSpreadsheet, Star, AlertTriangle } from 'lucide-react';

const ICON_STROKE = 1.75;

function rowTypeLabel(type) {
  switch (type) {
    case 'header':
      return 'Header';
    case 'field_codes':
      return 'Field codes';
    case 'data':
      return 'Data';
    default:
      return 'Meta';
  }
}

function rowTypeClass(type) {
  switch (type) {
    case 'header':
      return 'bg-noc-accent/[0.08]';
    case 'field_codes':
      return 'bg-noc-warning/[0.06]';
    case 'data':
      return '';
    default:
      return 'bg-noc-muted/[0.05]';
  }
}

function rowTypeTextClass(type) {
  switch (type) {
    case 'header':
      return 'text-noc-accent';
    case 'field_codes':
      return 'text-noc-warning';
    case 'data':
      return 'text-noc-textDim';
    default:
      return 'text-noc-muted';
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-noc-muted">{hint}</span>}
    </label>
  );
}

export default function ExcelPreview({
  preview,
  selectedSheetIndex,
  onSheetChange,
  headerRowIndex,
  dataStartRowIndex,
  onHeaderRowChange,
  onDataStartRowChange,
  workflowSlug,
}) {
  if (!preview) return null;

  const selectedSheet =
    preview.sheets?.find((s) => s.index === selectedSheetIndex) ||
    preview.sheets?.[0];

  const requiredCols = selectedSheet?.requiredColumns ?? 5;
  const matched = selectedSheet?.matchedColumns ?? 0;
  const fullyMatched = matched >= requiredCols;

  return (
    <section className="overflow-hidden rounded-2xl border border-noc-border bg-noc-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-noc-border px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-noc-accent/10 text-noc-accent">
          <FileSpreadsheet className="h-4 w-4" strokeWidth={ICON_STROKE} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-tight text-noc-text">
            {preview.fileName}
          </h3>
          <p className="tabular mt-0.5 text-xs text-noc-muted">
            {(preview.fileSize / 1024).toFixed(1)} KB · {preview.sheetCount} sheet
            {preview.sheetCount !== 1 ? 's' : ''}
          </p>
        </div>
        <span
          className={clsx(
            'badge tabular',
            fullyMatched ? 'badge-success' : 'badge-warning'
          )}
        >
          {matched}/{requiredCols} columns matched
        </span>
      </header>

      <div className="space-y-5 p-5">
        <Field
          label="Worksheet"
          hint={
            selectedSheet?.isRecommended
              ? undefined
              : 'Pick the sheet that holds the KPI rows'
          }
        >
          <select
            value={selectedSheetIndex ?? selectedSheet?.index ?? 0}
            onChange={(e) => onSheetChange(parseInt(e.target.value, 10))}
            className="input-field"
          >
            {preview.sheets?.map((sheet) => (
              <option key={sheet.index} value={sheet.index}>
                {sheet.isRecommended ? '★ ' : ''}
                {sheet.name} ({sheet.rowCount} rows,{' '}
                {sheet.matchedColumns}/{sheet.requiredColumns ?? requiredCols} columns)
                {sheet.isCmmDataSheet ? ' · CMM Data' : ''}
              </option>
            ))}
          </select>
        </Field>

        {selectedSheet?.isRecommended && (
          <p className="-mt-3 flex items-center gap-1.5 text-xs text-noc-accent">
            <Star className="h-3 w-3" strokeWidth={ICON_STROKE} />
            Recommended sheet for this workflow
          </p>
        )}

        {selectedSheet && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Header row">
                <select
                  value={headerRowIndex ?? selectedSheet.suggestedHeaderRow}
                  onChange={(e) => onHeaderRowChange(parseInt(e.target.value, 10))}
                  className="input-field"
                >
                  {selectedSheet.previewRows.map((row) => (
                    <option key={row.rowNumber} value={row.rowNumber - 1}>
                      Row {row.rowNumber}:{' '}
                      {row.cells.filter(Boolean).slice(0, 3).join(' | ') || '(empty)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data starts at row">
                <select
                  value={dataStartRowIndex ?? selectedSheet.suggestedDataStartRow}
                  onChange={(e) => onDataStartRowChange(parseInt(e.target.value, 10))}
                  className="input-field"
                >
                  {selectedSheet.previewRows.map((row) => (
                    <option key={row.rowNumber} value={row.rowNumber - 1}>
                      Row {row.rowNumber}
                      {row.rowType === 'field_codes' ? ' (field codes — skip)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {selectedSheet.columnMapping && (
              <div className="rounded-xl border border-noc-border bg-noc-bg/50 p-4">
                <p className="eyebrow mb-2.5">Detected column mapping</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(selectedSheet.columnMapping).map(([key, col]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-md border border-noc-border bg-noc-surface px-2 py-1 font-mono text-[10px] text-noc-textDim"
                    >
                      <span className="text-noc-accent">{key}</span>
                      <span className="text-noc-border">/</span>
                      {col.header}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-noc-border">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-noc-border bg-noc-bg/50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                  Sheet preview
                </p>
                {selectedSheet.estimatedDataRows > 0 && (
                  <p className="tabular text-[11px] text-noc-muted">
                    ~{selectedSheet.estimatedDataRows} data rows detected · row 2 field codes are
                    skipped automatically
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[600px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-noc-border bg-noc-bg/30 text-[10px] uppercase tracking-[0.1em] text-noc-muted">
                      <th className="px-2.5 py-2 font-medium">#</th>
                      <th className="px-2.5 py-2 font-medium">Type</th>
                      {selectedSheet.previewRows[0]?.cells.map((_, i) => (
                        <th key={i} className="px-2.5 py-2 font-medium">
                          Col {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSheet.previewRows.map((row) => {
                      const isHeader =
                        row.rowNumber - 1 ===
                        (headerRowIndex ?? selectedSheet.suggestedHeaderRow);
                      const isDataStart =
                        row.rowNumber - 1 ===
                        (dataStartRowIndex ?? selectedSheet.suggestedDataStartRow);
                      return (
                        <tr
                          key={row.rowNumber}
                          className={clsx(
                            'border-b border-noc-border/40',
                            rowTypeClass(row.rowType),
                            isHeader && 'ring-1 ring-inset ring-noc-accent/50',
                            isDataStart && 'ring-1 ring-inset ring-noc-success/40'
                          )}
                        >
                          <td className="px-2.5 py-1.5 font-mono text-noc-muted">
                            {row.rowNumber}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <span
                              className={clsx(
                                'text-[10px] font-medium uppercase tracking-wide',
                                rowTypeTextClass(row.rowType)
                              )}
                            >
                              {rowTypeLabel(row.rowType)}
                            </span>
                          </td>
                          {row.cells.map((cell, ci) => (
                            <td
                              key={ci}
                              className="max-w-[140px] truncate px-2.5 py-1.5 font-mono text-noc-textDim"
                              title={cell != null ? String(cell) : ''}
                            >
                              {cell == null ? (
                                <span className="text-noc-border">—</span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {!fullyMatched && (
              <div className="flex items-start gap-3 rounded-xl border border-noc-warning/30 bg-noc-warning/[0.07] p-4">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-noc-warning"
                  strokeWidth={ICON_STROKE}
                />
                <div className="text-xs leading-relaxed text-noc-textDim">
                  <p className="tabular font-semibold text-noc-text">
                    Only {matched} of {requiredCols} required columns matched
                  </p>
                  <p className="mt-1">
                    {workflowSlug === 'traffic-volume'
                      ? 'For CMM_KPIs.xlsx, switch to CMM workbook upload rather than traffic volume.'
                      : 'Pick a “Data for …” sheet, or adjust the header and data rows above.'}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
