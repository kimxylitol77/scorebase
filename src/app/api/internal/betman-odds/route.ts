// POST /api/internal/betman-odds
// Vultr worker (betman-odds-cron) 가 베트맨 gameInfoInq.do 응답을 그대로 push.
// Bearer auth: INTERNAL_API_TOKEN.
//
// body: { gmTs, compSchedules: { keys, datas }, voteStatus: [...] } — 베트맨 원본 그대로.
// 파싱·정규화·upsert 는 여기서 한다 (워커는 받아서 넘기기만 — 다른 수집 잡과 같은 구조).
//
// ⚠️ compSchedules 는 컬럼형(keys + datas 배열의 배열)이다. keys 로 인덱스를 만들어 읽고
//    절대 인덱스를 하드코딩하지 말 것 — 베트맨이 컬럼을 추가하면 통째로 밀린다.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  gmTs?: number;
  compSchedules?: { keys?: string[]; datas?: unknown[][] };
  voteStatus?: Array<{ GM_SEQ?: number; W_BET_CNT?: number; D_BET_CNT?: number; L_BET_CNT?: number }>;
}

/** 승패형은 무 배당이 0.0 으로 온다 — 0 은 "배당 없음" 이지 값이 아니다. */
const allot = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const gmTs = num(body.gmTs);
  const keys = body.compSchedules?.keys;
  const datas = body.compSchedules?.datas;
  if (gmTs == null || !Array.isArray(keys) || !Array.isArray(datas)) {
    return NextResponse.json({ error: "gmTs / compSchedules.keys / datas required" }, { status: 400 });
  }

  const idx = new Map(keys.map((k, i) => [k, i]));
  const col = (row: unknown[], key: string): unknown => {
    const i = idx.get(key);
    return i == null ? undefined : row[i];
  };

  // 투표 분포 — matchSeq ↔ GM_SEQ. 집계 없는 행(핸디캡 등)은 매칭 안 됨.
  const votes = new Map<number, { w: number | null; d: number | null; l: number | null }>();
  for (const v of body.voteStatus ?? []) {
    if (typeof v?.GM_SEQ !== "number") continue;
    votes.set(v.GM_SEQ, { w: num(v.W_BET_CNT), d: num(v.D_BET_CNT), l: num(v.L_BET_CNT) });
  }

  const now = new Date();
  const rows: Prisma.Sql[] = [];
  let skipped = 0;
  for (const row of datas) {
    if (!Array.isArray(row)) { skipped++; continue; }
    const matchSeq = num(col(row, "matchSeq"));
    const gameDateMs = num(col(row, "gameDate"));
    const homeName = str(col(row, "homeName"));
    const awayName = str(col(row, "awayName"));
    // 팀명·경기시각·seq 셋 중 하나라도 없으면 쓸 수 없는 행.
    if (matchSeq == null || gameDateMs == null || !homeName || !awayName) { skipped++; continue; }

    const v = votes.get(matchSeq);
    rows.push(Prisma.sql`(
      ${`${gmTs}-${matchSeq}`}, ${gmTs}, ${matchSeq}, ${new Date(gameDateMs)},
      ${str(col(row, "itemCode"))}, ${str(col(row, "leagueCode"))}, ${str(col(row, "leagueName")) ?? "-"},
      ${str(col(row, "homeId"))}, ${str(col(row, "awayId"))}, ${homeName}, ${awayName},
      ${str(col(row, "meetStadiumFullName"))},
      ${str(col(row, "betId"))}, ${str(col(row, "betNm"))}, ${str(col(row, "betTypId"))}, ${str(col(row, "betTypNm"))},
      ${num(col(row, "handi"))}, ${num(col(row, "winHandi"))}, ${num(col(row, "loseHandi"))},
      ${allot(col(row, "winAllot"))}, ${allot(col(row, "drawAllot"))}, ${allot(col(row, "loseAllot"))},
      ${v?.w ?? null}, ${v?.d ?? null}, ${v?.l ?? null},
      ${str(col(row, "protoStatus"))}, ${str(col(row, "gameResult"))}, ${now}, ${now}
    )`);
  }

  // 한 회차가 850행이라 row 단위 upsert 면 왕복만으로 분 단위가 된다(실측 180s 초과) →
  // 다중 VALUES + ON CONFLICT 로 한 번에. 파라미터 상한(65535)을 넉넉히 밑돌게 청크.
  let upserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    upserted += await prisma.$executeRaw`
      INSERT INTO "BetmanOdds" (
        "id","gmTs","matchSeq","gameDate",
        "itemCode","leagueCode","leagueName",
        "homeId","awayId","homeName","awayName",
        "stadium",
        "betId","betNm","betTypId","betTypNm",
        "handi","winHandi","loseHandi",
        "winAllot","drawAllot","loseAllot",
        "winVotes","drawVotes","loseVotes",
        "protoStatus","gameResult","fetchedAt","updatedAt"
      ) VALUES ${Prisma.join(chunk)}
      ON CONFLICT ("id") DO UPDATE SET
        "gameDate"=EXCLUDED."gameDate",
        "itemCode"=EXCLUDED."itemCode","leagueCode"=EXCLUDED."leagueCode","leagueName"=EXCLUDED."leagueName",
        "homeId"=EXCLUDED."homeId","awayId"=EXCLUDED."awayId",
        "homeName"=EXCLUDED."homeName","awayName"=EXCLUDED."awayName","stadium"=EXCLUDED."stadium",
        "betId"=EXCLUDED."betId","betNm"=EXCLUDED."betNm","betTypId"=EXCLUDED."betTypId","betTypNm"=EXCLUDED."betTypNm",
        "handi"=EXCLUDED."handi","winHandi"=EXCLUDED."winHandi","loseHandi"=EXCLUDED."loseHandi",
        "winAllot"=EXCLUDED."winAllot","drawAllot"=EXCLUDED."drawAllot","loseAllot"=EXCLUDED."loseAllot",
        "winVotes"=EXCLUDED."winVotes","drawVotes"=EXCLUDED."drawVotes","loseVotes"=EXCLUDED."loseVotes",
        "protoStatus"=EXCLUDED."protoStatus","gameResult"=EXCLUDED."gameResult",
        "fetchedAt"=EXCLUDED."fetchedAt","updatedAt"=EXCLUDED."updatedAt"
    `;
    // matchId 는 갱신 대상에서 뺀다 — 나중에 붙일 Match 매핑을 재수집이 지우면 안 된다.
  }

  return NextResponse.json({ ok: true, gmTs, upserted, skipped });
}
