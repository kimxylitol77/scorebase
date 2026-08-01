// 링크 건전성 체크 — "표시는 멀쩡한데 눌리지 않는" 결손을 잡는다.
//
// 기존 감시의 사각지대였다. route-guardian 은 링크를 따라가며 404 를 찾으므로 링크가
// 아예 없는 행은 안 보이고, synthetic-monitor·content-quality 는 값의 유무·정오를 볼 뿐
// 링크는 대상이 아니다. 2026-08-01 K리그 리더보드 선수 행이 통째로 안 눌리는 걸
// 봇 38종이 전부 놓치고 사용자가 먼저 발견했다.
//
// 판정은 HTML 이 아니라 데이터 레이어에서 한다. 페이지가 쓰는 바로 그 함수를 호출하므로
// 링크 규칙이 바뀌어도 판정이 따라가고, 마크업 변경에 흔들리지 않는다.

import { prisma } from "@/lib/db";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { leaderPlayerHref } from "@/lib/links/leaderboard-link";
import type { HealthFinding } from "./types";

// 표본이 얕은 리그에서 1건이 12.5% 로 튀어 매일 우는 걸 막는다 — 비율과 절대 건수를 동시에 넘겨야 알림.
const MIN_ROWS = 6;
const MIN_MISSING = 3;
const MISSING_RATE = 0.2;

// 리그 40여 개를 직렬로 돌면 23초 — health-check cron 은 19개 체크가 90초를 나눠 쓴다.
// 동시 실행으로 줄이되, Neon 커넥션 풀을 압박하지 않게 폭을 묶는다.
const CONCURRENCY = 8;

async function mapWithLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  }
  return out;
}

/**
 * 이미 알고 있는 결손은 매일 알리지 않는다 — 새로 끊긴 것만 올린다.
 *
 * 2026-08-01 최초 실행에서 18개 리그가 걸렸다. 전부 진짜(af 매핑이 없어 갈 곳 자체가
 * 없는 하위·해외 리그)지만, 매일 HIGH 18건을 보내면 사용자가 알림을 끄게 된다. 그러면
 * 정작 새로 끊겼을 때 못 본다 — bot-monitoring-gap 에서 이미 겪은 실패다.
 *
 * 최초 실행(이력 0건)은 전부 기준선으로만 적재한다. 소급 알림은 의미가 없다.
 */
async function knownKeys(now: Date): Promise<{ keys: Set<string>; hasHistory: boolean }> {
  const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const rows = await prisma.healthCheck
    .findMany({
      where: { category: "link-health", runAt: { gte: since } },
      select: { key: true },
      distinct: ["key"],
    })
    .catch(() => []);
  return { keys: new Set(rows.map((r) => r.key)), hasHistory: rows.length > 0 };
}

/** 기존에 알고 있던 결손이면 LOW 로 낮춰 텔레그램(HIGH 만 발송) 대상에서 뺀다. */
function gradeAgainstBaseline(
  finding: HealthFinding,
  baseline: { keys: Set<string>; hasHistory: boolean },
): HealthFinding {
  const isNew = baseline.hasHistory && !baseline.keys.has(finding.key);
  if (isNew) return finding;
  return {
    ...finding,
    severity: "LOW",
    message: `${finding.message} (기존 결손 — 새로 발생한 건 아님)`,
  };
}

