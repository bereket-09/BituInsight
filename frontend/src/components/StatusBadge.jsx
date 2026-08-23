import clsx from 'clsx';

/*
 * Status reads at a glance from the dot alone — colour plus a live pulse for the
 * two transient states — so the label is there to confirm, not to decode.
 */
const STATUS_MAP = {
  completed: { label: 'Completed', class: 'badge-success', dot: 'bg-noc-success' },
  failed: { label: 'Failed', class: 'badge-danger', dot: 'bg-noc-danger' },
  processing: { label: 'Processing', class: 'badge-info', dot: 'bg-noc-info', live: true },
  validating: { label: 'Validating', class: 'badge-warning', dot: 'bg-noc-warning', live: true },
  pending: { label: 'Pending', class: 'badge-neutral', dot: 'bg-noc-muted' },
};

const FALLBACK = { class: 'badge-neutral', dot: 'bg-noc-muted' };

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { ...FALLBACK, label: status };

  return (
    <span className={clsx('badge', config.class)}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {config.live && (
          <span
            className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', config.dot)}
          />
        )}
        <span className={clsx('relative inline-flex h-1.5 w-1.5 rounded-full', config.dot)} />
      </span>
      {config.label}
    </span>
  );
}
