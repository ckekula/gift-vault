"use client";
import { useState } from "react";
import { Copy, Check, ShieldCheck } from "lucide-react";

interface ShareLink {
  tier: string;
  label: string;
  url: string;
  accent: string;
  bg: string;
}

interface Props {
  links: ShareLink[];
}

export function ShareLinksPanel({ links }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (tier: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(tier);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Security explanation — distinct blue color */}
      <div
        className="flex items-start gap-2 rounded-xl p-3 text-xs"
        style={{ background: "var(--color-sec-bg)", border: "1px solid var(--color-sec-border)", color: "var(--color-sec-text)" }}
      >
        <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--color-sec-icon)" }} />
        <span>
          <strong>The link IS the key.</strong> The part after # never reaches the server —
          it stays in the browser. Sharing this link = granting access. Treat it like a password.
        </span>
      </div>

      {links.map((link) => (
        <div
          key={link.tier}
          className="bg-white border border-[#ede0cc] rounded-2xl p-3 flex items-center gap-3"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
            style={{ background: link.bg, color: link.accent, border: `1.5px solid ${link.accent}` }}
          >
            {link.label[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-700">{link.label}</p>
            <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">{link.url}</p>
          </div>
          <button
            onClick={() => copy(link.tier, link.url)}
            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
            style={
              copied === link.tier
                ? { background: "#e8f5ee", color: "#2d7a52", border: "1px solid #7ecba0" }
                : { background: link.bg, color: link.accent, border: `1px solid ${link.accent}` }
            }
          >
            {copied === link.tier ? <Check size={12} /> : <Copy size={12} />}
            {copied === link.tier ? "copied!" : "copy"}
          </button>
        </div>
      ))}
    </div>
  );
}