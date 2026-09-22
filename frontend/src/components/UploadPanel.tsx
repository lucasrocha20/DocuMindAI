import { useRef, useState, type DragEvent } from 'react';
import { isAbortError } from '../api/client';
import { MAX_UPLOAD_BYTES, uploadDocument, type UploadHandle } from '../api/documents';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; fileName: string; progress: number }
  | { phase: 'done'; fileName: string }
  | { phase: 'cancelled'; fileName: string }
  | { phase: 'error'; message: string };

const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

function validateFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return `"${file.name}" is not a PDF. Choose a PDF file.`;
  if (file.size === 0) return `"${file.name}" is empty. Choose a different file.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `"${file.name}" is ${sizeMb} MB. The limit is ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

export function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<UploadHandle | null>(null);

  const uploading = state.phase === 'uploading';

  function startUpload(file: File) {
    const problem = validateFile(file);
    if (problem) {
      setState({ phase: 'error', message: problem });
      return;
    }

    setState({ phase: 'uploading', fileName: file.name, progress: 0 });
    const upload = uploadDocument(file, (progress) =>
      setState((current) => (current.phase === 'uploading' ? { ...current, progress } : current)),
    );
    uploadRef.current = upload;

    upload.result
      .then(() => {
        setState({ phase: 'done', fileName: file.name });
        onUploaded();
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          setState({ phase: 'cancelled', fileName: file.name });
        } else {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : 'The upload failed. Try again.',
          });
        }
      })
      .finally(() => {
        uploadRef.current = null;
      });
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setState({ phase: 'error', message: 'Upload one PDF at a time.' });
      return;
    }
    startUpload(files[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!uploading) handleFiles(event.dataTransfer.files);
  }

  const progressPercent = state.phase === 'uploading' ? Math.round(state.progress * 100) : 0;

  return (
    <section aria-labelledby="upload-heading" className="sheet p-5 sm:p-6">
      <h2 id="upload-heading" className="text-xl font-semibold">
        Upload an invoice
      </h2>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`mt-4 flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-pen bg-blotter/60' : 'border-rule'
        }`}
      >
        <p>Drag a PDF here, or</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            // Allow choosing the same file again after an error.
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={uploading}
          aria-describedby="upload-hint"
          onClick={() => inputRef.current?.click()}
        >
          Choose PDF
        </button>
        <p id="upload-hint" className="max-w-prose text-sm text-graphite">
          PDF up to {MAX_UPLOAD_MB} MB. Text-based PDFs only; scanned images can&apos;t be read yet.
        </p>
      </div>

      {state.phase === 'uploading' && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all text-sm">
              {progressPercent < 100
                ? `Uploading ${state.fileName}: ${progressPercent}%`
                : `Finishing ${state.fileName}…`}
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => uploadRef.current?.cancel()}>
              Cancel upload
            </button>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-blotter"
          >
            <div className="h-full bg-pen transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {/* Present from the start so screen readers announce changes to it. */}
      <div role="status" aria-live="polite" className="text-sm">
        {state.phase === 'uploading' && <span className="sr-only">Uploading {state.fileName}</span>}
        {state.phase === 'done' && (
          <p className="mt-4 rounded border border-completed-edge bg-completed-bg px-3 py-2 text-completed-fg">
            Uploaded {state.fileName}. It&apos;s in the queue and will show as Pending, then Processing, in the table below.
          </p>
        )}
        {state.phase === 'cancelled' && (
          <p className="mt-4 rounded border border-rule bg-blotter/50 px-3 py-2">
            Cancelled the upload of {state.fileName}.
          </p>
        )}
      </div>

      {state.phase === 'error' && (
        <p role="alert" className="mt-4 rounded border border-failed-edge bg-failed-bg px-3 py-2 text-sm text-failed-fg">
          {state.message}
        </p>
      )}
    </section>
  );
}
