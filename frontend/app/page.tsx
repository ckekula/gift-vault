"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { generateMasterKey, masterKeyToFragment } from "@/lib/crypto";
import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const createList = async () => {
    setLoading(true);
    try {
      const masterKey = await generateMasterKey();
      const fragment = await masterKeyToFragment(masterKey);
      // Create an empty list on the server
      const list = await api.createList({}, {});
      // Navigate to owner page with list ID and master key fragment
      router.push(`/manage/${list.id}#${fragment}`);
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Hero */}
      <div className="text-center max-w-lg mb-6">
        <div className="text-6xl">🎁</div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3 text-balance">
          Your wishlist,<br />
          <span style={{ color: "#c45a76" }}>Privately shared</span>
        </h1>
        <p className="text-gray-500 text-lg leading-relaxed">
          GiftVault encrypts your wishlist in the browser before it ever leaves your device.
          Only the people you share a link with can read it — not even us.
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={createList}
        disabled={loading}
        className="relative px-10 py-4 rounded-2xl text-white font-extrabold text-lg transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
        style={{ background: "#c45a76" }}
      >
        {loading ? "Creating…" : "Create my Wishlist"}
      </button>

      <p className="text-sm text-gray-600 mt-4 max-w-xs text-center">
        No signup required!
      </p>

      {/* How it works */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full">
        {[
          { emoji: "🔑", title: "The link is the key", desc: "All your wishlist information lives inside the URL. Keep it safe!" },
          { emoji: "👥", title: "Pick who sees what", desc: "Family, friends, or secret santa; each group gets their own link showing only their gifts." },
          { emoji: "✏️", title: "Edit any time", desc: "Update your list freely. Existing links keep working. No need to re-share." },
        ].map((step) => (
          <div key={step.title} className="card-cozy text-center">
            <div className="text-3xl mb-3">{step.emoji}</div>
            <h3 className="font-bold text-gray-800 mb-1">{step.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Security notice */}
      <div
        className="mt-8 max-w-md w-full rounded-2xl p-4 flex items-start gap-3 text-sm"
        style={{ background: "var(--color-sec-bg)", border: "1px solid var(--color-sec-border)", color: "var(--color-sec-text)" }}
      >
        <Gift size={16} className="shrink-0 mt-0.5" style={{ color: "var(--color-sec-icon)" }} />
        <div>
          <strong>Zero-knowledge:</strong> We store encrypted blobs only. Even if our servers were breached,
          your wishlist remains private.
        </div>
      </div>
    </main>
  );
}