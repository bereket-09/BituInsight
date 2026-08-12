import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import clsx from 'clsx';

export default function ChartFullscreenModal({
  open,
  onClose,
  title,
  children,
  imageUrl,
  onDownload,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Chart fullscreen preview'}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[95vh] w-full max-w-6xl flex-col rounded-2xl border border-noc-border bg-noc-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-noc-border px-5 py-4">
          <h2 className="text-base font-semibold text-noc-text">{title}</h2>
          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="btn-secondary py-2 text-xs"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-noc-muted hover:bg-noc-surface hover:text-noc-text"
              aria-label="Close fullscreen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="mx-auto max-h-[75vh] w-full object-contain"
            />
          ) : (
            <div className={clsx('min-h-[60vh] w-full')}>{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
