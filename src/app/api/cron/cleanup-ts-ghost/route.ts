// /api/cron/cleanup-ts-ghost — ts 원본에서 사라진 축구 유령 매치를 경기 전에 찾아 삭제한다.
//
// 기존 cleanup-ghost 와 겹치지 않는다. 그쪽은 ESPN 10개 리그 전용이고, 시작 -2h 이내는
// 등록 lag 오탐 때문에 검사조차 하지 않는다(경기가 끝날 무렵에야 잡는다). 유령은 며칠 전부터
// 화면에 떠 있으므로 "미리" 걷어내는 경로가 따로 필요하다.
//
// 축구 전용인 이유. 판정의 핵심인 /match/recent/list 가 football 만 인가돼 있다
// (baseball 은 "URL is not authorized"). 하키·배구는 diary 부재를 일정 이동과 구분할
// 수 없어 자동 삭제 대상에서 제외한다 — 오탐이 곧 정상 경기 삭제이기 때문이다.
//
// 안전 가드 4겹. ① diary 전량 성공해야 진행(부분 집합이면 멀쩡한 매치가 후보가 된다)
// ② 후보 규모 상한 ③ recent/list 카나리로 엔드포인트 생존 확인 ④ 후보별 0건 2회 재확인.
// 사람 흔적(투표·발행글)이 달린 유령은 삭제하지 않고 알림만 보낸다.

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import {
  GHOST_DELETE_LIMIT,
  GHOST_LOOKAHEAD_DAYS,
  assessCandidateVolume,
  isDeletable,
  pickGhostCandidates,
  tsUuidOf,
} from "@/lib/sports/thesports/ghost-match";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_NAME = "cleanup-ts-ghost";

/** 0건 판정을 뒤집을 기회를 주는 재확인 간격. 순간적인 응답 이상을 걸러낸다. */
const RECHECK_DELAY_MS = 2000;

