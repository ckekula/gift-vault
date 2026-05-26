import type { Tier } from "@/lib/crypto";

const TIERS: Record<Tier, { label: string; bg: string; text: string; border: string }> = {
  family:  { label: "family",       bg: "#fde8ec", text: "#c45a76", border: "#f4a4b5" },
  friends: { label: "friends",      bg: "#eeeafd", text: "#5a4fbf", border: "#a89fe8" },
  santa:   { label: "secret santa", bg: "#fff3e0", text: "#b45309", border: "#ffb74d" },
  all:     { label: "everyone",     bg: "#e8f5ee", text: "#2d7a52", border: "#7ecba0" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIERS[tier];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
    >
      {t.label}
    </span>
  );
}

export { TIERS };