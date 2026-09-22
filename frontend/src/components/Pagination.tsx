interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
}

// Uses aria-disabled rather than disabled so keyboard focus isn't dropped when
// the button you just pressed becomes unavailable (e.g. reaching the last page).
export function Pagination({ page, totalPages, onPageChange, label }: PaginationProps) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3 sm:px-6">
      <button
        type="button"
        className="btn btn-secondary"
        aria-disabled={!hasPrevious}
        onClick={() => hasPrevious && onPageChange(page - 1)}
      >
        Previous
      </button>
      <p className="text-sm text-graphite">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        aria-disabled={!hasNext}
        onClick={() => hasNext && onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
