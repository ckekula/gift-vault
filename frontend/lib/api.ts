const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface ListData {
  id: string;
  blobs: Record<string, string>;
  key_handles: Record<string, string>;
  claim_states: Record<string, string>;
  version: number;
  updated_at: string;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  createList: (blobs: Record<string, string>, keyHandles: Record<string, string>) =>
    req<ListData>("POST", "/lists", { blobs, key_handles: keyHandles }),

  getList: (id: string) => req<ListData>("GET", `/lists/${id}`),

  updateList: (id: string, blobs: Record<string, string>, keyHandles: Record<string, string>) =>
    req<ListData>("PUT", `/lists/${id}`, { blobs, key_handles: keyHandles }),

  claimGift: (id: string, giftId: string, claim: boolean) =>
    req<ListData>("POST", `/lists/${id}/claim`, { gift_id: giftId, claim }),
};