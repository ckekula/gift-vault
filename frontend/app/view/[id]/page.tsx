"use client";
import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ShieldCheck, RefreshCw } from "lucide-react";
import type { Gift, Group } from "@/lib/crypto";
import { decryptAsViewer } from "@/lib/crypto";
import { api } from "@/lib/api";
import { GiftCard } from "@/components/GiftCard";
import { SecurityBadge } from "@/components/SecurityBadge";
import { TierBadge } from "@/components/TierBadge";
import Link from "next/link";
 
export default function ViewPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const groupId   = searchParams.get("group") ?? "everyone";
  const groupName = searchParams.get("name")  ?? groupId;
 
  const [gifts, setGifts]             = useState<Gift[]>([]);
  const [groups, setGroups]           = useState<Group[]>([]);
  const [claimStates, setClaimStates] = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]     = useState("");

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const fragment = window.location.hash.slice(1);
      if (!fragment) throw new Error("no key in URL");
      const listData = await api.getList(id);
      const blob = listData.blobs?.[groupId];
      if (!blob) throw new Error("no data for this access level");
      const { gifts: g, groups: gr } = await decryptAsViewer(fragment, blob);
      setGifts(g);
      setGroups(gr);
      setClaimStates(listData.claim_states || {});
      setUpdatedAt(listData.updated_at);
    } catch (err) {
      console.error(err);
      setError("couldn't decrypt this list — is the link correct?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, [id, groupId]);

  const handleClaim = async (giftId: string, claim: boolean) => {
    try {
      const updated = await api.claimGift(id, giftId, claim);
      setClaimStates(updated.claim_states || {});
    } catch (err) {
      console.error(err);
    }
  };

  // Find the color for the current group from the decrypted group list
  const currentGroup = groups.find((g) => g.id === groupId);
  const groupColor = currentGroup?.color ?? "#2d7a52";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">🔓</div>
          <p className="text-gray-500 font-medium">decrypting…</p>
          <p className="text-xs text-gray-400 mt-1">key never left your browser</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card-cozy max-w-md text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-bold text-gray-800 mb-2">couldn&apos;t open this vault</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <p className="text-xs text-gray-400">
            Make sure you have the complete link, including everything after the #.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--color-cream-50)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b border-cream-200"
        style={{ background: "rgba(253,249,244,0.95)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🎁</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-extrabold text-gray-900">GiftVault</h1>
              <TierBadge name={groupName} color={groupColor} />
            </div>
            {updatedAt && (
              <p className="text-[11px] text-gray-400">
                updated {new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SecurityBadge label="decrypted locally" />
            <button
              onClick={loadList}
              className="p-1.5 rounded-xl hover:bg-cream-200 text-gray-400 transition-all"
              title="refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Security notice */}
        <div
          className="rounded-2xl p-3 flex items-start gap-2 text-xs"
          style={{ background: "var(--color-sec-bg)", border: "1px solid var(--color-sec-border)", color: "var(--color-sec-text)" }}
        >
          <ShieldCheck size={13} className="shrink-0 mt-0.5" style={{ color: "var(--color-sec-icon)" }} />
          <span>
            This list was decrypted entirely in your browser using the key in the URL.
            The server only provided encrypted data it cannot read.
          </span>
        </div>

        {/* Gifts */}
        {gifts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">No gifts to show yet</p>
            <p className="text-sm mt-1">Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {gifts.map((gift) => (
              <GiftCard
                key={gift.id}
                gift={gift}
                groups={groups}
                claimed={claimStates[gift.id] === "claimed"}
                isOwner={false}
                onClaim={handleClaim}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pt-4">
          Made with GiftVault 🎁{" "}
          <Link href="/" className="text-rose-deep font-semibold hover:underline">
            Make your own!
          </Link>
        </p>
      </main>
    </div>
  );
}