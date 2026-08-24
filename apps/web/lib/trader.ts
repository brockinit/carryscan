const DEFAULT = "http://127.0.0.1:8080";

export function traderBase(): string {
  return process.env.TRADER_AI_URL || DEFAULT;
}

export async function traderFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${traderBase()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

export async function traderJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await traderFetch(path, init);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `trader_ai ${r.status}`);
  }
  return r.json() as Promise<T>;
}