/** 리더보드 선수 행 중 링크가 안 걸린 비율. K리그 사건이 정확히 이 지표였다. */
async function checkPlayerLinks(): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const leagues = (
    await prisma.leagueLeader.findMany({ select: { league: true }, distinct: ["league"] })
  )
    .map((r) => r.league)
    .sort();

  const loaded = await mapWithLimit(leagues, async (league) => {
    const { rowsByCategory } = await loadLeagueLeaderboard(league).catch(() => ({
      rowsByCategory: {} as Record<string, { playerName: string; externalId: string | null }[]>,
    }));
    return { league, rows: Object.values(rowsByCategory).flat() };
  });

  // /transfers 링크 대상 ts id 를 모아 한 번에 실재 확인 — 없으면 notFound() 라 확정 404 다.
  const tsTargets = new Map<string, string>(); // ts id → "리그 선수명"

  for (const { league, rows } of loaded) {
    // 비시즌은 표가 통째로 빈다 — 정상이므로 검사 대상에서 뺀다.
    if (rows.length < MIN_ROWS) continue;
    const isSoccer = SOCCER_LEAGUES.has(league);

    // 화면과 같은 판정 함수로 실제 href 를 계산한다. externalId 유무만 보면
    // "id 는 있는데 링크가 안 걸린" K리그 사건 유형을 그대로 놓친다(재현 테스트로 확인).
    const hrefs = rows.map((r) => leaderPlayerHref(league, r.externalId, isSoccer));

    rows.forEach((r, i) => {
      const href = hrefs[i];
      if (href?.startsWith("/transfers/")) {
        tsTargets.set(href.slice("/transfers/".length), `${league} ${r.playerName}`);
      }
    });

    const missing = rows.filter((_, i) => !hrefs[i]);
    const rate = missing.length / rows.length;
    if (missing.length >= MIN_MISSING && rate >= MISSING_RATE) {
      out.push({
        category: "link-health",
        key: `player_link_missing:${league}`,
        // 전멸(90%+)은 이번 K리그처럼 리그 하나가 통째로 죽은 상태 — 즉시 알림.
        severity: rate >= 0.9 ? "HIGH" : "MED",
        message:
          `${league} 리더보드 선수 ${missing.length}/${rows.length}행(${Math.round(rate * 100)}%)이 ` +
          `링크 없이 노출. 예: ${missing.slice(0, 3).map((m) => m.playerName).join(", ")}`,
        metadata: { league, missing: missing.length, total: rows.length },
      });
    }
  }

  // 링크는 걸렸는데 대상 페이지가 없는 경우 — 클릭하면 404.
  if (tsTargets.size > 0) {
    const ids = [...tsTargets.keys()];
    const found = await prisma.theSportsPlayer.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const alive = new Set(found.map((f) => f.id));
    const dead = ids.filter((id) => !alive.has(id));
    if (dead.length > 0) {
      out.push({
        category: "link-health",
        key: "player_link_dead",
        severity: dead.length >= MIN_MISSING ? "MED" : "LOW",
        message:
          `리더보드 선수 링크 ${dead.length}건이 존재하지 않는 페이지를 가리킴(클릭 시 404). ` +
          `예: ${dead.slice(0, 3).map((id) => tsTargets.get(id)).join(", ")}`,
        metadata: { dead: dead.length, checked: ids.length, samples: dead.slice(0, 10) },
      });
    }
  }

  return out;
}

/**
 * 최근 뛴 팀의 로고 결손.
 *
 * TeamBadge 는 로고가 없으면 아무것도 안 그린다 — 자리만 비고 에러도 안 나서 눈에 안 띈다.
 *
 * "순위표에 없어 팀 페이지로 못 간다" 는 검사도 넣었다가 뺐다. 2026-08-01 실측에서
 * 9개 리그가 걸렸는데 미등재 팀 대부분이 예정 경기 0 — 지난 시즌을 끝내고 그 리그에
 * 없는 팀이었다. 시즌 경계마다 우는 지표고, standings 커버리지는 기존 감시가 이미 본다.
 * 비용도 컸다(순위표 122리그 조회 89.7초 = cron 90초 예산을 혼자 다 씀).
 */
async function checkTeamLogos(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const since = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
  const teams = await prisma.team.findMany({
    where: {
      OR: [
        { homeMatches: { some: { startTime: { gte: since } } } },
        { awayMatches: { some: { startTime: { gte: since } } } },
      ],
    },
    select: { league: true, name: true, logoUrl: true },
    take: 2000,
  });

  const byLeague = new Map<string, typeof teams>();
  for (const t of teams) {
    const list = byLeague.get(t.league) ?? [];
    list.push(t);
    byLeague.set(t.league, list);
  }

  for (const [league, list] of byLeague) {
    if (list.length < MIN_ROWS) continue;
    const noLogo = list.filter((t) => !t.logoUrl);
    const rate = noLogo.length / list.length;
    if (noLogo.length >= MIN_MISSING && rate >= MISSING_RATE) {
      out.push({
        category: "link-health",
        key: `team_logo_missing:${league}`,
        severity: "LOW",
        message:
          `${league} 최근 출전 팀 ${noLogo.length}/${list.length}팀(${Math.round(rate * 100)}%)에 로고 없음. ` +
          `예: ${noLogo.slice(0, 3).map((t) => t.name).join(", ")}`,
        metadata: { league, missing: noLogo.length, total: list.length },
      });
    }
  }

  return out;
}

export async function checkLinkHealth(now: Date): Promise<HealthFinding[]> {
  const [players, logos, baseline] = await Promise.all([
    checkPlayerLinks(),
    checkTeamLogos(now),
    knownKeys(now),
  ]);
  return [...players, ...logos].map((f) => gradeAgainstBaseline(f, baseline));
}
