import type { ReactNode } from 'react';

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 px-5 py-10 text-graphite">
      <svg
        className="size-5 shrink-0 motion-safe:animate-spin"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M8 2a6 6 0 1 0 6 6" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <div className="mt-1 text-graphite">{children}</div>
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry: () => void;
  // Inline errors sit above content that is still on screen (e.g. a failed refresh).
  inline?: boolean;
}

export function ErrorState({ title, message, onRetry, inline = false }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 bg-failed-bg px-5 py-4 text-failed-fg ${
        inline ? 'border-b border-failed-edge' : 'py-8'
      }`}
    >
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5">{message}</p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
