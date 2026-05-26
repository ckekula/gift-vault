import { ShieldCheck } from "lucide-react";

export function SecurityBadge({ label = "end-to-end encrypted" }: { label?: string }) {
  return (
    <span className="sec-badge">
      <ShieldCheck size={10} />
      {label}
    </span>
  );
}