// POST /api/internal/save-baseball-odds
// Lightsail baseball-odds-poller 가 TheSports `/v1/baseball/odds/history` 응답을 그대로 push.
// 본 endpoint 는 results dict 를 row 단위로 분해 → createMany skipDuplicates.
//
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HOCKEY_LEAGUES } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** TheSports 배당을 시장 확률(marketHome)까지 쓰는 리그 — 하키 중 The Odds API 가 커버하는 NHL·LIIGA 제외. */
const HOCKEY_TS_MARKET_LEAGUES = new Set([...HOCKEY_LEAGUES].filter((l) => l !== "NHL" && l !== "LIIGA"));

interface Body {
  matchId: number;
  tsMatchId: string;
  // TheSports 응답의 results: { [companyId]: { eu?: row[], asia?: row[], bs?: row[] } }
  // row 형식: [ts, v1, mid, v2, status]
  results: Record<string, Partial<Record<"eu" | "asia" | "bs", unknown[][]>>>;
}

type Kind = "eu" | "asia" | "bs";
const KINDS: Kind[] = ["eu", "asia", "bs"];

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function toRow(matchId: number, companyId: string, kind: Kind, raw: unknown[]):
  | { matchId: number; companyId: string; kind: Kind; ts: number; v1: number; mid: number | null; v2: number; status: number }
  | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const ts = Number(raw[0]);
  const v1 = Number(raw[1]);
  const midRaw = raw[2];
  const v2 = Number(raw[3]);
  const statusRaw = raw[4];
  if (!Number.isFinite(ts) || !Number.isFinite(v1) || !Number.isFinite(v2)) return null;
  const mid = midRaw == null || midRaw === "" ? null : Number(midRaw);
  const status = Number.isFinite(Number(statusRaw)) ? Number(statusRaw) : 0;
  return {
    matchId,
    companyId,
    kind,
    ts,
    v1,
    mid: mid != null && Number.isFinite(mid) ? mid : null,
    v2,
    status,
  };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body.matchId !== "number" || typeof body.tsMatchId !== "string") {
    return NextResponse.json({ error: "matchId(number) + tsMatchId(string) required" }, { status: 400 });
  }
  if (!body.results || typeof body.results !== "object") {
    return NextResponse.json({ error: "results dict required" }, { status: 400 });
  }

  // 우리 Match 존재 확인 — 없으면 silently skip (worker 가 stale id 호출해도 안전).
  const exists = await prisma.match.findUnique({
    where: { id: body.matchId },
    select: {
      id: true, league: true, status: true, oddsHome: true, oddsOver: true, oddsHcHome: true,
      openingMarketHome: true,
    },
  });
  if (!exists) return NextResponse.json({ skipped: "match not found", matchId: body.matchId }, { status: 200 });

  const rows: ReturnType<typeof toRow>[] = [];
  for (const [companyId, payload] of Object.entries(body.results)) {
    if (!payload || typeof payload !== "object") continue;
    for (const kind of KINDS) {
      const list = payload[kind];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const row = toRow(body.matchId, companyId, kind, raw);
        if (row) rows.push(row);
      }
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, totalRows: 0 });
  }

  // skipDuplicates — @@unique([matchId, companyId, kind, ts]) 가드.
  const valid = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  const result = await prisma.tsBaseballOddsHistory.createMany({
    data: valid,
    skipDuplicates: true,
  });

  // === Match raw odds 갱신 — /analysis · MatchInsight 표시용 (pickOdds 가 읽는 필드).
  // 야구는 The Odds API 가 NPB 1경기·KBO 0 으로 사실상 미커버 → TheSports 가 owner.
  // company "2"(Bet365, baseball-ts-odds.ts 와 동일) 우선, kind 별 최신(ts max). v1=home·v2=away.
  // FINISHED 는 동결(종료 직전 라인 유지), SCHEDULED/LIVE 만 갱신.
  let oddsUpdated = false;
  if (exists.status !== "FINISHED") {
    const latest = (kind: Kind) => {
      const pool = valid.filter((r) => r.kind === kind && r.v1 >= 1.01 && r.v2 >= 1.01);
      const pref = pool.filter((r) => r.companyId === "2");
      return (pref.length ? pref : pool).reduce<(typeof pool)[number] | null>(
        (a, r) => (!a || r.ts > a.ts ? r : a),
        null,
      );
    };
    const eu = latest("eu");
    const asia = latest("asia");
    const bs = latest("bs");
    // 기존 값(주로 MLB 의 The Odds API)은 보존 — 비어있는 마켓만 TheSports 로 채움(gap-fill).
    // KBO/NPB 는 The Odds API 미커버라 항상 null → TheSports 가 채움.
    const data: Record<string, number> = {};
    let marketPatch: Record<string, Date> = {};
    if (eu && exists.oddsHome == null) {
      data.oddsHome = eu.v1;
      data.oddsAway = eu.v2;
    }
    if (bs && exists.oddsOver == null) {
      data.oddsOver = bs.v1;
      data.oddsUnder = bs.v2;
      if (bs.mid != null) data.oddsTotalLine = bs.mid;
    }
    if (asia && exists.oddsHcHome == null) {
      data.oddsHcHome = asia.v1;
      data.oddsHcAway = asia.v2;
      if (asia.mid != null) data.oddsHcLine = Math.abs(asia.mid);
    }
    // 하키(NHL·LIIGA 제외) — 시장 확률(marketHome)도 여기서 쓴다. 그 둘은 The Odds API 가 주인이라
    // 건드리지 않고, 나머지 유럽 하키(KHL·CHL·체코 등)는 TheSports 가 유일한 시장 신호라 매 push 갱신.
    // 야구가 marketHome 을 일부러 안 쓰는 것(api-baseball-odds.ts)과 달리 하키는 NHL 이 이미
    // 시장 블렌드를 쓰고 있어 같은 정책의 확장이다 — reports/plans/hockey-odds/context-notes.md.
    if (eu && HOCKEY_TS_MARKET_LEAGUES.has(exists.league)) {
      const ih = 1 / eu.v1;
      const ia = 1 / eu.v2;
      const pHome = ih / (ih + ia);
      Object.assign(data, {
        marketHome: pHome,
        marketAway: 1 - pHome,
        marketBookmakers: 1,
        ...(exists.openingMarketHome == null
          ? { openingMarketHome: pHome, openingMarketAway: 1 - pHome }
          : {}),
      });
      marketPatch = { marketUpdatedAt: new Date(), ...(exists.openingMarketHome == null ? { openingCapturedAt: new Date() } : {}) };
    }
    if (Object.keys(data).length) {
      await prisma.match
        .update({ where: { id: body.matchId }, data: { ...data, ...marketPatch } })
        .then(() => {
          oddsUpdated = true;
        })
        .catch(() => {});
    }
  }

  return NextResponse.json({ inserted: result.count, totalRows: rows.length, oddsUpdated });
}
