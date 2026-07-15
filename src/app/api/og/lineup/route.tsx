// GET /api/og/lineup?d=<base64url> — 라인업 전술판 공유 카드(1080×1350, 인스타 4:5).
// 좌표 기반 피치(드래그·자유배치 그대로) + 단일/맞대결. 한글은 Google Fonts 동적 subset 주입.

import { ImageResponse } from "next/og";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
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
  photo: string | null; // 사진 모드용 data URL (프리페치 실패 시 null → 번호 칩 폴백)
  alt: boolean; // 대체자원(뎁스 차트) — 빨강 링, 있으면 선발은 파랑 링
}

// satori 는 img 로드 실패 시 렌더 전체가 깨진다 — 사진을 서버에서 미리 받아 data URL 로 주입.
async function fetchPhotoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") ?? "image/png";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("d");
  const board = code ? decodeBoard(code) : null;

  if (!board) {
    return new ImageResponse(<Fallback />, { width: 1080, height: 1350, headers: { "Cache-Control": "public, max-age=60" } });
  }

  // 이름·사진 해석 — 빌더와 동일 우선순위(교정 사전 → DB nameKo → dream-pool).
  // 풀은 빅5 출전자만이라 스쿼드 전용 선수(신입·로테이션)는 DB 보강이 없으면 이름이 빠진다.
  const pids = pidsFromBoard(board);
  const players = getDreamPlayers(pids);
  const dreamById: Record<string, (typeof players)[number]> = {};
  for (const p of players) dreamById[p.id] = p;
  const DB_POS: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };
  const byId: Record<string, { name: string; pos: string | null; photo: string | null }> = {};
  try {
    const rows = await prisma.theSportsPlayer.findMany({
      where: { id: { in: pids } },
      select: { id: true, name: true, nameKo: true, position: true, photoUrl: true },
    });
    for (const r of rows) {
      const fixed = toKoreanPlayerName(r.name);
      const dream = dreamById[r.id];
      byId[r.id] = {
        name: /[가-힣]/.test(fixed) ? fixed : (r.nameKo && /[가-힣]/.test(r.nameKo) ? r.nameKo : dream?.name ?? r.name),
        pos: dream?.pos ?? DB_POS[r.position ?? ""] ?? null,
        photo: dream?.photo ?? r.photoUrl ?? null,
      };
    }
  } catch { /* DB 실패 시 dream-pool 폴백 */ }
  for (const p of players) {
    if (!byId[p.id]) byId[p.id] = { name: p.name, pos: p.pos, photo: p.photo };
  }

  const versus = board.mode === "versus";
  const landscape = board.orientation === "landscape";
  const nameMode = board.displayMode === "name";
  const photoMode = board.displayMode === "photo"; // 빌더 기본값 — 카드도 사진으로 (표시모드 일치)
  const toSlots = (side: Side, sideKey: "home" | "away"): CardSlot[] =>
    side.players
      .filter((p) => p.pid || p.name)
      .map((pl) => {
        const d = toDisplayXY(pl.x, pl.y, landscape);
        if (pl.pid) {
          const p = byId[pl.pid];
          return { x: d.x, y: d.y, name: p?.name ?? null, number: NUM_BY_ID.get(pl.pid) ?? null, pos: (p?.pos ?? pl.pos) as string, side: versus ? sideKey : null, photo: photoMode ? (p?.photo ?? null) : null, alt: !!pl.alt };
        }
        return { x: d.x, y: d.y, name: pl.name, number: null, pos: pl.pos, side: versus ? sideKey : null, photo: null, alt: !!pl.alt };
      });

  const slots: CardSlot[] = [...toSlots(board.home, "home"), ...(board.away ? toSlots(board.away, "away") : [])];

  // 후보 명단 (더블 스쿼드) — 이름·등번호 텍스트 바
  const bench = (board.bench ?? []).map((e) => {
    if (e.pid) {
      const p = byId[e.pid];
      return { name: p?.name ?? "선수", number: NUM_BY_ID.get(e.pid) ?? null };
    }
    return { name: e.name ?? "", number: null };
  }).filter((b) => b.name);

  // 사진 모드 — 프리페치해 data URL 로 (같은 URL 은 1회만, 실패는 번호 칩 폴백)
  if (photoMode) {
    const urls = [...new Set(slots.map((s) => s.photo).filter((u): u is string => !!u && u.startsWith("http")))];
    const fetched = await Promise.all(urls.map(async (u) => [u, await fetchPhotoDataUrl(u)] as const));
    const dataByUrl = new Map(fetched);
    for (const s of slots) s.photo = s.photo ? (dataByUrl.get(s.photo) ?? null) : null;
  }

  const title = board.title?.trim() || "나의 라인업";
  const subtitle = versus
    ? [board.away?.club, board.home.club].filter(Boolean).join(" vs ") || board.subtitle?.trim() || ""
    : board.subtitle?.trim() || "";
  const kit = KIT_BY_KEY[board.kit] ?? KIT_BY_KEY.grass;

  const fontText =
    title +
    subtitle +
    "Scorebase scorebase.kr vs HOMEAWAY GKDFMFW0123456789 abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    slots.map((s) => s.name ?? "").join("") +
    "후보선발대체자원" +
    bench.map((b) => b.name).join("");
  const font = await loadFont(fontText);

  return new ImageResponse(<Card title={title} subtitle={subtitle} versus={versus} landscape={landscape} nameMode={nameMode} kit={kit} slots={slots} bench={bench} />, {
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
  bench,
}: {
  title: string;
  subtitle: string;
  versus: boolean;
  landscape: boolean;
  nameMode: boolean;
  kit: { from: string; to: string };
  slots: CardSlot[];
  bench: { name: string; number: number | null }[];
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
          <CardPlayer key={i} s={s} nameMode={nameMode} depthMode={slots.some((x) => x.alt)} />
        ))}
        {slots.some((x) => x.alt) && (
          <div style={{ position: "absolute", left: "26px", bottom: "24px", display: "flex", alignItems: "center", gap: "16px", fontSize: "17px", fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ display: "flex", width: "12px", height: "12px", borderRadius: "999px", background: "rgba(59,130,246,0.95)" }} /> 선발</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ display: "flex", width: "12px", height: "12px", borderRadius: "999px", background: "rgba(239,68,68,0.95)" }} /> 대체자원</span>
          </div>
        )}
      </div>

      {bench.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 18px",
            marginTop: "14px",
            padding: "14px 20px",
            borderRadius: "16px",
            background: `linear-gradient(135deg, ${kit.from}, ${kit.to})`,
            border: "2px solid rgba(255,255,255,0.18)",
          }}
        >
          <span style={{ display: "flex", fontSize: "18px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.75)" }}>후보</span>
          {bench.map((b, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "21px", fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
              {b.name}
              {b.number != null ? <span style={{ display: "flex", fontSize: "17px", fontWeight: 400, color: "rgba(255,255,255,0.6)" }}>{b.number}</span> : null}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", fontSize: "20px", opacity: 0.7, letterSpacing: "0.05em", marginTop: "14px" }}>
        scorebase.kr
      </div>
    </div>
  );
}

function CardPlayer({ s, nameMode, depthMode }: { s: CardSlot; nameMode: boolean; depthMode: boolean }) {
  const sideC = s.side ? SIDE_COLORS[s.side] : null;
  const fg = sideC ? (s.side === "home" ? "#fda4af" : "#93c5fd") : "#fda4af";
  const bg = sideC ? sideC.soft : "rgba(190,52,85,0.24)";
  // 뎁스 차트 — 대체자원 빨강, (있으면) 선발 파랑. 아니면 기존 색.
  const bd = s.alt ? "rgba(239,68,68,0.95)" : depthMode && !sideC ? "rgba(59,130,246,0.95)" : sideC ? sideC.ring : "rgba(190,52,85,0.9)";
  // 맞대결은 22명이 한 피치에 들어가 노드를 축소(사진 68px·이름 18px·포지션 생략) — 겹침 방지.
  const compact = !!s.side;
  const photoPx = compact ? "68px" : "88px";
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
      {s.photo ? (
        // 래퍼 div(보더+overflow hidden) 안의 img 는 satori 가 뭉갬 — 맨 img 에 직접 스타일 (검증됨)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photo} alt="" width={88} height={88} style={{ width: photoPx, height: photoPx, borderRadius: "999px", border: `3px solid ${bd}`, background: "rgba(255,255,255,0.92)" }} />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? "64px" : "84px",
            height: compact ? "64px" : "84px",
            borderRadius: "20px",
            background: bg,
            border: `3px solid ${bd}`,
          }}
        >
          <span style={{ display: "flex", fontSize: s.number != null ? "36px" : "24px", fontWeight: 700, color: fg, lineHeight: 1 }}>{s.number != null ? s.number : s.name ? s.name.slice(0, 2) : s.pos}</span>
        </div>
      )}
      {s.name ? (
        <div style={{ display: "flex", marginTop: compact ? "6px" : "9px", fontSize: nameMode ? "26px" : compact ? "18px" : "22px", fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.9)", textAlign: "center" }}>{s.name}</div>
      ) : null}
      {!compact && (
        <div style={{ display: "flex", marginTop: "3px", fontSize: "15px", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}>{s.pos}</div>
      )}
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
