// AI 프리뷰 글 생성 잡 (분석가급).
// 사용: npm run job:preview

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildPreviewPrompt } from "@/prompts/match-preview";
import { buildLolPreviewPrompt } from "@/prompts/lol-preview";
import {
  fetchCurrentLolPatch,
  calcLckStandings,
  discoverTeamRoster,
  fetchBdlPlayerStats,
  fetchBdlTeamStats,
  fetchBdlChampionStats,
  modelOneGameKills,
  oneGameKillsOver,
  oneGameHandicap,
} from "@/lib/sports/lol";
import {
  fetchLckRoster,
  lpTeamNameByExternalId,
} from "@/lib/sports/leaguepedia";
import {
  fetchKboStartersToday,
  enrichKboStartersWithStats,
  pickStartersForMatch as pickKboStarters,
  type KboStarter,
} from "@/lib/sports/kbo-starters";
import {
  fetchNpbStartersForMonth,
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
import type {
  LolRosterPlayer,
  LolPlayerStatsLite,
  LolChampionMeta,
} from "@/prompts/match-preview";
import { notifyDraftReady } from "@/lib/notify/telegram";
import { titleDatePrefixKST } from "@/lib/format";
import {
  buildMatchContext,
  enrichContextWithApiFootball,
} from "@/lib/predict/build-context";
import { enrichBaseballContext } from "@/lib/predict/baseball-context";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "@/lib/predict/starter-adjust";
import type { League, MatchStatus, NormalizedMatch } from "@/lib/sports/types";
import type { PredictMatch } from "@/lib/predict/types";
import { parseTsAnalysisForPreview } from "@/lib/sports/thesports/preview-analysis";
import { readFileSync } from "fs";
import path from "path";

const TS_SOCCER_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
]);

let _tsTeamMap: Map<number, string> | null = null;
function loadTsTeamMap(): Map<number, string> {
  if (_tsTeamMap) return _tsTeamMap;
  try {
    const f = path.join(
      process.cwd(),
      "src/lib/sports/thesports/team-id-mapping.json",
    );
    const arr = JSON.parse(readFileSync(f, "utf-8")) as Array<{
      ourId: number;
      tsId: string;
    }>;
    _tsTeamMap = new Map(arr.map((x) => [x.ourId, x.tsId]));
  } catch {
    _tsTeamMap = new Map();
  }
  return _tsTeamMap;
}

function extractTitle(markdown: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "프리뷰";
}

function buildSlug(league: string, matchId: number): string {
  return `${league.toLowerCase()}-preview-${matchId}`;
}

