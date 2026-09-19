// 킥오프 시각을 방문자 로컬 시간으로 — SSR 은 UTC 로 그리고 마운트 후 로컬로 바꾼다 (hydration 불일치 없음).
"use client";
import { useClientValue } from "@/lib/use-client-value";

function fmtUtc(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
function fmtLocal(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function startsIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Started";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `In ${Math.floor(h / 24)} days`;
  return h > 0 ? `In ${h}h ${m}m` : `In ${m}m`;
}

export default function LocalTime({ iso, mode = "time", className }: { iso: string; mode?: "time" | "startsIn"; className?: string }) {
  const text = useClientValue(() => (mode === "startsIn" ? startsIn(iso) : fmtLocal(iso)), mode === "startsIn" ? "" : fmtUtc(iso));
  return <time dateTime={iso} className={className}>{text}</time>;
}
