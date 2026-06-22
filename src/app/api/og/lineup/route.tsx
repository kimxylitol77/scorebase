// GET /api/og/lineup?d=<base64url> — 라인업 전술판 공유 카드(1080×1350, 인스타 4:5).
// 좌표 기반 피치(드래그·자유배치 그대로) + 단일/맞대결. 한글은 Google Fonts 동적 subset 주입.

import { ImageResponse } from "next/og";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { decodeBoard, pidsFromBoard, type Side } from "@/lib/lineup/lineup-state";
import { KIT_BY_KEY, SIDE_COLORS } from "@/lib/lineup/formations";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
};

// satori는 시스템 폰트가 없다 → 카드에 쓰는 글자만 Google Fonts에서 subset해 버퍼로 받는다.
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(api)).text();
    const url = css.match(/src:\s*url\(([^)]+?)\)\s*format/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function ovrColor(o: number): { fg: string; bg: string; bd: string } {
  if (o >= 90) return { fg: "#fda4af", bg: "rgba(190,52,85,0.24)", bd: "rgba(190,52,85,0.9)" };
  if (o >= 80) return { fg: "#cbd5e1", bg: "rgba(100,116,139,0.22)", bd: "rgba(148,163,184,0.85)" };
  return { fg: "#e5e7eb", bg: "rgba(82,82,91,0.22)", bd: "rgba(113,113,122,0.75)" };
}

interface CardSlot {
  x: number;
  y: number;
  name: string | null;
  ovr: number | null;
  pos: string;
  side: "home" | "away" | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("d");
  const board = code ? decodeBoard(code) : null;

  if (!board) {
    return new ImageResponse(<Fallback />, { width: 1080, height: 1350, headers: { "Cache-Control": "public, max-age=60" } });
  }

  const players = getDreamPlayers(pidsFromBoard(board));
  const byId: Record<string, (typeof players)[number]> = {};
  for (const p of players) byId[p.id] = p;

  const versus = board.mode === "versus";
  const toSlots = (side: Side, sideKey: "home" | "away"): CardSlot[] =>
    side.players
      .filter((p) => p.pid || p.name)
      .map((pl) => {
        if (pl.pid) {
          const p = byId[pl.pid];
          return { x: pl.x, y: pl.y, name: p?.name ?? null, ovr: p?.ovr ?? null, pos: p?.pos ?? pl.pos, side: versus ? sideKey : null };
        }
        return { x: pl.x, y: pl.y, name: pl.name, ovr: null, pos: pl.pos, side: versus ? sideKey : null };
      });

  const slots: CardSlot[] = [...toSlots(board.home, "home"), ...(board.away ? toSlots(board.away, "away") : [])];

  const title = board.title?.trim() || "나의 라인업";
  const subtitle = versus
    ? [board.away?.club, board.home.club].filter(Boolean).join(" vs ") || board.subtitle?.trim() || ""
    : board.subtitle?.trim() || "";
  const kit = KIT_BY_KEY[board.kit] ?? KIT_BY_KEY.grass;

  const fontText =
    title +
    subtitle +
    "Scorebase scorebase.kr vs HOMEAWAY GKDFMFW0123456789 abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    slots.map((s) => s.name ?? "").join("");
  const font = await loadFont(fontText);

  return new ImageResponse(<Card title={title} subtitle={subtitle} versus={versus} kit={kit} slots={slots} />, {
    width: 1080,
    height: 1350,
    headers: CACHE_HEADERS,
    fonts: font ? [{ name: "Noto Sans KR", data: font, weight: 700, style: "normal" }] : undefined,
  });
}

function Card({
  title,
  subtitle,
  versus,
  kit,
  slots,
}: {
  title: string;
  subtitle: string;
  versus: boolean;
  kit: { from: string; to: string };
  slots: CardSlot[];
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "52px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        color: "white",
        fontFamily: "Noto Sans KR, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          <BarMark />
          <span>Scorebase</span>
        </div>
        {versus ? (
          <div style={{ display: "flex", fontSize: "22px", fontWeight: 700, padding: "6px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.14)" }}>VS</div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: "22px" }}>
        <span style={{ fontSize: "56px", fontWeight: 700, letterSpacing: "-0.03em" }}>{title}</span>
        {subtitle ? <span style={{ display: "flex", fontSize: "24px", opacity: 0.7, marginTop: "4px" }}>{subtitle}</span> : null}
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          marginTop: "20px",
          borderRadius: "24px",
          background: `linear-gradient(to bottom, ${kit.from} 0%, ${kit.to} 100%)`,
          border: "2px solid rgba(255,255,255,0.18)",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: "20px", right: "20px", top: "20px", bottom: "20px", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "6px" }} />
        <div style={{ position: "absolute", left: "20px", right: "20px", top: "50%", borderTop: `2px solid rgba(255,255,255,${versus ? 0.3 : 0.12})` }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "160px", height: "160px", transform: "translate(-50%, -50%)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "999px" }} />
        {slots.map((s, i) => (
          <CardPlayer key={i} s={s} />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", fontSize: "20px", opacity: 0.7, letterSpacing: "0.05em", marginTop: "14px" }}>
        scorebase.kr
      </div>
    </div>
  );
}

function CardPlayer({ s }: { s: CardSlot }) {
  const sideC = s.side ? SIDE_COLORS[s.side] : null;
  const fg = sideC ? (s.side === "home" ? "#fda4af" : "#93c5fd") : s.ovr != null ? ovrColor(s.ovr).fg : "#e5e7eb";
  const bg = sideC ? sideC.soft : s.ovr != null ? ovrColor(s.ovr).bg : "rgba(255,255,255,0.12)";
  const bd = sideC ? sideC.ring : s.ovr != null ? ovrColor(s.ovr).bd : "rgba(255,255,255,0.45)";
  return (
    <div
      style={{
        position: "absolute",
        left: `${s.x}%`,
        top: `${s.y}%`,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "150px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "84px",
          height: "84px",
          borderRadius: "20px",
          background: bg,
          border: `3px solid ${bd}`,
        }}
      >
        <span style={{ display: "flex", fontSize: s.ovr != null ? "38px" : "24px", fontWeight: 700, color: fg, lineHeight: 1 }}>{s.ovr != null ? s.ovr : s.pos}</span>
      </div>
      {s.name ? (
        <div style={{ display: "flex", marginTop: "9px", fontSize: "22px", fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.9)", textAlign: "center" }}>{s.name}</div>
      ) : null}
      <div style={{ display: "flex", marginTop: "3px", fontSize: "15px", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}>{s.pos}</div>
    </div>
  );
}

function BarMark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "36px" }}>
      <div style={{ width: "7px", height: "14px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "22px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "30px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "36px", background: "white", borderRadius: "2px" }} />
    </div>
  );
}

function Fallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f5132 0%, #0a3d27 100%)",
        color: "white",
        fontSize: "56px",
        fontWeight: 900,
      }}
    >
      Scorebase Lineup
    </div>
  );
}
