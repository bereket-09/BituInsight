import clsx from 'clsx';
import { FileSpreadsheet, Star, AlertCircle } from 'lucide-react';

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
      return 'bg-noc-accent/20';
    case 'field_codes':
      return 'bg-orange-500/10';
    case 'data':
      return 'bg-green-500/5';
    default:
      return 'bg-noc-surface/50';
  }
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

  return (
    <div className="space-y-4 rounded-xl border border-noc-border bg-noc-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-noc-accent" />
          <div>
            <h3 className="text-sm font-semibold">Excel Preview</h3>
            <p className="text-xs text-noc-muted">
              {preview.fileName} · {(preview.fileSize / 1024).toFixed(1)} KB ·{' '}
              {preview.sheetCount} sheet{preview.sheetCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-noc-muted">Worksheet</label>
        <select
          value={selectedSheetIndex ?? selectedSheet?.index ?? 0}
          onChange={(e) => onSheetChange(parseInt(e.target.value, 10))}
          className="input-field"
        >
          {preview.sheets?.map((sheet) => (
            <option key={sheet.index} value={sheet.index}>
              {sheet.isRecommended ? '★ ' : ''}
              {sheet.name} ({sheet.rowCount} rows, {sheet.matchedColumns}/{sheet.requiredColumns ?? requiredCols} columns)
              {sheet.isCmmDataSheet ? ' · CMM Data' : ''}
            </option>
          ))}
        </select>
        {selectedSheet?.isRecommended && (
          <p className="mt-1 flex items-center gap-1 text-xs text-green-400">
            <Star className="h-3 w-3" />
            Recommended sheet for this workflow
          </p>
        )}
      </div>

      {selectedSheet && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-noc-muted">
                Header row (Excel row #)
              </label>
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
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-noc-muted">
                Data starts at row (Excel row #)
              </label>
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
            </div>
          </div>

          {selectedSheet.columnMapping && (
            <div className="rounded-lg border border-noc-border bg-noc-card p-3">
              <p className="mb-2 text-xs font-medium text-noc-muted">Detected column mapping</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selectedSheet.columnMapping).map(([key, col]) => (
                  <span key={key} className="badge-info font-mono text-[10px]">
                    {key}: {col.header}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedSheet.estimatedDataRows > 0 && (
            <p className="text-xs text-noc-muted">
              ~{selectedSheet.estimatedDataRows} data rows detected · skip row 2 field codes
              (TWOG_THREEG_DATAVOLUME, etc.) automatically
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-noc-border">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead>
                <tr className="border-b border-noc-border text-noc-muted">
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  {selectedSheet.previewRows[0]?.cells.map((_, i) => (
                    <th key={i} className="px-2 py-2 font-medium">
                      Col {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedSheet.previewRows.map((row) => {
                  const isHeader = row.rowNumber - 1 === (headerRowIndex ?? selectedSheet.suggestedHeaderRow);
                  const isDataStart =
                    row.rowNumber - 1 === (dataStartRowIndex ?? selectedSheet.suggestedDataStartRow);
                  return (
                    <tr
                      key={row.rowNumber}
                      className={clsx(
                        'border-b border-noc-border/40',
                        rowTypeClass(row.rowType),
                        isHeader && 'ring-1 ring-inset ring-noc-accent/50',
                        isDataStart && 'ring-1 ring-inset ring-green-500/40'
                      )}
                    >
                      <td className="px-2 py-1.5 font-mono text-noc-muted">{row.rowNumber}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={clsx(
                            'rounded px-1 py-0.5 text-[10px]',
                            row.rowType === 'field_codes' && 'text-orange-400',
                            row.rowType === 'header' && 'text-noc-accent',
                            row.rowType === 'data' && 'text-green-400'
                          )}
                        >
                          {rowTypeLabel(row.rowType)}
                        </span>
                      </td>
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="max-w-[140px] truncate px-2 py-1.5 font-mono"
                          title={cell != null ? String(cell) : ''}
                        >
                          {cell == null ? (
                            <span className="text-noc-muted">—</span>
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

          {matched < requiredCols && (
            <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Only {matched}/{requiredCols} required columns matched on this sheet.
                {workflowSlug === 'traffic-volume'
                  ? ' For CMM_KPIs.xlsx, switch to CMM Workbook upload (not Traffic Volume).'
                  : ' Pick a "Data for …" sheet or adjust header/data rows.'}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
