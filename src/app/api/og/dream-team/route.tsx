// GET /api/og/dream-team?teamId=<id> — 드림팀 스쿼드 공유 카드(1080×1350, 인스타 4:5).
// 포메이션 피치 + 선수 OVR 배지 + 팀 OVR·티어·감독·전적. 한글은 Google Fonts 동적 subset 주입.
// 카톡·스레드 URL unfurl 용 og:image (team/[id] generateMetadata 가 지정).

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { grownOvr } from "@/lib/dream-team/grow";
import { teamAvgOvr } from "@/lib/dream-team/ovr-to-elo";
import { TIERS } from "@/lib/dream-team/tiers";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
};

// 포메이션별 슬롯 id → 피치 좌표(%). DreamTeamBuilder FORMATIONS 의 행 구조를 절대좌표로 매핑.
// x: 0=왼쪽 100=오른쪽, y: 작을수록 위(공격) 클수록 아래(GK). slot id 는 빌더와 동일.
const SLOT_XY: Record<string, Record<string, { x: number; y: number }>> = {
  "4-3-3": {
    lw: { x: 25, y: 16 }, st: { x: 50, y: 16 }, rw: { x: 75, y: 16 },
    lcm: { x: 25, y: 40 }, cm: { x: 50, y: 40 }, rcm: { x: 75, y: 40 },
    lb: { x: 20, y: 64 }, lcb: { x: 40, y: 64 }, rcb: { x: 60, y: 64 }, rb: { x: 80, y: 64 },
    gk: { x: 50, y: 86 },
  },
  "4-4-2": {
    st1: { x: 35, y: 16 }, st2: { x: 65, y: 16 },
    lm: { x: 20, y: 42 }, lcm: { x: 40, y: 42 }, rcm: { x: 60, y: 42 }, rm: { x: 80, y: 42 },
    lb: { x: 20, y: 65 }, lcb: { x: 40, y: 65 }, rcb: { x: 60, y: 65 }, rb: { x: 80, y: 65 },
    gk: { x: 50, y: 86 },
  },
  "4-2-3-1": {
    st: { x: 50, y: 13 },
    lam: { x: 25, y: 33 }, cam: { x: 50, y: 33 }, ram: { x: 75, y: 33 },
    ldm: { x: 35, y: 50 }, rdm: { x: 65, y: 50 },
    lb: { x: 20, y: 68 }, lcb: { x: 40, y: 68 }, rcb: { x: 60, y: 68 }, rb: { x: 80, y: 68 },
    gk: { x: 50, y: 87 },
  },
  "3-5-2": {
    st1: { x: 35, y: 16 }, st2: { x: 65, y: 16 },
    lm: { x: 17, y: 42 }, lcm: { x: 33, y: 42 }, cm: { x: 50, y: 42 }, rcm: { x: 67, y: 42 }, rm: { x: 83, y: 42 },
    lcb: { x: 30, y: 66 }, cb: { x: 50, y: 66 }, rcb: { x: 70, y: 66 },
    gk: { x: 50, y: 87 },
  },
};

// satori 는 시스템 폰트가 없다 → 카드에 쓰는 글자만 Google Fonts 에서 subset 해 버퍼로 받는다.
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

interface CardSlot { x: number; y: number; name: string; ovr: number; pos: string }

export async function GET(req: Request) {
  const teamId = new URL(req.url).searchParams.get("teamId");
  const team = teamId
    ? await prisma.dreamTeam.findUnique({
        where: { id: teamId },
        include: { user: { select: { nickname: true } } },
      })
    : null;

  if (!team) {
    return new ImageResponse(<Fallback />, {
      width: 1080,
      height: 1350,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  const lineup = (team.lineup as unknown as { slot: string; playerId: string }[]) ?? [];
  const squad = (team.squad as unknown as { playerId: string; xp: number }[]) ?? [];
  const xy = SLOT_XY[team.formation] ?? SLOT_XY["4-3-3"];
  const pool = getDreamPlayers(lineup.map((p) => p.playerId));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const xpById = new Map(squad.map((s) => [s.playerId, s.xp]));

  const slots: CardSlot[] = [];
  for (const p of lineup) {
    const dp = byId.get(p.playerId);
    const coord = xy[p.slot];
    if (!dp || !coord) continue;
    slots.push({
      x: coord.x,
      y: coord.y,
      name: dp.name,
      ovr: grownOvr(dp.ovr, dp.potential, xpById.get(p.playerId) ?? 0),
      pos: dp.pos,
    });
  }

  const teamOvr = slots.length ? Math.round(teamAvgOvr(slots.map((s) => s.ovr))) : 0;
  const tierName = TIERS[team.tier]?.name ?? team.tier;
  const sub = `감독 ${team.user.nickname} · ${team.formation} · 팀 OVR ${teamOvr} · ${team.wins}승 ${team.draws}무 ${team.losses}패`;

  const fontText =
    team.name +
    tierName +
    sub +
    "Scorebase scorebase.kr 드림팀 리그 가성비로 승부 감독 팀 승무패 OVR vs GKDFMFW0123456789·" +
    slots.map((s) => s.name + s.pos).join("");
  const font = await loadFont(fontText);

  return new ImageResponse(<Card name={team.name} tierName={tierName} sub={sub} slots={slots} />, {
    width: 1080,
    height: 1350,
    headers: CACHE_HEADERS,
    fonts: font ? [{ name: "Noto Sans KR", data: font, weight: 700, style: "normal" }] : undefined,
  });
}

function Card({
  name,
  tierName,
  sub,
  slots,
}: {
  name: string;
  tierName: string;
  sub: string;
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
        <div style={{ display: "flex", fontSize: "22px", fontWeight: 700, padding: "6px 18px", borderRadius: "999px", background: "rgba(190,52,85,0.22)", color: "#fda4af" }}>
          {tierName} 리그
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: "22px" }}>
        <span style={{ fontSize: "56px", fontWeight: 700, letterSpacing: "-0.03em" }}>{name}</span>
        <span style={{ display: "flex", fontSize: "24px", opacity: 0.7, marginTop: "4px" }}>{sub}</span>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          marginTop: "20px",
          borderRadius: "24px",
          background: "linear-gradient(to bottom, #0f5132 0%, #0a3d27 100%)",
          border: "2px solid rgba(16,185,129,0.4)",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: "20px", right: "20px", top: "20px", bottom: "20px", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "6px" }} />
        <div style={{ position: "absolute", left: "20px", right: "20px", top: "50%", borderTop: "2px solid rgba(255,255,255,0.12)" }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "160px", height: "160px", transform: "translate(-50%, -50%)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "999px" }} />
        {slots.map((s, i) => (
          <CardPlayer key={i} s={s} />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "20px", opacity: 0.7, letterSpacing: "0.05em", marginTop: "14px" }}>
        <span>가성비로 승부하는 드림팀</span>
        <span>scorebase.kr</span>
      </div>
    </div>
  );
}

function CardPlayer({ s }: { s: CardSlot }) {
  const c = ovrColor(s.ovr);
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
          background: c.bg,
          border: `3px solid ${c.bd}`,
        }}
      >
        <span style={{ display: "flex", fontSize: "38px", fontWeight: 700, color: c.fg, lineHeight: 1 }}>{s.ovr}</span>
      </div>
      <div style={{ display: "flex", marginTop: "9px", fontSize: "22px", fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.9)", textAlign: "center" }}>
        {s.name}
      </div>
      <div style={{ display: "flex", marginTop: "3px", fontSize: "15px", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}>
        {s.pos}
      </div>
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
      Scorebase 드림팀
    </div>
  );
}
