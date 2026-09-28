// 감독 카드 공용 부품 — 테마 팔레트·이미지 칸·결과 색. route.tsx 와 charts.tsx 가 같이 쓴다.
export interface Theme { bg: string; fg: string; sub: string; panel: string; line: string; accent: string; track: string }
export const CLUB_TINT: Record<string, string> = { EPL: "#3b0764", LALIGA: "#7c2d12", BUNDESLIGA: "#713f12", SERIE_A: "#0c4a6e", LIGUE_1: "#881337" };
export function themeOf(name: string, league: string): Theme {
  if (name === "light") return { bg: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)", fg: "#0f172a", sub: "#64748b", panel: "#ffffff", line: "#e2e8f0", accent: "#2563eb", track: "#e2e8f0" };
  if (name === "dark") return { bg: "linear-gradient(180deg, #0b0f19 0%, #020617 100%)", fg: "#f8fafc", sub: "#94a3b8", panel: "rgba(255,255,255,0.05)", line: "rgba(255,255,255,0.10)", accent: "#34d399", track: "rgba(255,255,255,0.10)" };
  return { bg: `linear-gradient(160deg, ${CLUB_TINT[league] ?? "#1e293b"} 0%, #0f172a 55%, #020617 100%)`, fg: "#ffffff", sub: "rgba(255,255,255,0.68)", panel: "rgba(255,255,255,0.08)", line: "rgba(255,255,255,0.14)", accent: "#fbbf24", track: "rgba(255,255,255,0.14)" };
}
export const RESULT_COLOR = { W: "#22c55e", D: "#94a3b8", L: "#ef4444" } as const;
export const RESULT_KO = { W: "승", D: "무", L: "패" } as const;
export const signed = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;

export function Img({ src, size, round, ring }: { src: string | null; size: number; round?: boolean; ring?: string }) {
  return (
    <div style={{ display: "flex", width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: round ? "999px" : "0", overflow: "hidden", border: ring ? `5px solid ${ring}` : "none", background: round ? "rgba(148,163,184,0.18)" : "transparent" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: round ? "cover" : "contain" }} alt="" />
      ) : null}
    </div>
  );
}

