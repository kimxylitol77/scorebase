// GET /api/og/lineup?d=<base64url> — 라인업 전술판 공유 카드(1080×1350, 인스타 4:5).
// 좌표 기반 피치(드래그·자유배치 그대로) + 단일/맞대결. 한글은 Google Fonts 동적 subset 주입.

import { ImageResponse } from "next/og";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { decodeBoard, pidsFromBoard, type Side } from "@/lib/lineup/lineup-state";
import { KIT_BY_KEY, SIDE_COLORS, toDisplayXY } from "@/lib/lineup/formations";
import { readFileSync } from "fs";
import path from "path";

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

// 등번호 — team-squads 공식 스쿼드(playerId→number). 실축 카드라 OVR(게임 값) 대신 등번호 표시.
const NUM_BY_ID: Map<string, number> = (() => {
  try {
    const sq: Record<string, { squad: Array<{ id: string; number: number | null }> }> = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
    );
    const m = new Map<string, number>();
    for (const v of Object.values(sq)) for (const p of v.squad) if (p.number != null) m.set(p.id, p.number);
    return m;
  } catch {
    return new Map<string, number>();
  }
})();

interface CardSlot {
  x: number;
  y: number;
  name: string | null;
  number: number | null;
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
  const landscape = board.orientation === "landscape";
  const nameMode = board.displayMode === "name";
  const toSlots = (side: Side, sideKey: "home" | "away"): CardSlot[] =>
    side.players
      .filter((p) => p.pid || p.name)
      .map((pl) => {
        const d = toDisplayXY(pl.x, pl.y, landscape);
        if (pl.pid) {
          const p = byId[pl.pid];
          return { x: d.x, y: d.y, name: p?.name ?? null, number: NUM_BY_ID.get(pl.pid) ?? null, pos: p?.pos ?? pl.pos, side: versus ? sideKey : null };
        }
        return { x: d.x, y: d.y, name: pl.name, number: null, pos: pl.pos, side: versus ? sideKey : null };
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

  return new ImageResponse(<Card title={title} subtitle={subtitle} versus={versus} landscape={landscape} nameMode={nameMode} kit={kit} slots={slots} />, {
    width: landscape ? 1350 : 1080,
    height: landscape ? 1080 : 1350,
    headers: CACHE_HEADERS,
    fonts: font ? [{ name: "Noto Sans KR", data: font, weight: 700, style: "normal" }] : undefined,
  });
}

function Card({
  title,
  subtitle,
  versus,
  landscape,
  nameMode,
  kit,
  slots,
}: {
  title: string;
  subtitle: string;
  versus: boolean;
  landscape: boolean;
  nameMode: boolean;
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
        {landscape ? (
          <div style={{ position: "absolute", top: "20px", bottom: "20px", left: "50%", borderLeft: `2px solid rgba(255,255,255,${versus ? 0.3 : 0.12})` }} />
        ) : (
          <div style={{ position: "absolute", left: "20px", right: "20px", top: "50%", borderTop: `2px solid rgba(255,255,255,${versus ? 0.3 : 0.12})` }} />
        )}
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "160px", height: "160px", transform: "translate(-50%, -50%)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "999px" }} />
        {slots.map((s, i) => (
          <CardPlayer key={i} s={s} nameMode={nameMode} />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", fontSize: "20px", opacity: 0.7, letterSpacing: "0.05em", marginTop: "14px" }}>
        scorebase.kr
      </div>
    </div>
  );
}

function CardPlayer({ s, nameMode }: { s: CardSlot; nameMode: boolean }) {
  const sideC = s.side ? SIDE_COLORS[s.side] : null;
  const fg = sideC ? (s.side === "home" ? "#fda4af" : "#93c5fd") : "#fda4af";
  const bg = sideC ? sideC.soft : "rgba(190,52,85,0.24)";
  const bd = sideC ? sideC.ring : "rgba(190,52,85,0.9)";
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
        <span style={{ display: "flex", fontSize: s.number != null ? "36px" : "24px", fontWeight: 700, color: fg, lineHeight: 1 }}>{s.number != null ? s.number : s.name ? s.name.slice(0, 2) : s.pos}</span>
      </div>
      {s.name ? (
        <div style={{ display: "flex", marginTop: "9px", fontSize: nameMode ? "26px" : "22px", fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.9)", textAlign: "center" }}>{s.name}</div>
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