export async function runPreview(opts?: {
  autoPublish?: boolean;
  league?: string;
  /** 기본 2일. 5/26 GSC 노출 99% 급락 진단 — sitemap URL 폭증 차단 위해 5 → 2 단축.
   *  먼 미래 PREVIEW 는 라인업/폼 변동 커서 모델 신뢰도 낮음. 단축이 quality 향상. */
  horizonDays?: number;
  take?: number;
}) {
  const autoPublish = opts?.autoPublish ?? true;
  const onlyLeague = opts?.league;
  const horizonDays = opts?.horizonDays ?? 2;
  const take = opts?.take ?? 40;
  console.log(
    `[preview] 시작 — autoPublish=${autoPublish}, league=${onlyLeague ?? "ALL"}, horizon=${horizonDays}d, take=${take}`,
  );

  const now = new Date();
  // 라인업/폼 변동이 큰 먼 미래 매치는 모델 신뢰도가 떨어지므로 의도적으로 좁게.
  const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const { PREVIEW_LEAGUES } = await import("@/lib/sports/types");
  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      articles: { none: { type: "PREVIEW" } },
      ...(onlyLeague
        ? { league: onlyLeague }
        : { league: { in: [...PREVIEW_LEAGUES] } }),
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take,
  });

  console.log(`[preview] 대상: ${matches.length}경기`);
  if (matches.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // KBO/NPB 선발 투수 — 매 매치 fetch 부담 줄이려 잡 시작 시점에 한 번만.
  let kboStarters: KboStarter[] = [];
  let npbStarters: NpbStarter[] = [];
  // KBO/NPB 부상자 — 시즌 단위 한 번 호출 후 매치별 양 팀 filter.
  let kboInjuries: KboInjury[] = [];
  let npbInjuries: NpbInjuryEntry[] = [];
  if (matches.some((m) => m.league === "KBO")) {
    try {
      const raw = await fetchKboStartersToday();
      console.log(`[preview/KBO] mykbo.statiz 선발 ${raw.length}건`);
      // KBO 공식 (koreabaseball.com) 시즌 stats 보강 — ERA·WHIP·K/9·W-L·IP·QS·피안타율
      kboStarters = await enrichKboStartersWithStats(raw);
      const withStats = kboStarters.flatMap((s) => [s.pitcherA, s.pitcherB]).filter((p) => p.stats).length;
      console.log(`[preview/KBO] 시즌 stats 보강: ${withStats}/${kboStarters.length * 2}명`);
    } catch (err) {
      console.warn(`[preview/KBO] starters fetch 실패:`, (err as Error).message);
    }
    try {
      kboInjuries = await fetchKboInjuries();
      console.log(`[preview/KBO] 부상자/치료재활 ${kboInjuries.length}건 fetch`);
    } catch (err) {
      console.warn(`[preview/KBO] injuries fetch 실패:`, (err as Error).message);
    }
  }
  if (matches.some((m) => m.league === "NPB")) {
    try {
      const now = new Date();
      const cm = now.getMonth() + 1;
      const cy = now.getFullYear();
      const nm = cm === 12 ? 1 : cm + 1;
      const ny = cm === 12 ? cy + 1 : cy;
      const [a, b] = await Promise.all([
        fetchNpbStartersForMonth(cy, cm),
        fetchNpbStartersForMonth(ny, nm),
      ]);
      npbStarters = [...a, ...b];
      console.log(`[preview/NPB] 선발 투수 ${npbStarters.length}건 fetch (npb.jp ${cy}-${cm} + ${ny}-${nm})`);
    } catch (err) {
      console.warn(`[preview/NPB] starters fetch 실패:`, (err as Error).message);
    }
    try {
      const raw = await fetchNpbInjuries(30);
      const active = activeNpbInjuries(raw);
      npbInjuries = await enrichNpbInjuriesWithKorean(active);
      console.log(`[preview/NPB] 1군 엔트리 제외 (active) ${npbInjuries.length}건 + 한글 음역 보강`);
    } catch (err) {
      console.warn(`[preview/NPB] injuries fetch 실패:`, (err as Error).message);
    }
  }

  const leagues = [...new Set(matches.map((m) => m.league))];
  const leagueMatches: Record<string, PredictMatch[]> = {};
  for (const lg of leagues) {
    const list = await prisma.match.findMany({
      where: { league: lg },
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
    });
    leagueMatches[lg] = list as PredictMatch[];
  }

  for (const m of matches) {
    try {
      // KBO/NPB 는 선발 투수 확정 후에만 PREVIEW 발행 (매치 당일 KST ~11시 게재).
      // starter 매칭 실패 = 아직 확정 안 됨 → 다음 cron 까지 skip.
      if (m.league === "KBO") {
        const kstNow = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        const kstMatch = new Date(m.startTime.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        if (kstNow !== kstMatch || kboStarters.length === 0) {
          console.log(`[preview/KBO] skip — starter 미확정: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
          continue;
        }
        const p = pickKboStarters(kboStarters, m.homeTeam.name, m.awayTeam.name);
        if (!p) {
          console.log(`[preview/KBO] skip — starter 매칭 안 됨: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
          continue;
        }
      }
      if (m.league === "NPB") {
        if (npbStarters.length === 0) {
          console.log(`[preview/NPB] skip — starter 미확정: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
          continue;
        }
        const p = pickNpbStartersForMatch(npbStarters, m.homeTeam.name, m.awayTeam.name, m.startTime);
        if (!p) {
          console.log(`[preview/NPB] skip — starter 매칭 안 됨: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
          continue;
        }
      }
      // MLB 도 선발 양쪽 확정 후에만 발행 — 선발·배당 없는 빈약 프리뷰 방지(사용자 요청 2026-06-01).
      // KBO/NPB 와 동일 정책. 선발 미정이면 다음 cron 에서 채워진 후 재시도.
      if (m.league === "MLB" && (!m.homeStarter || !m.awayStarter)) {
        console.log(`[preview/MLB] skip — 선발 미확정: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
        continue;
      }
      let context = buildMatchContext(
        leagueMatches[m.league],
        m.league,
        m.homeTeamId,
        m.awayTeamId,
        m.startTime,
      );
      context = await enrichContextWithApiFootball(
        context,
        m.league,
        m.homeTeam.name,
        m.awayTeam.name,
        m.startTime,
      );

      // TheSports analysis 보강 (축구만) — 모든 대회 H2H + 양 팀 최근 7경기 + 시간대별 골 분포.
      // Lightsail football-poller 가 SCHEDULED 매치 포함 5분 주기로 TheSportsMatchCache.analysis 갱신.
      if (TS_SOCCER_LEAGUES.has(m.league)) {
        try {
          const tm = loadTsTeamMap();
          const homeTsId = tm.get(m.homeTeamId);
          const awayTsId = tm.get(m.awayTeamId);
          if (homeTsId && awayTsId) {
            const cache = await prisma.theSportsMatchCache.findUnique({
              where: { matchId: m.id },
              select: { analysis: true },
            });
            if (cache?.analysis) {
              const parsed = parseTsAnalysisForPreview(
                cache.analysis,
                homeTsId,
                awayTsId,
                7,
              );
              if (parsed) context.tsHistory = parsed;
            }
          }
        } catch (err) {
          console.warn(
            `[preview/tsHistory] ${m.league}#${m.id}: ${(err as Error).message}`,
          );
        }
      }

      // 시장 odds 가 저장돼 있으면 context 에 주입 → 프롬프트에서 Value Bet 자동 강조
      if (m.marketHome != null && m.marketAway != null) {
        context.marketProb = {
          home: m.marketHome,
          draw: m.marketDraw ?? 0,
          away: m.marketAway,
          bookmakers: m.marketBookmakers ?? 0,
        };
      }

      // 베팅 라인 움직임 (오프닝 vs 현재) — 둘 다 있을 때만
      if (
        m.openingMarketHome != null &&
        m.openingMarketAway != null &&
        m.marketHome != null &&
        m.marketAway != null
      ) {
        context.lineMovement = {
          home: { opening: m.openingMarketHome, current: m.marketHome },
          draw: {
            opening: m.openingMarketDraw ?? 0,
            current: m.marketDraw ?? 0,
          },
          away: { opening: m.openingMarketAway, current: m.marketAway },
          capturedAt: m.openingCapturedAt ?? undefined,
        };
      }

      // 라인업 (api-football Pro)
      if (m.lineupHome && m.lineupAway) {
        try {
          context.lineups = {
            home: JSON.parse(m.lineupHome),
            away: JSON.parse(m.lineupAway),
          };
        } catch {}
      }

      // API-Football 자체 prediction (third opinion)
      if (m.apiPredHome != null && m.apiPredAway != null) {
        context.apiPrediction = {
          homePct: m.apiPredHome,
          drawPct: m.apiPredDraw ?? 0,
          awayPct: m.apiPredAway,
          advice: m.apiPredAdvice ?? undefined,
        };
      }

      // MLB 선발 투수 (statsapi.mlb.com)
      if (m.league === "MLB" && (m.homeStarter || m.awayStarter)) {
        try {
          context.starters = {
            home: m.homeStarter ? JSON.parse(m.homeStarter) : undefined,
            away: m.awayStarter ? JSON.parse(m.awayStarter) : undefined,
          };
        } catch {}
      }

      // KBO 선발 투수 (mykbo.statiz.co.kr scraping — today 만 제공)
      // 매치가 KST 오늘이 아니면 skip (다른 날 매치에 같은 선발 잘못 매핑되는 것 방지)
      const kstNow = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const kstMatch = new Date(m.startTime.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (m.league === "KBO" && kboStarters.length > 0 && kstNow === kstMatch) {
        const p = pickKboStarters(kboStarters, m.homeTeam.name, m.awayTeam.name);
        if (p) {
          // pid 는 KBO 공식 playerId (없으면 statiz id fallback X — 클릭 시 우리
          // /players/[pid]?league=KBO 페이지로 가야 하므로 KBO ID 필수).
          // KBO ID 없으면 pid 자체 생략 → 카드에 plain text 표시.
          const buildJson = (side: typeof p.home) => ({
            name: side.name,
            pid: side.kboId ? Number(side.kboId) : undefined,
            era: side.stats?.era,
            whip: side.stats?.whip,
            k9: side.stats?.k9,
            wins: side.stats?.wins,
            losses: side.stats?.losses,
            ip: side.stats?.ip,
            gs: undefined as number | undefined,
          });
          const homeJson = buildJson(p.home);
          const awayJson = buildJson(p.away);
          context.starters = { home: homeJson, away: awayJson };
          await prisma.match.update({
            where: { id: m.id },
            data: {
              homeStarter: JSON.stringify(homeJson),
              awayStarter: JSON.stringify(awayJson),
              startersUpdatedAt: new Date(),
            },
          }).catch(() => {});
        }
      }

      // NPB 선발 투수 (npb.jp scraping — 시즌 stats 없음, 일본어 한자 이름만)
      if (m.league === "NPB" && npbStarters.length > 0) {
        const p = pickNpbStartersForMatch(npbStarters, m.homeTeam.name, m.awayTeam.name, m.startTime);
        if (p) {
          const homeJson = { name: p.home.name };
          const awayJson = { name: p.away.name };
          context.starters = { home: homeJson, away: awayJson };
          await prisma.match.update({
            where: { id: m.id },
            data: {
              homeStarter: JSON.stringify(homeJson),
              awayStarter: JSON.stringify(awayJson),
              startersUpdatedAt: new Date(),
            },
          }).catch(() => {});
        }
      }

      // KBO 부상자 명단 + 치료·재활명단 → context.injuries (PREVIEW 본문 인용용)
      if (m.league === "KBO" && kboInjuries.length > 0) {
        const homeInj = getTeamKboInjuries(kboInjuries, m.homeTeam.name);
        const awayInj = getTeamKboInjuries(kboInjuries, m.awayTeam.name);
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
      }

      // NPB 1군 엔트리 제외 → context.injuries
      if (m.league === "NPB" && npbInjuries.length > 0) {
        const npbDisplay = (jp: string) => {
          const tokens = jp.split(/[\s　]+/).filter(Boolean);
          if (tokens.length === 0) return jp;
          const ko = jpPitcherToKorean(tokens[0]);
          if (ko === tokens[0]) return jp;
          return tokens.length > 1 ? `${ko} ${tokens.slice(1).join(" ")}` : ko;
        };
        const homeInj = getTeamNpbInjuries(npbInjuries, m.homeTeam.name);
        const awayInj = getTeamNpbInjuries(npbInjuries, m.awayTeam.name);
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

      // NHL 골리 (api-web.nhle.com)
      if (m.league === "NHL" && (m.homeGoalie || m.awayGoalie)) {
        try {
          context.goalies = {
            home: m.homeGoalie ? JSON.parse(m.homeGoalie) : undefined,
            away: m.awayGoalie ? JSON.parse(m.awayGoalie) : undefined,
          };
        } catch {}
      }

      // 야구(KBO/MLB/NPB) Poisson 이닝별 득점 확률 — starter ERA + 시즌 RPG/RApg
      // + 구장 + 최근 폼 으로 9이닝 분포 + Skellam 시뮬 승률.
      context = enrichBaseballContext(context, m);

      // LoL — 현재 패치 + LCK 정규 standings + BDL 풍부 데이터 (rosters, KDA, 1게임 시장, 챔피언 메타)
      if (m.league === "LOL") {
        const patch = await fetchCurrentLolPatch();
        const lckMatches = leagueMatches[m.league] ?? [];
        const standings = calcLckStandings(lckMatches);
        const homeStanding = standings.get(m.homeTeamId);
        const awayStanding = standings.get(m.awayTeamId);

        // Bo3 게임 수 OVER/UNDER 2.5 — LCK 정규시즌 매치 결과 풀세트(3게임) 빈도
        let gameCountMarket: NonNullable<typeof context.lolMeta>["gameCountMarket"] | undefined;
        const fin = lckMatches.filter(
          (x) =>
            x.status === "FINISHED" &&
            x.homeScore !== null &&
            x.awayScore !== null,
        );
        if (fin.length >= 10) {
          const fullSets = fin.filter(
            (x) => (x.homeScore ?? 0) + (x.awayScore ?? 0) >= 3,
          ).length;
          gameCountMarket = {
            line: 2.5,
            pOver: fullSets / fin.length,
            sample: fin.length,
          };
        }

        // BDL team IDs — DB 의 Team.externalId 가 곧 BDL team.id (lol.ts collector 매핑)
        const homeBdlId = Number(m.homeTeam.externalId);
        const awayBdlId = Number(m.awayTeam.externalId);

        // 1) 자동 로스터 추출 — 각 팀의 최근 finished 매치 여러 개 (BDL role 수집 일관되지 않음)
        // 홈/원정 어디든 출전했으면 매치 ID 후보. discoverTeamRoster 가 매치별로 role 채워진 게임 찾음.
        const recentHomeMatches = await prisma.match.findMany({
          where: {
            league: "LOL",
            status: "FINISHED",
            OR: [
              { homeTeamId: m.homeTeamId },
              { awayTeamId: m.homeTeamId },
            ],
          },
          orderBy: { startTime: "desc" },
          take: 5,
          select: { externalId: true },
        });
        const recentAwayMatches = await prisma.match.findMany({
          where: {
            league: "LOL",
            status: "FINISHED",
            OR: [
              { homeTeamId: m.awayTeamId },
              { awayTeamId: m.awayTeamId },
            ],
          },
          orderBy: { startTime: "desc" },
          take: 5,
          select: { externalId: true },
        });

        let rosters: NonNullable<typeof context.lolMeta>["rosters"] | undefined;
        let playerStats: Record<string, LolPlayerStatsLite> | undefined;
        try {
          const [hDisc, aDisc] = await Promise.all([
            recentHomeMatches.length
              ? discoverTeamRoster(
                  homeBdlId,
                  recentHomeMatches.map((x) => x.externalId),
                )
              : Promise.resolve([]),
            recentAwayMatches.length
              ? discoverTeamRoster(
                  awayBdlId,
                  recentAwayMatches.map((x) => x.externalId),
                )
              : Promise.resolve([]),
          ]);

          // BDL role 대문자 첫글자 정규화 ("mid" → "Mid", "jun" → "Jungle", "sup" → "Support", "adc" → "Bot")
          const normRole = (r: string): string => {
            const lo = r.toLowerCase();
            if (lo === "top") return "Top";
            if (lo.startsWith("jun") || lo === "jungle" || lo === "jg") return "Jungle";
            if (lo === "mid" || lo === "middle") return "Mid";
            if (lo === "adc" || lo === "bot" || lo === "ad carry") return "Bot";
            if (lo.startsWith("sup")) return "Support";
            return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
          };
          const toRoster = (disc: typeof hDisc): LolRosterPlayer[] =>
            disc.map((p) => ({
              id: p.nickname,
              bdlId: p.id,
              nameEn: p.nameEn, // BDL /players search 보강
              role: normRole(p.role),
              country: p.country,
              recentChampions: p.recentChampions,
            }));
          let hRoster = toRoster(hDisc);
          let aRoster = toRoster(aDisc);

          // 2) Leaguepedia 한국 본명 보강 — graceful fail
          try {
            const hLpName = lpTeamNameByExternalId(m.homeTeam.externalId);
            const aLpName = lpTeamNameByExternalId(m.awayTeam.externalId);
            const enrich = async (
              roster: LolRosterPlayer[],
              lpName: string | null,
            ) => {
              if (!lpName || roster.length === 0) return roster;
              const lpRoster = await fetchLckRoster(lpName);
              return roster.map((p) => {
                const found = lpRoster.find(
                  (lp) => lp.id.toLowerCase() === p.id.toLowerCase(),
                );
                if (!found) return p;
                return {
                  ...p,
                  nameEn: found.name,
                  nameKo: found.nameKo,
                  country: found.country,
                };
              });
            };
            hRoster = await enrich(hRoster, hLpName);
            aRoster = await enrich(aRoster, aLpName);
          } catch {
            // Leaguepedia 실패해도 BDL 닉네임 기반으로 진행
          }

          if (hRoster.length > 0 || aRoster.length > 0) {
            rosters = { home: hRoster, away: aRoster };
          }

          // 3) 선수 시즌 stats — 양 팀 미드만 (호출 부담 줄임). 600/min 한도 안에서.
          const homeMid = hRoster.find((p) => p.role === "Mid");
          const awayMid = aRoster.find((p) => p.role === "Mid");
          const stats: Record<string, LolPlayerStatsLite> = {};
          for (const p of [homeMid, awayMid].filter(Boolean) as LolRosterPlayer[]) {
            if (!p.bdlId) continue;
            const games = await fetchBdlPlayerStats(p.bdlId, 30);
            if (games.length === 0) continue;
            let k = 0, d = 0, a = 0, cs = 0, dmg = 0, gpm = 0;
            const champCount = new Map<string, number>();
            for (const g of games) {
              k += g.kills || 0;
              d += g.deaths || 0;
              a += g.assists || 0;
              cs += g.creep_score ?? 0;
              dmg += g.total_damage_dealt_to_champions ?? 0;
              gpm += g.gold_per_min ?? 0;
              if (g.champion)
                champCount.set(
                  g.champion.name,
                  (champCount.get(g.champion.name) ?? 0) + 1,
                );
            }
            stats[p.id] = {
              games: games.length,
              kda: d === 0 ? k + a : (k + a) / d,
              avgCs: games.length ? cs / games.length : undefined,
              avgDpm: games.length ? dmg / games.length : undefined,
              avgGpm: games.length ? gpm / games.length : undefined,
              topChampions: [...champCount.entries()]
                .sort((x, y) => y[1] - x[1])
                .slice(0, 3)
                .map(([champion, games]) => ({ champion, games })),
            };
          }
          if (Object.keys(stats).length > 0) playerStats = stats;
        } catch (err) {
          console.warn(
            `[preview/LOL] BDL roster/stats fetch 실패 — 단락 생략:`,
            (err as Error).message,
          );
        }

        // 4) 1게임 단위 시장 — team_match_map_stats
        let oneGameKillsMarket:
          | NonNullable<typeof context.lolMeta>["oneGameKillsMarket"]
          | undefined;
        let oneGameHandicapMarket:
          | NonNullable<typeof context.lolMeta>["oneGameHandicapMarket"]
          | undefined;
        try {
          const [hTeamStats, aTeamStats] = await Promise.all([
            fetchBdlTeamStats(homeBdlId, 30),
            fetchBdlTeamStats(awayBdlId, 30),
          ]);
          const model = modelOneGameKills(hTeamStats, aTeamStats);
          if (model) {
            const ovr = oneGameKillsOver(model);
            oneGameKillsMarket = {
              line: ovr.line,
              pOver: ovr.pOver,
              sample: model.sample,
              expectedTotal: model.expectedTotal,
            };
            oneGameHandicapMarket = oneGameHandicap(model);
          }
        } catch (err) {
          console.warn(
            `[preview/LOL] team_match_map_stats 실패:`,
            (err as Error).message,
          );
        }

        // 5) 챔피언 메타 — 글로벌 top 픽
        let championMeta: LolChampionMeta[] | undefined;
        try {
          const champs = await fetchBdlChampionStats(15);
          if (champs.length > 0) {
            championMeta = champs.slice(0, 8).map((c) => ({
              name: c.champion.name,
              picksRate: c.picks_rate,
              banRate: c.ban_rate,
              winRate: c.win_rate,
              kda: c.kda,
            }));
          }
        } catch {
          // ignore
        }

        // Total Maps OU vig-free implied (oddsOver/oddsUnder 가 있을 때)
        let totalMapsMarket: NonNullable<typeof context.lolMeta>["totalMapsMarket"] | undefined;
        if (m.oddsTotalLine != null && m.oddsOver != null && m.oddsUnder != null) {
          const pO = 1 / m.oddsOver;
          const pU = 1 / m.oddsUnder;
          const sum = pO + pU;
          totalMapsMarket = {
            line: m.oddsTotalLine,
            overImplied: pO / sum,
            underImplied: pU / sum,
          };
        }

        context.lolMeta = {
          patch: patch ?? undefined,
          standings:
            homeStanding && awayStanding
              ? {
                  home: {
                    rank: homeStanding.rank,
                    wins: homeStanding.wins,
                    losses: homeStanding.losses,
                    setsWon: homeStanding.setsWon,
                    setsLost: homeStanding.setsLost,
                  },
                  away: {
                    rank: awayStanding.rank,
                    wins: awayStanding.wins,
                    losses: awayStanding.losses,
                    setsWon: awayStanding.setsWon,
                    setsLost: awayStanding.setsLost,
                  },
                  total: standings.size,
                }
              : undefined,
          rosters,
          playerStats,
          gameCountMarket,
          oneGameKillsMarket,
          oneGameHandicapMarket,
          championMeta,
          totalMapsMarket,
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

      // 본문 내부 링크 1개용 — 양 팀 중 가장 최근 발행된 RECAP 글 1개 (3개월 내).
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
      } catch (err) {
        console.warn(`[preview] recentRecap fetch 실패:`, (err as Error).message);
      }

      const prompt =
        m.league === "LOL"
          ? buildLolPreviewPrompt({ match: normalized, context })
          : buildPreviewPrompt({ match: normalized, context });
      const content = await generateWithMinLength(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 4096,
        temperature: 0.6,
        label: `preview ${m.league}#${m.id}`,
      });
      if (!content) continue; // 길이 미달 — DB INSERT 스킵

      const rawTitle = extractTitle(content);
      const prefix = titleDatePrefixKST(m.startTime);
      // [M/D] 패턴 prefix 가 이미 있으면 OK, 그 외 [...] 형태로 시작해도 prefix 강제 추가.
      const title = /^\[\d{1,2}\/\d{1,2}\]/.test(rawTitle)
        ? rawTitle
        : `${prefix} ${rawTitle}`;
      const slug = buildSlug(m.league, m.id);

      // 적중률 추적용 — 글 작성 시점의 추정 승률을 그대로 저장.
      // 야구 선발 ERA/WHIP/K9 보정 적용 — predHome 도 선발 반영 (predictMatchById 와 동일 단일 소스).
      let wp = context.winProb;
      if (wp) {
        const ps = (
          s: string | null,
        ): { era?: number; whip?: number; k9?: number; gs?: number } | null => {
          if (!s) return null;
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        };
        const sAdj = computeStarterAdjustment(ps(m.homeStarter), ps(m.awayStarter));
        if (sAdj.applied) wp = applyStarterToWinProb(wp, sAdj);
      }
      const predictedWinner = wp
        ? wp.home >= wp.away && wp.home >= wp.draw
          ? "HOME"
          : wp.away >= wp.draw
            ? "AWAY"
            : "DRAW"
        : null;

      // 야구(KBO/MLB/NPB) — InningScoreChart 렌더용 JSON 컨텍스트
      const baseballCtx =
        context.inningScoreProbs && context.totalExpectedRuns
          ? {
              inningScoreProbs: context.inningScoreProbs,
              totalExpectedRuns: context.totalExpectedRuns,
              winProbPoisson: context.winProbPoisson,
            }
          : null;

      const article = await prisma.article.create({
        data: {
          matchId: m.id,
          type: "PREVIEW",
          league: m.league,
          title,
          slug,
          content,
          status: autoPublish ? "PUBLISHED" : "PENDING_REVIEW",
          publishedAt: autoPublish ? new Date() : null,
          predHome: wp?.home ?? null,
          predDraw: wp?.draw ?? null,
          predAway: wp?.away ?? null,
          predWinner: predictedWinner,
          // 본문=위젯 단일 소스 — Elo·시즌 승점도 글 시점 값 고정 (predHome 과 동일).
          eloHome: context.elo?.home ?? null,
          eloAway: context.elo?.away ?? null,
          homeSeasonPoints: context.points?.home ?? null,
          awaySeasonPoints: context.points?.away ?? null,
          baseballContext: baseballCtx ? JSON.stringify(baseballCtx) : null,
        },
      });

      // Match 의 predHome/Draw/Away 도 같이 update — /value-bets, /scores 등
      // SSR 페이지가 Match.predHome 직접 참조 (Article 안 join 비용 X).
      // 사용자 진단 (NPB 12554): Article PUBLISHED 였지만 Match.predHome=null
      // → value-bets/Elo 비교 카드 안 보이는 원인.
      if (wp) {
        await prisma.match
          .update({
            where: { id: m.id },
            data: {
              predHome: wp.home,
              predDraw: wp.draw,
              predAway: wp.away,
              predWinner: predictedWinner,
            },
          })
          .catch((e) => {
            console.warn(`[preview] Match predict update fail m#${m.id}: ${(e as Error).message}`);
          });
      }

      console.log(
        `[preview] ✅ #${article.id} ${m.league} ${m.homeTeam.name} vs ${m.awayTeam.name}: ${title}`,
      );

      await notifyDraftReady({
        id: article.id,
        title: article.title,
        league: article.league,
        type: article.type,
      });
    } catch (err) {
      console.error(
        `[preview] 실패 (match #${m.id}):`,
        (err as Error).message,
      );
    }
  }

  console.log("[preview] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPreview()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
