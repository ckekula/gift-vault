"use client";
import { ExternalLink, Trash2, Pencil } from "lucide-react";
import type { Gift, Group } from "@/lib/crypto";
import { TierBadge } from "./TierBadge";

interface Props {
  gift: Gift;
  groups: Group[];
  claimed?: boolean;
  isOwner?: boolean;
  onClaim?: (id: string, claim: boolean) => void;
  onEdit?: (gift: Gift) => void;
  onDelete?: (id: string) => void;
}

const EVERYONE_GROUP: Group = { id: "everyone", name: "everyone", color: "#2d7a52" };

export function GiftCard({ gift, groups, claimed, isOwner, onClaim, onEdit, onDelete }: Props) {
  const group =
    gift.tier === "everyone"
      ? EVERYONE_GROUP
      : (groups.find((g) => g.id === gift.tier) ?? EVERYONE_GROUP);

  return (
    <div
      className={`bg-white rounded-2xl border border-cream-200 p-4 flex items-start gap-3 transition-all hover:border-[#d4b896] ${claimed ? "opacity-60" : ""}`}
      style={{ borderLeft: `4px solid ${group.color}` }}
    >
      <div className="text-3xl shrink-0 mt-0.5 select-none">{gift.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-[15px] text-gray-800 leading-snug">{gift.name}</p>
            {gift.price && <p className="text-sm text-gray-500 mt-0.5">{gift.price}</p>}
          </div>
        </div>
        {gift.notes && <p className="text-sm text-gray-500 mt-1 italic">&apos;{gift.notes}&apos;</p>}
        <div className="flex items-center gap-2 mt-3">
          {gift.url && (
            <a
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <ExternalLink size={11} /> view item
            </a>
          )}
          {!isOwner && onClaim && (
            <button
              onClick={() => onClaim(gift.id, !claimed)}
              className="ml-auto text-xs font-semibold px-3 py-1 rounded-full transition-all cursor-pointer"
              style={
                claimed
                  ? { background: "#e8f5ee", color: "#2d7a52", border: "1px solid #7ecba0" }
                  : { background: "#fde8ec", color: "#c45a76", border: "1px solid #f4a4b5" }
              }
            >
              {claimed ? "✓ claimed" : "claim it"}
            </button>
          )}
          {isOwner && (
            <div className="ml-auto flex gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(gift)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                >
                  <Pencil size={13} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(gift.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}