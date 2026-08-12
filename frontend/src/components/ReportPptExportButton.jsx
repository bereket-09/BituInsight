import { useState } from 'react';
import { Presentation, Loader2 } from 'lucide-react';
import { reportApi } from '../api';
import { downloadBlob } from '../utils/downloadBlob';
import { useTheme } from '../context/ThemeContext';

/**
 * Exports a single report as a PowerPoint deck.
 *
 * The workbook page has a full export panel with per-KPI selection; a single
 * report has exactly one KPI, so this is just the action.
 */
export default function ReportPptExportButton({ reportId, fileName }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { theme } = useTheme();

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await reportApi.downloadPresentation(reportId, {
        theme: theme === 'light' ? 'light' : 'dark',
      });

      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/);
      downloadBlob(res.data, match?.[1] || `${fileName || 'report'}.pptx`);
    } catch (err) {
      // The error body is a Blob because the request asked for one.
      let message = 'Export failed';
      try {
        const text = await err.response?.data?.text?.();
        if (text) message = JSON.parse(text).error || message;
      } catch {
        message = err.message || message;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button onClick={handleExport} disabled={busy} className="btn-secondary">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Presentation className="h-4 w-4" />
        )}
        {busy ? 'Building deck…' : 'Export PPTX'}
      </button>
      {error && <span className="mt-1 text-xs text-noc-danger">{error}</span>}
    </div>
  );
}
