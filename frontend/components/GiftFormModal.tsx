"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Gift, Tier } from "@/lib/crypto";

const EMOJIS = ["🎁","🧥","👟","📚","🎮","🎨","🍳","🌿","💻","📷","🎸","🕯️","🧴","🛋️","✈️","🍫"];
const TIERS: { value: Tier; label: string }[] = [
  { value: "family",  label: "family" },
  { value: "friends", label: "friends" },
  { value: "santa",   label: "secret santa" },
  { value: "all",     label: "everyone" },
];

interface Props {
  initial?: Partial<Gift>;
  onSave: (gift: Omit<Gift, "id"> & { id?: string }) => void;
  onClose: () => void;
}

export function GiftFormModal({ initial, onSave, onClose }: Props) {
  const [name,  setName]  = useState(initial?.name  ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [url,   setUrl]   = useState(initial?.url   ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tier,  setTier]  = useState<Tier>(initial?.tier  ?? "all");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🎁");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ id: initial?.id, name: name.trim(), price, url, notes, tier, emoji });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(60,40,30,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-cream-200">
          <h2 className="text-lg font-bold text-gray-800">
            {initial?.id ? "Edit Gift" : "Add a Gift"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Pick an emoji</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`text-xl p-1.5 rounded-xl transition-all ${emoji === e ? "bg-rose-soft ring-2 ring-rose-mid scale-110" : "hover:bg-gray-100"}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Gift name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Patagonia fleece jacket"
              className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-mid focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Price</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="~$120"
                className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-mid focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Visible to</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as Tier)}
                className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-mid focus:border-transparent"
              >
                {TIERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Link</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-mid focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="size, color, any details..."
              className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-mid focus:border-transparent"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-cream-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-all"
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 cursor-pointer"
            style={{ background: "linear-gradient(135deg, #f4a4b5, #c45a76)" }}
          >
            {initial?.id ? "Save Changes" : "Add Gift"}
          </button>
        </div>
      </div>
    </div>
  );
}