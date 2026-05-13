// KBO / NPB 선발 투수 매일 갱신 잡.
//
// 흐름:
//   1) 향후 N일 KBO+NPB 매치 list (SCHEDULED) DB 에서 fetch
//   2) KBO: mykbo.statiz today 만 → 오늘 매치만 처리
//      NPB: npb.jp 월별 페이지에서 미래 며칠치 예고선발 → horizon 안 매치 처리
//   3) 시즌 stats 보강 (KBO 공식)
//   4) Match.homeStarter / awayStarter JSON 저장
//   5) 신규/변경 매치는 PREVIEW article 본문도 재발행 (Claude generate)
//
// Vercel cron 호출: /api/cron/baseball-starters (1일 1회 매치 시작 전)

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchKboStartersToday,
  enrichKboStartersWithStats,
  pickStartersForMatch as pickKboStarters,
} from "@/lib/sports/kbo-starters";
import {
  fetchNpbStartersForMonth,
  enrichNpbStartersWithStats,
  pickNpbStartersForMatch,
  jpPitcherToKorean,
  type NpbStarter,
} from "@/lib/sports/npb-starters";
import {
  fetchKboInjuries,
  getTeamKboInjuries,
  type KboInjury,
} from "@/lib/sports/kbo-injuries";
import {
  fetchNpbInjuries,
  activeNpbInjuries,
  getTeamNpbInjuries,
  enrichNpbInjuriesWithKorean,
  type NpbInjuryEntry,
} from "@/lib/sports/npb-injuries";
import { generate } from "@/lib/ai/claude";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildPreviewPrompt } from "@/prompts/match-preview";
import {
  buildMatchContext,
  enrichContextWithApiFootball,
} from "@/lib/predict/build-context";
import type { League, MatchStatus, NormalizedMatch } from "@/lib/sports/types";
import type { PredictMatch } from "@/lib/predict/types";

interface StarterJson {
  name: string;
  pid?: number;
  era?: number;
  whip?: number;
  k9?: number;
  wins?: number;
  losses?: number;
  ip?: string;
}

function jsonEq(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    const x = JSON.parse(a) as StarterJson;
    const y = JSON.parse(b) as StarterJson;
    return x.name === y.name && x.pid === y.pid && x.era === y.era && x.whip === y.whip;
  } catch {
    return false;
  }
}

