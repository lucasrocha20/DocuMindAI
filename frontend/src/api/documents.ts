import { API_URL, ApiError, NETWORK_ERROR_MESSAGE, getJson } from './client';
import type { UploadedDocument } from './types';

// Mirrors the API's upload limit; the server remains the authority.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

export function listDocuments(signal?: AbortSignal): Promise<UploadedDocument[]> {
  return getJson<UploadedDocument[]>('/documents', signal);
}

export interface UploadHandle {
  result: Promise<UploadedDocument>;
  cancel: () => void;
}

function uploadErrorMessage(status: number): string {
  if (status === 413) return `This file is larger than ${MAX_UPLOAD_MB} MB. Choose a smaller PDF.`;
  if (status === 429) return 'Too many uploads in a short time. Wait a minute, then try again.';
  if (status === 422) return "The server couldn't read this file as a PDF. Choose a valid PDF.";
  if (status >= 500) return "The server couldn't accept the upload. Try again in a moment.";
  return `The upload was rejected (status ${status}).`;
}

// XMLHttpRequest rather than fetch: fetch cannot report upload progress.
export function uploadDocument(file: File, onProgress: (fraction: number) => void): UploadHandle {
  const request = new XMLHttpRequest();

  const result = new Promise<UploadedDocument>((resolve, reject) => {
    request.open('POST', `${API_URL}/documents/upload`);
    request.responseType = 'json';

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response as UploadedDocument);
      } else {
        reject(new ApiError(uploadErrorMessage(request.status), request.status));
      }
    };
    request.onerror = () => reject(new ApiError(NETWORK_ERROR_MESSAGE, null));
    request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    const body = new FormData();
    body.append('file', file);
    request.send(body);
  });

  return { result, cancel: () => request.abort() };
}
