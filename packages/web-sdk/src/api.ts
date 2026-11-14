import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function apiKey(): string | null {
  try {
    return localStorage.getItem('inkarr.apiKey');
  } catch {
    return null;
  }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  const key = apiKey();
  if (key) headers['X-Api-Key'] = key;
  const res = await fetch(`/api${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(data?.error ?? `HTTP ${res.status}`, res.status);
  return data as T;
}

api.get = <T = any>(path: string) => api<T>(path);
api.post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
api.put = <T = any>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json: json ?? {} });
api.del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

/** GET with caching; the path doubles as the query key. */
export function useApi<T = any>(path: string | null, opts: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {}) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api.get<T>(path!), enabled: path != null, ...opts });
}

/** Mutation that invalidates the given path prefixes on success. */
export function useApiMutation<TVars = any, TData = any>(fn: (vars: TVars) => Promise<TData>, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => {
      for (const prefix of invalidate) {
        qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(prefix) });
      }
    },
  });
}

export { useQueryClient };
