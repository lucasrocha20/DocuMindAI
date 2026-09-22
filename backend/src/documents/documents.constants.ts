export const ALLOWED_MIME_TYPE = 'application/pdf';
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

// BullMQ waits indefinitely for a Redis connection, so without a limit an
// upload request hangs for as long as Redis is down.
export const ENQUEUE_TIMEOUT_MS = 5000;
