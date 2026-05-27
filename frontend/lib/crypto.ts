export type Tier = "family" | "friends" | "santa" | "all";

export interface Gift {
  id: string;
  name: string;
  price: string;
  url: string;
  notes: string;
  tier: Tier;
  emoji: string;
}

export interface EncryptedPayload {
  ct: string;
  v: number;
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromb64url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return arr.buffer as ArrayBuffer;
}

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function masterKeyToFragment(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return b64url(raw);
}

export async function masterKeyFromFragment(fragment: string): Promise<CryptoKey> {
  // Must be extractable so deriveTierKey can re-import as HKDF
  return crypto.subtle.importKey("raw", fromb64url(fragment), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

async function deriveTierKey(masterKey: CryptoKey, tier: Tier): Promise<CryptoKey> {
  const masterRaw = await crypto.subtle.exportKey("raw", masterKey);
  const hkdfKey = await crypto.subtle.importKey("raw", masterRaw, "HKDF", false, ["deriveKey"]);
  const info = new TextEncoder().encode(`giftvault-tier-${tier}`);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ct), 12);
  return b64url(combined.buffer as ArrayBuffer);
}

async function decryptWithKey(key: CryptoKey, b64ct: string): Promise<string> {
  const combined = new Uint8Array(fromb64url(b64ct));
  const nonce = combined.slice(0, 12);
  const ct = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct);
  return new TextDecoder().decode(plain);
}

export async function encryptGifts(masterKey: CryptoKey, gifts: Gift[], version: number): Promise<Record<string, string>> {
  const tiers: Tier[] = ["family", "friends", "santa", "all"];
  const blobs: Record<string, string> = {};
  for (const tier of tiers) {
    const tierKey = await deriveTierKey(masterKey, tier);
    const visible = tier === "all" ? gifts : gifts.filter((g) => g.tier === tier || g.tier === "all");
    const innerCt = await encryptWithKey(tierKey, JSON.stringify(visible));
    const payload: EncryptedPayload = { ct: innerCt, v: version };
    blobs[tier] = await encryptWithKey(tierKey, JSON.stringify(payload));
  }
  return blobs;
}

export async function decryptGifts(masterKey: CryptoKey, tier: Tier, blob: string): Promise<Gift[]> {
  const tierKey = await deriveTierKey(masterKey, tier);
  const payloadStr = await decryptWithKey(tierKey, blob);
  const payload: EncryptedPayload = JSON.parse(payloadStr);
  return JSON.parse(await decryptWithKey(tierKey, payload.ct));
}

export async function buildShareUrl(origin: string, listId: string, masterKey: CryptoKey, tier: Tier): Promise<string> {
  const masterRaw = await crypto.subtle.exportKey("raw", masterKey);
  const hkdfKey = await crypto.subtle.importKey("raw", masterRaw, "HKDF", false, ["deriveKey"]);
  const info = new TextEncoder().encode(`giftvault-tier-${tier}`);
  const extractableTierKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", extractableTierKey);
  return `${origin}/view/${listId}?tier=${tier}#${b64url(raw)}`;
}

export async function decryptAsViewer(fragmentKey: string, blob: string): Promise<Gift[]> {
  const key = await crypto.subtle.importKey("raw", fromb64url(fragmentKey), { name: "AES-GCM" }, false, ["decrypt"]);
  const payloadStr = await decryptWithKey(key, blob);
  const payload: EncryptedPayload = JSON.parse(payloadStr);
  return JSON.parse(await decryptWithKey(key, payload.ct));
}