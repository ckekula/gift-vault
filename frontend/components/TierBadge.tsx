"use client";

interface Props {
  name: string;
  color: string; // hex accent
  bg?: string;
  border?: string;
}

export function TierBadge({ name, color, bg, border }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{
        background: bg ?? color + "22",
        color,
        border: `1px solid ${border ?? color + "66"}`,
      }}
    >
      {name}
    </span>
  );
}