interface TsMatchRow {
  id: string;
  match_time?: number;
  status_id?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** KST 자정 기준 하루치 목록. diary 는 그 날짜에 "있는" 경기만 준다. */
async function fetchDiaryUuids(dayOffset: number): Promise<string[]> {
  const ymd = new Date(Date.now() + dayOffset * 86400_000)
    .toISOString()
    .slice(0, 10);
  const kstMidnight = new Date(`${ymd}T00:00:00Z`).getTime() - 9 * 3600_000;
  const resp = await thesportsGet<{ code: number; results?: TsMatchRow[] }>(
    "/v1/football/match/diary",
    { tsp: Math.floor(kstMidnight / 1000) },
  );
  return (resp.results ?? []).map((m) => m.id);
}

/** uuid 단건 조회. 존재하면 row, 삭제됐으면 null. 조회 자체가 실패하면 throw. */
async function fetchTsMatch(uuid: string): Promise<TsMatchRow | null> {
  const resp = await thesportsGet<{ code: number; results?: TsMatchRow[] }>(
    "/v1/football/match/recent/list",
    { uuid },
  );
  return resp.results?.[0] ?? null;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + GHOST_LOOKAHEAD_DAYS * 86400_000);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: [...SOCCER_LEAGUES] as string[] },
      status: "SCHEDULED",
      externalId: { startsWith: "ts-" },
      startTime: { gte: now, lte: horizon },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (matches.length === 0) {
    await recordCronRun(CRON_NAME, { count: 0 });
    return NextResponse.json({ ok: true, checked: 0, deleted: 0 });
  }

  // ① diary 수집 — KST 경계가 UTC 창 양끝을 넘으므로 하루씩 여유를 둔다.
  //    한 날짜라도 실패하면 후보가 통째로 부풀어 오르므로 전면 중단한다.
  const diaryUuids = new Set<string>();
  try {
    for (let d = -1; d <= GHOST_LOOKAHEAD_DAYS + 1; d++) {
      for (const id of await fetchDiaryUuids(d)) diaryUuids.add(id);
    }
  } catch (e) {
    const error = `diary 수집 실패 — ${(e as Error).message}`;
    await recordCronRun(CRON_NAME, { ok: false, error });
    return NextResponse.json({ ok: false, aborted: error }, { status: 200 });
  }

  const candidates = pickGhostCandidates(matches, diaryUuids);

  // ② 후보 규모 가드 — 대량이면 ts 이상이나 우리 수집 문제다. 사람이 봐야 한다.
  const volume = assessCandidateVolume(candidates.length, matches.length);
  if (!volume.proceed) {
    await prisma.healthCheck.create({
      data: {
        severity: "HIGH",
        category: "ts-ghost",
        key: "abort",
        message: `유령 후보 과다로 자동 삭제 중단 — ${volume.reason}`,
        metadata: {
          candidates: candidates.length,
          checked: matches.length,
          sample: candidates.slice(0, 10).map((m) => ({
            id: m.id,
            league: m.league,
            teams: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
          })),
        },
      },
    });
    await sendTelegram(
      `🚨 <b>유령 매치 자동 삭제 중단</b>\n\n` +
        `📍 <b>무엇</b>: ${volume.reason}\n` +
        `💥 <b>영향</b>: 이번 런은 아무것도 지우지 않았습니다\n` +
        `🔍 <b>원인</b>: ts diary 결손 또는 우리 수집 이상 가능성\n` +
        `➡️ <b>확인</b>: scorebase.kr/admin/health (category=ts-ghost)\n\n` +
        `<code>[안내] cron-${CRON_NAME}</code>`,
      { parseMode: "HTML" },
    );
    await recordCronRun(CRON_NAME, { ok: false, error: volume.reason });
    return NextResponse.json({
      ok: false,
      aborted: volume.reason,
      checked: matches.length,
      candidates: candidates.length,
    });
  }

  if (candidates.length === 0) {
    await recordCronRun(CRON_NAME, { count: 0 });
    return NextResponse.json({ ok: true, checked: matches.length, deleted: 0 });
  }

  // ③ 카나리 — diary 에 있던 uuid 로 recent/list 가 살아있는지 본다. 이 엔드포인트만
  //    죽어 전부 0건을 주는 상황에서 삭제가 돌면 그날 일정이 통째로 날아간다.
  const canaryUuid = matches
    .map((m) => tsUuidOf(m.externalId))
    .find((u): u is string => u != null && diaryUuids.has(u));
  if (canaryUuid) {
    let canaryOk = false;
    try {
      canaryOk = (await fetchTsMatch(canaryUuid)) != null;
    } catch {
      canaryOk = false;
    }
    if (!canaryOk) {
      const error = "recent/list 카나리 실패 — 엔드포인트 이상으로 삭제 중단";
      await recordCronRun(CRON_NAME, { ok: false, error });
      return NextResponse.json({ ok: false, aborted: error });
    }
  }

  // ④ 후보 확정 — 0건이 2회 연속일 때만 유령. 이동·실존은 그대로 둔다.
  const ghosts: typeof candidates = [];
  const alive: { id: number; movedTo?: string }[] = [];
  const errors: { id: number; error: string }[] = [];

  for (const m of candidates) {
    const uuid = tsUuidOf(m.externalId)!;
    try {
      let row = await fetchTsMatch(uuid);
      if (row == null) {
        await sleep(RECHECK_DELAY_MS);
        row = await fetchTsMatch(uuid);
      }
      if (row == null) {
        ghosts.push(m);
      } else {
        alive.push({
          id: m.id,
          movedTo: row.match_time
            ? new Date(row.match_time * 1000).toISOString()
            : undefined,
        });
      }
    } catch (e) {
      errors.push({ id: m.id, error: (e as Error).message });
    }
  }

  // 삭제 — 사람 흔적이 달린 건 남기고 알림만. 상한을 넘는 초과분도 다음 런으로 미룬다.
  const deleted: typeof ghosts = [];
  const held: { id: number; reason: string }[] = [];

  for (const m of ghosts) {
    if (deleted.length >= GHOST_DELETE_LIMIT) {
      held.push({ id: m.id, reason: `삭제 상한 ${GHOST_DELETE_LIMIT} 초과` });
      continue;
    }
    const [articles, votes] = await Promise.all([
      prisma.article.count({ where: { matchId: m.id } }),
      prisma.matchVote.count({ where: { matchId: m.id } }),
    ]);
    if (!isDeletable({ articles, votes })) {
      held.push({ id: m.id, reason: `사람 흔적 — 글 ${articles} · 투표 ${votes}` });
      continue;
    }
    try {
      await prisma.match.delete({ where: { id: m.id } });
      deleted.push(m);
      console.log(
        `[${CRON_NAME}] 삭제 id=${m.id} ${m.league} ` +
          `${m.homeTeam.name} vs ${m.awayTeam.name} ` +
          `start=${m.startTime.toISOString()} externalId=${m.externalId}`,
      );
    } catch (e) {
      // 예상 못 한 FK 참조 — 지우면 안 되는 무언가가 달려 있다는 뜻이므로 보류.
      held.push({ id: m.id, reason: `삭제 실패 — ${(e as Error).message}` });
    }
  }

  const describe = (m: (typeof ghosts)[number]) =>
    `${m.league} ${m.homeTeam.name} vs ${m.awayTeam.name} (${m.startTime.toISOString().slice(0, 16).replace("T", " ")}Z)`;

  if (deleted.length > 0 || held.length > 0) {
    await prisma.healthCheck.create({
      data: {
        severity: held.length > 0 ? "MED" : "LOW",
        category: "ts-ghost",
        key: "summary",
        message: `유령 매치 삭제 ${deleted.length}건 · 보류 ${held.length}건`,
        metadata: {
          checked: matches.length,
          candidates: candidates.length,
          deleted: deleted.map((m) => ({
            id: m.id,
            league: m.league,
            teams: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
            startTime: m.startTime.toISOString(),
            externalId: m.externalId,
          })),
          held,
        },
      },
    });

    try {
      await sendTelegram(
        `🧹 <b>유령 매치 정리</b>\n\n` +
          `📍 <b>무엇</b>: ts 원본에서 사라진 축구 매치 ${deleted.length}건 삭제\n` +
          (deleted.length > 0
            ? `<code>${deleted.slice(0, 8).map(describe).join("\n")}</code>\n`
            : "") +
          (held.length > 0
            ? `\n⚠️ <b>보류 ${held.length}건</b> (사람 흔적·상한): <code>${held
                .slice(0, 5)
                .map((h) => `#${h.id} ${h.reason}`)
                .join("\n")}</code>\n`
            : "") +
          `\n🔍 <b>판정</b>: diary 부재 + recent/list 0건 2회\n` +
          `➡️ <b>확인</b>: scorebase.kr/admin/health (category=ts-ghost)\n\n` +
          `<code>[안내] cron-${CRON_NAME}</code>`,
        { parseMode: "HTML" },
      );
    } catch (e) {
      console.warn(`[${CRON_NAME}] telegram fail:`, (e as Error).message);
    }
  }

  await recordCronRun(CRON_NAME, { count: deleted.length });

  return NextResponse.json({
    ok: true,
    checked: matches.length,
    candidates: candidates.length,
    deleted: deleted.length,
    held: held.length,
    aliveInDiaryGap: alive.length,
    errors,
    deletedMatches: deleted.map((m) => ({
      id: m.id,
      league: m.league,
      teams: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
      startTime: m.startTime.toISOString(),
      externalId: m.externalId,
    })),
  });
}
