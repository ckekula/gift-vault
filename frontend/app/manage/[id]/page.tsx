"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Plus, Share2, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import type { Gift, Tier } from "@/lib/crypto";
import {
  masterKeyFromFragment,
  encryptGifts,
  decryptGifts,
  buildShareUrl,
  generateMasterKey,
  masterKeyToFragment,
} from "@/lib/crypto";
import { api } from "@/lib/api";
import { GiftCard } from "@/components/GiftCard";
import { GiftFormModal } from "@/components/GiftFormModal";
import { ShareLinksPanel } from "@/components/ShareLinksPanel";
import { TierBadge } from "@/components/TierBadge";
import { SecurityBadge } from "@/components/SecurityBadge";

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export default function ManagePage() {
  const { id } = useParams<{ id: string }>();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [claimStates, setClaimStates] = useState<Record<string, string>>({});
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [version, setVersion] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGift, setEditingGift] = useState<Gift | undefined>();
  const [showShare, setShowShare] = useState(false);
  const [shareLinks, setShareLinks] = useState<{ tier: string; label: string; url: string; accent: string; bg: string }[]>([]);
  const [ownerName, setOwnerName] = useState("My Wishlist");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load: get master key from fragment + fetch & decrypt list
  useEffect(() => {
    async function load() {
      try {
        const fragment = window.location.hash.slice(1);
        let mk: CryptoKey;
        if (fragment) {
          mk = await masterKeyFromFragment(fragment);
        } else {
          mk = await generateMasterKey();
          const frag = await masterKeyToFragment(mk);
          window.location.hash = frag;
        }
        setMasterKey(mk);

        const listData = await api.getList(id);
        setClaimStates(listData.claim_states || {});
        setVersion(listData.version);

        if (listData.blobs && listData.blobs["all"]) {
          const decrypted = await decryptGifts(mk, "all", listData.blobs["all"]);
          setGifts(decrypted);
        }
      } catch (err) {
        console.error("Load error", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Auto-save after gifts change
  const persist = useCallback(
    async (updatedGifts: Gift[], mk: CryptoKey, ver: number) => {
      if (!mk) return;
      setSaving(true);
      try {
        const blobs = await encryptGifts(mk, updatedGifts, ver);
        const updated = await api.updateList(id, blobs, {});
        setVersion(updated.version);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error("Save error", err);
      } finally {
        setSaving(false);
      }
    },
    [id]
  );

  const scheduleAutoSave = (updatedGifts: Gift[], mk: CryptoKey, ver: number) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist(updatedGifts, mk, ver), 600);
  };

  const addOrUpdateGift = (partial: Omit<Gift, "id"> & { id?: string }) => {
    if (!masterKey) return;
    let updated: Gift[];
    if (partial.id) {
      updated = gifts.map((g) => (g.id === partial.id ? { ...g, ...partial, id: g.id } : g));
    } else {
      const newGift: Gift = { ...partial, id: newId() } as Gift;
      updated = [...gifts, newGift];
    }
    setGifts(updated);
    scheduleAutoSave(updated, masterKey, version);
    setShowModal(false);
    setEditingGift(undefined);
  };

  const deleteGift = (giftId: string) => {
    if (!masterKey) return;
    const updated = gifts.filter((g) => g.id !== giftId);
    setGifts(updated);
    scheduleAutoSave(updated, masterKey, version);
  };

  const buildShareLinks = async () => {
    if (!masterKey) return;
    const origin = window.location.origin;
    const tiers: { tier: Tier; label: string; accent: string; bg: string }[] = [
      { tier: "family",  label: "family link",        accent: "#c45a76", bg: "#fde8ec" },
      { tier: "friends", label: "friends link",       accent: "#5a4fbf", bg: "#eeeafd" },
      { tier: "santa",   label: "secret santa link",  accent: "#b45309", bg: "#fff3e0" },
      { tier: "all",     label: "everyone link",      accent: "#2d7a52", bg: "#e8f5ee" },
    ];
    const links = await Promise.all(
      tiers.map(async (t) => ({
        tier: t.tier,
        label: t.label,
        url: await buildShareUrl(origin, id, masterKey, t.tier),
        accent: t.accent,
        bg: t.bg,
      }))
    );
    setShareLinks(links);
    setShowShare(true);
  };

  const tierGroups: Tier[] = ["all", "family", "friends", "santa"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">🎁</div>
          <p className="text-gray-500 font-medium">decrypting your vault…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--color-cream-50)" }}>
      {showModal && (
        <GiftFormModal
          initial={editingGift}
          onSave={addOrUpdateGift}
          onClose={() => { setShowModal(false); setEditingGift(undefined); }}
        />
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b border-cream-200"
        style={{ background: "rgba(253,249,244,0.95)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🎁</span>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="flex-1 font-extrabold text-lg text-gray-900 bg-transparent border-none outline-none min-w-0"
            placeholder="My Wishlist"
          />
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-gray-400">saving…</span>}
            {saved && <span className="text-xs text-sage-deep font-semibold">✓ saved</span>}
            <SecurityBadge />
            <button
              onClick={buildShareLinks}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 cursor-pointer"
              style={{ background: "linear-gradient(135deg, #a89fe8, #5a4fbf)" }}
            >
              <Share2 size={13} />
              Share
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Share panel */}
        {showShare && (
          <div className="card-cozy">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: "var(--color-sec-icon)" }} />
                <h2 className="font-bold text-gray-800">share your list</h2>
              </div>
              <button
                onClick={() => setShowShare(!showShare)}
                className="text-gray-400 hover:text-gray-600 transition-all"
              >
                {showShare ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            <ShareLinksPanel links={shareLinks} />
          </div>
        )}

        {/* Add gift button */}
        <button
          onClick={() => { setEditingGift(undefined); setShowModal(true); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-rose-mid text-rose-deep font-bold text-sm hover:bg-rose-soft transition-all cursor-pointer"
        >
          <Plus size={16} />
          add a gift to your list
        </button>

        {/* Gifts by tier */}
        {gifts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">✨</div>
            <p className="font-medium">your vault is empty</p>
            <p className="text-sm mt-1">add your first gift above</p>
          </div>
        ) : (
          tierGroups.map((tier) => {
            const tierGifts = gifts.filter((g) => g.tier === tier);
            if (tierGifts.length === 0) return null;
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-3">
                  <TierBadge tier={tier} />
                  <span className="text-xs text-gray-400">{tierGifts.length} gift{tierGifts.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {tierGifts.map((gift) => (
                    <GiftCard
                      key={gift.id}
                      gift={gift}
                      claimed={claimStates[gift.id] === "claimed"}
                      isOwner
                      onEdit={(g) => { setEditingGift(g); setShowModal(true); }}
                      onDelete={deleteGift}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Footer security note */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3 text-xs"
          style={{ background: "var(--color-sec-bg)", border: "1px solid var(--color-sec-border)", color: "var(--color-sec-text)" }}
        >
          <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-sec-icon)" }} />
          <span>
            <strong>Your vault ID:</strong> <code className="font-mono">{id}</code> — 
            keep the full URL (including the <code>#key</code>) bookmarked. 
            Losing it means losing access. The server cannot recover your key.
          </span>
        </div>
      </main>
    </div>
  );
}