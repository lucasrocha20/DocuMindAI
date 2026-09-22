export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const NETWORK_ERROR_MESSAGE =
  "Can't reach the server. Check your connection and that the API is running.";

export const RATE_LIMITED_MESSAGE = 'Too many requests. Wait a moment, then try again.';

// `status` is null when the request never got a response (network failure).
export class ApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function readErrorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return `The server responded with status ${response.status}.`;
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(NETWORK_ERROR_MESSAGE, null);
  }

  if (!response.ok) {
    const message = response.status === 429 ? RATE_LIMITED_MESSAGE : await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}
