"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Plus, Share2, ShieldCheck, X, Pencil, Check } from "lucide-react";
import type { Gift, Group } from "@/lib/crypto";
import {
  masterKeyFromFragment, encryptVault, decryptVaultOwner,
  buildShareUrl, generateMasterKey, masterKeyToFragment, pickColor
} from "@/lib/crypto";
import { api } from "@/lib/api";
import { GiftCard } from "@/components/GiftCard";
import { GiftFormModal } from "@/components/GiftFormModal";
import { ShareLinksPanel, type ShareLink } from "@/components/ShareLinksPanel";
import { TierBadge } from "@/components/TierBadge";
import { SecurityBadge } from "@/components/SecurityBadge";
 
function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

const EVERYONE: Group = { id: "everyone", name: "everyone", color: "#2d7a52" };

export default function ManagePage() {
  const { id } = useParams<{ id: string }>();
  const [gifts, setGifts]         = useState<Gift[]>([]);
  const [groups, setGroups]       = useState<Group[]>([]);
  const [claimStates, setClaimStates] = useState<Record<string, string>>({});
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [version, setVersion]     = useState(1);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [editingGift, setEditingGift]     = useState<Gift | undefined>();
  const [showShare, setShowShare] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  // group management
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
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
          window.location.hash = await masterKeyToFragment(mk);
        }
        setMasterKey(mk);
        const listData = await api.getList(id);
        setClaimStates(listData.claim_states || {});
        setVersion(listData.version);
        if (listData.blobs?.["everyone"]) {
          const { gifts: g } = await decryptVaultOwner(mk, listData.blobs["everyone"]);
          setGifts(g);
        }
        // groups are stored in key_handles as encrypted JSON
        if (listData.key_handles?.["groups"]) {
          try {
            const stored: Group[] = JSON.parse(atob(listData.key_handles["groups"]));
            setGroups(stored);
          } catch { /* first load, no groups yet */ }
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
    async (updatedGifts: Gift[], updatedGroups: Group[], mk: CryptoKey, ver: number) => {
      setSaving(true);
      try {
        const blobs = await encryptVault(mk, { groups: updatedGroups, gifts: updatedGifts }, ver);
        // store groups unencrypted in key_handles (group names/colors are not sensitive —
        // only the gift contents are). This lets the owner reload groups without decrypting.
        const keyHandles = { groups: btoa(JSON.stringify(updatedGroups)) };
        const updated = await api.updateList(id, blobs, keyHandles);
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

 
  const schedule = (g: Gift[], gr: Group[], mk: CryptoKey, ver: number) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist(g, gr, mk, ver), 600);
  };
 
  const addOrUpdateGift = (partial: Omit<Gift, "id"> & { id?: string }) => {
    if (!masterKey) return;
    let updated: Gift[];
    if (partial.id) {
      updated = gifts.map((g) => g.id === partial.id ? { ...g, ...partial, id: g.id } : g);
    } else {
      updated = [...gifts, { ...partial, id: newId() } as Gift];
    }
    setGifts(updated);
    schedule(updated, groups, masterKey, version);
    setShowGiftModal(false);
    setEditingGift(undefined);
  };
 
  const deleteGift = (giftId: string) => {
    if (!masterKey) return;
    const updated = gifts.filter((g) => g.id !== giftId);
    setGifts(updated);
    schedule(updated, groups, masterKey, version);
  };
 
  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name || !masterKey) return;
    const color = pickColor(groups.length).accent;
    const newGroup: Group = { id: newId(), name, color };
    const updated = [...groups, newGroup];
    setGroups(updated);
    setNewGroupName("");
    schedule(gifts, updated, masterKey, version);
  };
 
  const deleteGroup = (groupId: string) => {
    if (!masterKey) return;
    const updatedGroups = groups.filter((g) => g.id !== groupId);
    // Re-assign orphaned gifts to everyone
    const updatedGifts = gifts.map((g) => g.tier === groupId ? { ...g, tier: "everyone" } : g);
    setGroups(updatedGroups);
    setGifts(updatedGifts);
    schedule(updatedGifts, updatedGroups, masterKey, version);
  };
 
  const renameGroup = (groupId: string, newName: string) => {
    if (!masterKey || !newName.trim()) return;
    const updated = groups.map((g) => g.id === groupId ? { ...g, name: newName.trim() } : g);
    setGroups(updated);
    setEditingGroupId(null);
    schedule(gifts, updated, masterKey, version);
  };
 
  const buildShareLinksForGroups = async () => {
    if (!masterKey) return;
    const origin = window.location.origin;
    const links: ShareLink[] = await Promise.all(
      groups.map(async (group, i) => {
        const c = pickColor(i);
        return {
          groupId: group.id,
          label: group.name,
          url: await buildShareUrl(origin, id, masterKey, group),
          accent: group.color,
          bg: c.bg,
          border: c.border,
        };
      })
    );
    setShareLinks(links);
    setShowShare(true);
  };
 
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
 
  const allGroupsWithEveryone = [EVERYONE, ...groups];

  return (
    <div className="min-h-screen" style={{ background: "var(--color-cream-50)" }}>
      {showGiftModal && (
        <GiftFormModal
          initial={editingGift}
          groups={groups}
          onSave={addOrUpdateGift}
          onClose={() => { setShowGiftModal(false); setEditingGift(undefined); }}
        />
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b border-cream-200"
        style={{ background: "rgba(253,249,244,0.95)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🎁</span>
          <span className="flex-1 font-extrabold text-lg text-gray-900">My Wishlist</span>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-gray-400">saving…</span>}
            {saved && <span className="text-xs text-sage-deep font-semibold">✓ saved</span>}
            <SecurityBadge />
            <button
              onClick={buildShareLinksForGroups}
              disabled={groups.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              style={{ background: "#5a4fbf" }}
              title={groups.length === 0 ? "create a group first" : "share your list"}
            >
              <Share2 size={13} />
              Share
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Share panel */}
        {showShare && shareLinks.length > 0 && (
          <div className="card-cozy">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: "var(--color-sec-icon)" }} />
                <h2 className="font-bold text-gray-800">Share your list</h2>
              </div>
              <button
                onClick={() => setShowShare(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={15} />
              </button>
            </div>
            <ShareLinksPanel links={shareLinks} />
          </div>
        )}

        {/* ── Groups section ── */}
        <div className="card-cozy">
          <h2 className="font-bold text-gray-800 mb-1">Create Access Groups</h2>
          <p className="text-xs text-gray-600 mb-4">
            Each group gets its own share link — only seeing gifts you assign to them.
          </p>
 
          {/* Everyone pill (non-deletable) */}
          <div className="flex items-center gap-2 mb-2">
            <TierBadge name="everyone" color={EVERYONE.color} bg="#e8f5ee" border="#7ecba0" />
          </div>
 
          {/* Custom groups */}
          <div className="space-y-2 mb-3">
            {groups.map((group, i) => {
              const c = pickColor(i);
              return (
                <div key={group.id} className="flex items-center gap-2">
                  {editingGroupId === group.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameGroup(group.id, editingGroupName);
                          if (e.key === "Escape") setEditingGroupId(null);
                        }}
                        className="flex-1 border border-cream-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-mid"
                      />
                      <button
                        onClick={() => renameGroup(group.id, editingGroupName)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-sage-deep"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingGroupId(null)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <TierBadge name={group.name} color={group.color} bg={c.bg} border={c.border} />
                      <span className="text-xs text-gray-400">
                        {gifts.filter((g) => g.tier === group.id).length} gift
                        {gifts.filter((g) => g.tier === group.id).length !== 1 ? "s" : ""}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button
                          onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteGroup(group.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
 
          {/* Add group input */}
          <div className="flex gap-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
              placeholder="new group name (e.g. friends)"
              className="flex-1 border border-cream-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-mid focus:border-transparent"
            />
            <button
              onClick={addGroup}
              disabled={!newGroupName.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              style={{ background: "#c45a76" }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
 
        {/* ── Gifts section ── */}
        {/* Add gift button */}
        <button
          onClick={() => { setEditingGift(undefined); setShowGiftModal(true); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-rose-mid text-rose-deep font-bold text-sm hover:bg-rose-soft transition-all cursor-pointer"
        >
          <Plus size={16} />
          Add a gift to your list
        </button>

        {/* Gifts by tier */}
        {gifts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">✨</div>
            <p className="font-medium">your vault is empty</p>
            <p className="text-sm mt-1">add your first gift above</p>
          </div>
        ) : (
          allGroupsWithEveryone.map((group) => {
            const groupGifts = gifts.filter((g) => g.tier === group.id);
            if (groupGifts.length === 0) return null;
            const c = group.id === "everyone" ? { bg: "#e8f5ee", border: "#7ecba0" } : pickColor(groups.findIndex((g) => g.id === group.id));
            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-3">
                  <TierBadge name={group.name} color={group.color} bg={c.bg} border={c.border} />
                  <span className="text-xs text-gray-400">{groupGifts.length} gift{groupGifts.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {groupGifts.map((gift) => (
                    <GiftCard
                      key={gift.id}
                      gift={gift}
                      groups={groups}
                      claimed={claimStates[gift.id] === "claimed"}
                      isOwner
                      onEdit={(g) => { setEditingGift(g); setShowGiftModal(true); }}
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