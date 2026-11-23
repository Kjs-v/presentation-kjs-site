/** Calls our own /api with the login cookie and returns { ok, status, data }. Never throws. */
export type ApiResult<T = unknown> = { ok: boolean; status: number; data: T & { error?: string } };

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      /* empty or not JSON */
    }
    return { ok: res.ok, status: res.status, data: data as T & { error?: string } };
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection.' } as T & { error?: string } }; // offline
  }
}

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
};
