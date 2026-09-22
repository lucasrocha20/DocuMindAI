import type { DocumentStatus } from '../api/types';

const STATUS_STYLES: Record<DocumentStatus, { label: string; classes: string }> = {
  PENDING: { label: 'Pending', classes: 'border-pending-edge bg-pending-bg text-pending-fg' },
  PROCESSING: { label: 'Processing', classes: 'border-processing-edge bg-processing-bg text-processing-fg' },
  COMPLETED: { label: 'Completed', classes: 'border-completed-edge bg-completed-bg text-completed-fg' },
  FAILED: { label: 'Failed', classes: 'border-failed-edge bg-failed-bg text-failed-fg' },
};

function StatusIcon({ status }: { status: DocumentStatus }) {
  const shared = {
    className: 'size-4 shrink-0',
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  switch (status) {
    case 'PENDING':
      return (
        <svg {...shared}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.25 1.5" />
        </svg>
      );
    case 'PROCESSING':
      return (
        <svg {...shared} className="size-4 shrink-0 motion-safe:animate-spin">
          <path d="M8 2a6 6 0 1 0 6 6" />
        </svg>
      );
    case 'COMPLETED':
      return (
        <svg {...shared}>
          <circle cx="8" cy="8" r="6" />
          <path d="m5.5 8.25 1.75 1.75 3.25-3.5" />
        </svg>
      );
    case 'FAILED':
      return (
        <svg {...shared}>
          <circle cx="8" cy="8" r="6" />
          <path d="m6 6 4 4m0-4-4 4" />
        </svg>
      );
  }
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, classes } = STATUS_STYLES[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-sm font-medium ${classes}`}>
      <StatusIcon status={status} />
      {label}
    </span>
  );
}
