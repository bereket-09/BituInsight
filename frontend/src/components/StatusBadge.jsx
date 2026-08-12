import clsx from 'clsx';

const STATUS_MAP = {
  completed: { label: 'Completed', class: 'badge-success' },
  failed: { label: 'Failed', class: 'badge-danger' },
  processing: { label: 'Processing', class: 'badge-info' },
  validating: { label: 'Validating', class: 'badge-warning' },
  pending: { label: 'Pending', class: 'badge-neutral' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { label: status, class: 'badge-neutral' };
  return <span className={config.class}>{config.label}</span>;
}
