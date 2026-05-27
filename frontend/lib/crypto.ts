// tier is now any string — "everyone" is the built-in default, users can create their own
export type Tier = string;

export interface Group {
  id: string;       // used as the HKDF derivation label
  name: string;
  color: string;    // hex accent color assigned at creation
}

export interface Gift {
  id: string;
  name: string;
  price: string;
  url: string;
  notes: string;
  tier: Tier;       // matches a Group.id (or "everyone")
  emoji: string;
}

export interface VaultData {
  groups: Group[];
  gifts: Gift[];
}

export interface EncryptedPayload {
  ct: string;
  v: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromb64url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  return (Uint8Array.from(bin, (c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}

// ── Key operations ────────────────────────────────────────────────────────────

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function masterKeyToFragment(key: CryptoKey): Promise<string> {
  return b64url(await crypto.subtle.exportKey("raw", key));
}

export async function masterKeyFromFragment(fragment: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromb64url(fragment), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

/** Derive an AES-GCM key for a given group id using HKDF. */
async function deriveGroupKey(masterKey: CryptoKey, groupId: string, extractable = false): Promise<CryptoKey> {
  const masterRaw = await crypto.subtle.exportKey("raw", masterKey);
  const hkdfKey = await crypto.subtle.importKey("raw", masterRaw, "HKDF", false, ["deriveKey"]);
  const info = new TextEncoder().encode(`giftvault-group-${groupId}`);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

// ── Encrypt / decrypt helpers ─────────────────────────────────────────────────

async function enc(key: CryptoKey, plaintext: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ct), 12);
  return b64url(combined.buffer as ArrayBuffer);
}

async function dec(key: CryptoKey, b64ct: string): Promise<string> {
  const combined = new Uint8Array(fromb64url(b64ct));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12)
  );
  return new TextDecoder().decode(plain);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt the vault data into per-group blobs.
 * "everyone" is always included and sees all gifts.
 * Each group blob contains only the gifts tagged for that group + everyone gifts.
 */
export async function encryptVault(
  masterKey: CryptoKey,
  data: VaultData,
  version: number
): Promise<Record<string, string>> {
  const blobs: Record<string, string> = {};
  const allGroupIds = ["everyone", ...data.groups.map((g) => g.id)];

  for (const groupId of allGroupIds) {
    const key = await deriveGroupKey(masterKey, groupId);
    const visible =
      groupId === "everyone"
        ? data.gifts
        : data.gifts.filter((g) => g.tier === groupId || g.tier === "everyone");
    // Each blob also carries the group list so viewers can see group names
    const payload: EncryptedPayload & { groups: Group[] } = {
      ct: await enc(key, JSON.stringify(visible)),
      v: version,
      groups: data.groups,
    };
    blobs[groupId] = await enc(key, JSON.stringify(payload));
  }
  return blobs;
}

/** Decrypt the vault's "everyone" blob to get all gifts (owner path). */
export async function decryptVaultOwner(
  masterKey: CryptoKey,
  blob: string
): Promise<{ gifts: Gift[]; version: number }> {
  const key = await deriveGroupKey(masterKey, "everyone");
  const payloadStr = await dec(key, blob);
  const payload = JSON.parse(payloadStr);
  const gifts: Gift[] = JSON.parse(await dec(key, payload.ct));
  return { gifts, version: payload.v };
}

/** Build a shareable viewer URL for a group. The fragment is the derived group key. */
export async function buildShareUrl(
  origin: string,
  listId: string,
  masterKey: CryptoKey,
  group: Group
): Promise<string> {
  const extractableKey = await deriveGroupKey(masterKey, group.id, true);
  const raw = await crypto.subtle.exportKey("raw", extractableKey);
  return `${origin}/view/${listId}?group=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}#${b64url(raw)}`;
}

/** Decrypt a group blob using the raw key from the URL fragment (viewer path). */
export async function decryptAsViewer(
  fragmentKey: string,
  blob: string
): Promise<{ gifts: Gift[]; groups: Group[] }> {
  const key = await crypto.subtle.importKey("raw", fromb64url(fragmentKey), { name: "AES-GCM" }, false, ["decrypt"]);
  const payloadStr = await dec(key, blob);
  const payload = JSON.parse(payloadStr);
  const gifts: Gift[] = JSON.parse(await dec(key, payload.ct));
  return { gifts, groups: payload.groups ?? [] };
}

// ── Color palette for auto-assigned group colors ──────────────────────────────

export const GROUP_COLORS = [
  { accent: "#c45a76", bg: "#fde8ec", border: "#f4a4b5" },
  { accent: "#5a4fbf", bg: "#eeeafd", border: "#a89fe8" },
  { accent: "#b45309", bg: "#fff3e0", border: "#ffb74d" },
  { accent: "#2d7a52", bg: "#e8f5ee", border: "#7ecba0" },
  { accent: "#185fa5", bg: "#e6f1fb", border: "#85b7eb" },
  { accent: "#993556", bg: "#fbeaf0", border: "#ed93b1" },
  { accent: "#3b6d11", bg: "#eaf3de", border: "#97c459" },
  { accent: "#854f0b", bg: "#faeeda", border: "#ef9f27" },
];

export function pickColor(index: number) {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}