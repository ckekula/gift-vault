"use client";
import { useState } from "react";
import { Copy, Check, ShieldCheck } from "lucide-react";

export interface ShareLink {
  groupId: string;
  label: string;
  url: string;
  accent: string;
  bg: string;
  border: string;
}

export function ShareLinksPanel({ links }: { links: ShareLink[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (groupId: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(groupId);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div
        className="flex items-start gap-2 rounded-xl p-3 text-xs"
        style={{ background: "var(--color-sec-bg)", border: "1px solid var(--color-sec-border)", color: "var(--color-sec-text)" }}
      >
        <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-sec-icon)" }} />
        <span>
          <strong>The link IS the key.</strong>
          <span> </span>Don&apos;t share it with anyone you don&apos;t trust. Treat it like a password.
        </span>
      </div>

      {links.map((link) => (
        <div
          key={link.groupId}
          className="bg-white border border-cream-200 rounded-2xl p-3 flex items-center gap-3"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
            style={{ background: link.bg, color: link.accent, border: `1.5px solid ${link.border}` }}
          >
            {link.label[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-700">{link.label}</p>
            <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">{link.url}</p>
          </div>
          <button
            onClick={() => copy(link.groupId, link.url)}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            style={
              copied === link.groupId
                ? { background: "#e8f5ee", color: "#2d7a52", border: "1px solid #7ecba0" }
                : { background: link.bg, color: link.accent, border: `1px solid ${link.border}` }
            }
          >
            {copied === link.groupId ? <Check size={12} /> : <Copy size={12} />}
            {copied === link.groupId ? "copied!" : "copy"}
          </button>
        </div>
      ))}
    </div>
  );
}