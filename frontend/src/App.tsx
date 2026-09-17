import { useEffect, useState } from 'react';
import { fetchHealth, type HealthResponse } from './api/health';

type ApiState =
  | { status: 'loading' }
  | { status: 'online'; health: HealthResponse }
  | { status: 'offline'; error: string };

function App() {
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });

  useEffect(() => {
    fetchHealth()
      .then((health) => setApiState({ status: 'online', health }))
      .catch((error: unknown) =>
        setApiState({
          status: 'offline',
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">DocuMind AI</h1>
        <p className="mt-1 text-sm text-slate-500">Backend connectivity check</p>

        <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <span
            className={`h-3 w-3 rounded-full ${
              apiState.status === 'online'
                ? 'bg-green-500'
                : apiState.status === 'offline'
                  ? 'bg-red-500'
                  : 'bg-slate-300'
            }`}
          />
          <div className="text-sm">
            {apiState.status === 'loading' && (
              <span className="text-slate-500">Checking API…</span>
            )}
            {apiState.status === 'online' && (
              <span className="text-slate-700">
                API reachable — status: <strong>{apiState.health.status}</strong>
              </span>
            )}
            {apiState.status === 'offline' && (
              <span className="text-red-600">API unreachable: {apiState.error}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