export async function runFetchBaseballStarters(opts?: {
  horizonDays?: number;
  regenerateArticles?: boolean; // 기본 true — 변경 매치 PREVIEW 본문 재발행
  forceRegen?: boolean; // true → 변경 감지 무시, 모든 매치 article 재발행
}) {
  const horizonDays = opts?.horizonDays ?? 3;
  const regenerateArticles = opts?.regenerateArticles ?? true;
  const forceRegen = opts?.forceRegen ?? false;
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86400 * 1000);

  console.log(`[starters] 시작 — horizon ${horizonDays}d, regen ${regenerateArticles}`);

  // 1) 매치 list
  const matches = await prisma.match.findMany({
    where: {
      league: { in: ["KBO", "NPB"] },
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      articles: {
        where: { type: "PREVIEW", status: "PUBLISHED" },
        select: { id: true, slug: true, content: true },
        take: 1,
      },
    },
    orderBy: { startTime: "asc" },
  });
  console.log(`[starters] 대상 ${matches.length}건 (KBO+NPB)`);
  if (matches.length === 0) return { updated: 0, regenerated: 0 };

  // 2) starters 데이터 prefetch
  const kboMatches = matches.filter((m) => m.league === "KBO");
  const npbMatches = matches.filter((m) => m.league === "NPB");

  // KBO — today 만
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let kboStarters: Awaited<ReturnType<typeof enrichKboStartersWithStats>> = [];
  const kboTodayMatches = kboMatches.filter((m) => {
    const kst = new Date(m.startTime.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    return kst === todayKst;
  });
  if (kboTodayMatches.length > 0) {
    try {
      const raw = await fetchKboStartersToday();
      kboStarters = await enrichKboStartersWithStats(raw);
      console.log(`[starters/KBO] mykbo ${raw.length}건 + 시즌 stats 보강`);
    } catch (e) {
      console.warn(`[starters/KBO] fetch 실패:`, (e as Error).message);
    }
  }

  // NPB — 현재 월 + 다음 월
  let npbStarters: NpbStarter[] = [];
  if (npbMatches.length > 0) {
    try {
      const cm = now.getMonth() + 1;
      const cy = now.getFullYear();
      const nm = cm === 12 ? 1 : cm + 1;
      const ny = cm === 12 ? cy + 1 : cy;
      const [a, b] = await Promise.all([
        fetchNpbStartersForMonth(cy, cm),
        fetchNpbStartersForMonth(ny, nm),
      ]);
      const rawNpb = [...a, ...b];
      console.log(`[starters/NPB] npb.jp ${rawNpb.length}건 fetch — pid + stats 보강 시작`);
      npbStarters = await enrichNpbStartersWithStats(rawNpb);
      const enrichedCount = npbStarters.filter(
        (s) => s.pitcherA.pid || s.pitcherB.pid,
      ).length;
      console.log(`[starters/NPB] pid 매칭 ${enrichedCount}/${npbStarters.length}건`);
    } catch (e) {
      console.warn(`[starters/NPB] fetch 실패:`, (e as Error).message);
    }
  }

  // 3) 매치별 update + 변경 감지
  const changedMatchIds: number[] = [];
  let updated = 0;

  for (const m of matches) {
    let newHomeJson: string | null = null;
    let newAwayJson: string | null = null;

    if (m.league === "KBO") {
      // today 만 처리
      const kst = new Date(m.startTime.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (kst !== todayKst || kboStarters.length === 0) continue;
      const p = pickKboStarters(kboStarters, m.homeTeam.name, m.awayTeam.name);
      if (!p) continue;
      const build = (side: typeof p.home) => ({
        name: side.name,
        pid: side.kboId ? Number(side.kboId) : undefined,
        era: side.stats?.era,
        whip: side.stats?.whip,
        k9: side.stats?.k9,
        wins: side.stats?.wins,
        losses: side.stats?.losses,
        ip: side.stats?.ip,
      });
      newHomeJson = JSON.stringify(build(p.home));
      newAwayJson = JSON.stringify(build(p.away));
    } else if (m.league === "NPB") {
      if (npbStarters.length === 0) continue;
      const p = pickNpbStartersForMatch(npbStarters, m.homeTeam.name, m.awayTeam.name, m.startTime);
      if (!p) continue;
      const buildNpb = (side: typeof p.home) => ({
        name: side.name,
        pid: side.pid ? Number(side.pid) : undefined,
        era: side.stats?.era,
        whip: side.stats?.whip,
        k9: side.stats?.k9,
        wins: side.stats?.wins,
        losses: side.stats?.losses,
        ip: side.stats?.ip,
      });
      newHomeJson = JSON.stringify(buildNpb(p.home));
      newAwayJson = JSON.stringify(buildNpb(p.away));
    }

    if (!newHomeJson || !newAwayJson) continue;
    // 변경 감지 (forceRegen 이면 항상 changed = true)
    const changed =
      forceRegen ||
      !jsonEq(m.homeStarter, newHomeJson) ||
      !jsonEq(m.awayStarter, newAwayJson);
    await prisma.match.update({
      where: { id: m.id },
      data: {
        homeStarter: newHomeJson,
        awayStarter: newAwayJson,
        startersUpdatedAt: new Date(),
      },
    });
    updated++;
    if (changed && m.articles.length > 0) {
      changedMatchIds.push(m.id);
    }
  }
  console.log(`[starters] update ${updated}건, 변경 매치(article 있음) ${changedMatchIds.length}건`);

  // 4) 변경된 매치 PREVIEW 본문 재발행
  //    부상자 데이터는 regen 전 한 번만 fetch 후 매치별 filter (KBO/NPB 분리).
  let kboInjuries: KboInjury[] = [];
  let npbInjuries: NpbInjuryEntry[] = [];
  if (regenerateArticles && changedMatchIds.length > 0) {
    const changedMatches = matches.filter((m) => changedMatchIds.includes(m.id));
    if (changedMatches.some((m) => m.league === "KBO")) {
      try {
        kboInjuries = await fetchKboInjuries();
        console.log(`[starters/KBO] 부상자 ${kboInjuries.length}건 fetch`);
      } catch (e) {
        console.warn(`[starters/KBO] injuries fetch 실패:`, (e as Error).message);
      }
    }
    if (changedMatches.some((m) => m.league === "NPB")) {
      try {
        const raw = await fetchNpbInjuries(30);
        const active = activeNpbInjuries(raw);
        npbInjuries = await enrichNpbInjuriesWithKorean(active);
        console.log(`[starters/NPB] 1군 엔트리 제외 ${npbInjuries.length}건 + 한글 음역 보강`);
      } catch (e) {
        console.warn(`[starters/NPB] injuries fetch 실패:`, (e as Error).message);
      }
    }
  }

  let regenerated = 0;
  const failedRegens: number[] = [];
  if (regenerateArticles && changedMatchIds.length > 0) {
    for (const mid of changedMatchIds) {
      try {
        await regenerateBaseballPreview(mid, { kboInjuries, npbInjuries });
        regenerated++;
        console.log(`[starters] regen ✅ match #${mid}`);
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[starters] regen ❌ match #${mid}:`, (e as Error).message);
        failedRegens.push(mid);
      }
    }
  }

  // 5) starter 확정 됐는데 PREVIEW 아직 없는 매치 → 신규 발행 (KBO/NPB 야구 흐름)
  let newlyPublished = 0;
  if (regenerateArticles) {
    const newPublishMatches = matches.filter(
      (m) => m.articles.length === 0 && (m.homeStarter || m.awayStarter || updated > 0),
    );
    // updated > 0 만으로는 부정확 — 매치별 starter 채워졌는지 다시 query
    const fresh = await prisma.match.findMany({
      where: {
        league: { in: ["KBO", "NPB"] },
        status: "SCHEDULED",
        startTime: { gte: now, lte: horizon },
        articles: { none: { type: "PREVIEW" } },
        OR: [{ homeStarter: { not: null } }, { awayStarter: { not: null } }],
      },
      select: { id: true, league: true, homeTeam: true, awayTeam: true },
    });
    if (fresh.length > 0) {
      console.log(`[starters] PREVIEW 미발행 + starter 확정 매치 ${fresh.length}건 → runPreview 호출`);
      const { runPreview } = await import("./generate-previews");
      const leagues = [...new Set(fresh.map((m) => m.league))];
      for (const lg of leagues) {
        try {
          await runPreview({ autoPublish: true, league: lg, horizonDays, take: 20 });
        } catch (e) {
          console.warn(`[starters] ${lg} preview 발행 실패:`, (e as Error).message);
        }
      }
      newlyPublished = fresh.length;
    } else {
      void newPublishMatches;
    }
  }

  // 6) fail 매치 끝에 한 번 더 retry (30s sleep — API 회복 시간)
  if (failedRegens.length > 0) {
    console.log(`[starters] fail 매치 ${failedRegens.length}건 30초 후 재시도`);
    await new Promise((r) => setTimeout(r, 30000));
    for (const mid of failedRegens) {
      try {
        await regenerateBaseballPreview(mid, { kboInjuries, npbInjuries });
        regenerated++;
        console.log(`[starters] retry regen ✅ match #${mid}`);
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.warn(`[starters] retry regen ❌ match #${mid}:`, (e as Error).message);
      }
    }
  }

  return { updated, regenerated, newlyPublished };
}

/**
 * 단일 매치 PREVIEW article 본문 재발행 — 새 starters 가 반영된 상태에서.
 * 부상자(KBO/NPB) 데이터는 호출자가 한 번만 fetch 해서 전달 (매치마다 호출하면 낭비).
 */
async function regenerateBaseballPreview(
  matchId: number,
  opts?: { kboInjuries?: KboInjury[]; npbInjuries?: NpbInjuryEntry[] },
): Promise<void> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      articles: {
        where: { type: "PREVIEW", status: "PUBLISHED" },
        select: { id: true, slug: true },
        take: 1,
      },
    },
  });
  if (!m || m.articles.length === 0) return;
  const article = m.articles[0];

  // context build — 같은 league matches 가져와서 buildMatchContext
  const leagueMatches: PredictMatch[] = (
    await prisma.match.findMany({
      where: { league: m.league },
      select: {
        id: true,
        league: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
    })
  ).map((x) => ({
    id: x.id,
    league: x.league,
    homeTeamId: x.homeTeamId,
    awayTeamId: x.awayTeamId,
    status: x.status as MatchStatus,
    homeScore: x.homeScore,
    awayScore: x.awayScore,
    startTime: x.startTime,
  }));

  const context = buildMatchContext(
    leagueMatches,
    m.league,
    m.homeTeamId,
    m.awayTeamId,
    m.startTime,
  );
  // odds (있으면)
  if (m.marketHome != null && m.marketAway != null) {
    context.marketProb = {
      home: m.marketHome,
      draw: m.marketDraw ?? 0,
      away: m.marketAway,
      bookmakers: 0,
    };
  }
  const normalized: NormalizedMatch = {
    league: m.league as League,
    externalId: m.externalId,
    homeTeam: {
      externalId: m.homeTeam.externalId,
      name: m.homeTeam.name,
      logoUrl: m.homeTeam.logoUrl ?? undefined,
    },
    awayTeam: {
      externalId: m.awayTeam.externalId,
      name: m.awayTeam.name,
      logoUrl: m.awayTeam.logoUrl ?? undefined,
    },
    status: m.status as MatchStatus,
    startTime: m.startTime,
    raw: {},
  };
  // KBO/NPB 는 api-football 미지원 → 호출 안 함

  // starters — Match 컬럼에서 다시 읽음 (방금 update 됐음)
  if (m.homeStarter || m.awayStarter) {
    try {
      context.starters = {
        home: m.homeStarter ? JSON.parse(m.homeStarter) : undefined,
        away: m.awayStarter ? JSON.parse(m.awayStarter) : undefined,
      };
    } catch {}
  }

  // KBO/NPB 부상자 → context.injuries
  if (m.league === "KBO" && opts?.kboInjuries && opts.kboInjuries.length > 0) {
    const homeInj = getTeamKboInjuries(opts.kboInjuries, m.homeTeam.name);
    const awayInj = getTeamKboInjuries(opts.kboInjuries, m.awayTeam.name);
    if (homeInj.length > 0 || awayInj.length > 0) {
      context.injuries = {
        home: homeInj.map((i) => ({
          name: i.position ? `${i.playerName}(${i.position})` : i.playerName,
          reason: `${i.type} · ${i.duration}`,
        })),
        away: awayInj.map((i) => ({
          name: i.position ? `${i.playerName}(${i.position})` : i.playerName,
          reason: `${i.type} · ${i.duration}`,
        })),
      };
    }
  } else if (m.league === "NPB" && opts?.npbInjuries && opts.npbInjuries.length > 0) {
    const npbDisplay = (jp: string) => {
      const tokens = jp.split(/[\s　]+/).filter(Boolean);
      if (tokens.length === 0) return jp;
      const ko = jpPitcherToKorean(tokens[0]);
      if (ko === tokens[0]) return jp;
      return tokens.length > 1 ? `${ko} ${tokens.slice(1).join(" ")}` : ko;
    };
    const homeInj = getTeamNpbInjuries(opts.npbInjuries, m.homeTeam.name);
    const awayInj = getTeamNpbInjuries(opts.npbInjuries, m.awayTeam.name);
    if (homeInj.length > 0 || awayInj.length > 0) {
      context.injuries = {
        home: homeInj.map((i) => ({
          name: npbDisplay(i.playerName),
          reason: `1군 엔트리 제외(${i.date}) · ${i.positionKo}`,
        })),
        away: awayInj.map((i) => ({
          name: npbDisplay(i.playerName),
          reason: `1군 엔트리 제외(${i.date}) · ${i.positionKo}`,
        })),
      };
    }
  }

  // recentRecap (내부 링크 1개 — 발행 시점 흐름과 동일)
  try {
    const recapCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const recentRecap = await prisma.article.findFirst({
      where: {
        type: "RECAP",
        status: "PUBLISHED",
        createdAt: { gte: recapCutoff },
        match: {
          OR: [
            { homeTeamId: m.homeTeamId },
            { awayTeamId: m.homeTeamId },
            { homeTeamId: m.awayTeamId },
            { awayTeamId: m.awayTeamId },
          ],
        },
      },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, match: { select: { homeTeamId: true, awayTeamId: true } } },
    });
    if (recentRecap && recentRecap.match) {
      const isHome =
        recentRecap.match.homeTeamId === m.homeTeamId ||
        recentRecap.match.awayTeamId === m.homeTeamId;
      context.recentRecap = {
        slug: recentRecap.slug,
        title: recentRecap.title,
        teamSide: isHome ? "home" : "away",
      };
    }
  } catch {}

  const prompt = buildPreviewPrompt({ match: normalized, context });
  const content = await generate(prompt, {
    system: SYSTEM_PROMPT,
    maxTokens: 4096,
    temperature: 0.6,
  });

  // title 갱신 — [M/D] 날짜 prefix 강제. 이미 prefix 가 있으면 그대로.
  const { titleDatePrefixKST } = await import("@/lib/format");
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : undefined;
  let newTitle = rawTitle;
  if (rawTitle) {
    const prefix = titleDatePrefixKST(m.startTime);
    if (!/^\[\d{1,2}\/\d{1,2}\]/.test(rawTitle)) {
      newTitle = `${prefix} ${rawTitle}`;
    }
  }
  await prisma.article.update({
    where: { id: article.id },
    data: {
      content,
      ...(newTitle ? { title: newTitle } : {}),
      updatedAt: new Date(),
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchBaseballStarters()
    .then((r) => console.log(`[starters] 완료 — update ${r.updated} / regen ${r.regenerated}`))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
