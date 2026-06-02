// 공식 유튜브 하이라이트 자동 매칭 — K리그1/K리그2/NBA 종료 경기에 공식 풀-하이라이트
// 영상(videoId)을 붙인다. 매치 페이지 "하이라이트" 카드가 이 값을 임베드한다.
//
// 소스 = 공식 채널의 "풀 하이라이트 전용 재생목록" RSS.
//   채널 RSS 는 쇼츠/믹스/마케팅이 섞여 부적합 → 풀 하이라이트만 모인 재생목록을 화이트리스트.
//   재업로더(예: "The CCB Network") 영상은 절대 사용 안 함 (저작권 침해 + 언젠가 DMCA 삭제).
//   재생목록은 시즌마다 새로 생성됨 → 매 시즌 ID 갱신 필요 (af 시즌 표기·ts team id 와 동일 관리).
//
// 제목 형식:
//   K리그: "[30분 하이라이트] 하나은행 K리그1 2026 15R 부천 vs 포항 | Bucheon vs Pohang (26.05.17)"
//   NBA:   "#2 SPURS at #1 THUNDER | FULL GAME 7 HIGHLIGHTS | May 30, 2026"
//
// 매칭: 제목에 양 팀 토큰(영문 별칭/도시 + 한글) 모두 포함 + 경기 현지 날짜 ±1일 → videoId 확정.
//
// 실행: tsx --env-file=.env.local src/jobs/fetch-youtube-highlights.ts [--dry]
//       cron: /api/cron/youtube-highlights (vercel.json)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

// 시즌별 공식 "풀 하이라이트" 재생목록 — 매 시즌 갱신 (다음: 2027 시즌 개막 시).
// NBA 제외 — 공식 "Full Game Highlights" 가 한국 지역차단(쿠팡 중계권). availableCountries 에
// KR 없음(24개국, 2026-06-03 확인). 한국 임베드 가능한 공식 소스 부재 → 재업로더는 저작권상 불가.
const HIGHLIGHT_PLAYLISTS: Record<string, string> = {
  K_LEAGUE_1: "PL1596Fd0RtLRyZF8c5ZwcvjRASe0mCg2x", // HIGHLIGHTSㅣ하나은행 K리그1 2026 (@kleaguehighlights)
  K_LEAGUE_2: "PL1596Fd0RtLRXJ0wSAFLjhYpBEr94fBXh", // HIGHLIGHTSㅣ하나은행 K리그2 2026 (@kleaguehighlights)
  NHL: "PL1NbHSfosBuFyu867mbHHhB2G6fx7jtiH", // 2025-2026 NHL Full Game Highlights (공식 @NHL, KR 가능 확인 2026-06-03)
};

// 경기 현지 시간대 (UTC offset, 시간) — 제목의 "경기 날짜" 와 startTime(UTC) 정합용.
const LEAGUE_TZ_OFFSET_H: Record<string, number> = {
  K_LEAGUE_1: 9, // KST
  K_LEAGUE_2: 9, // KST
  NHL: -5, // US Eastern (서머타임/PT 슬랙은 ±1일 윈도가 흡수)
};

const LOOKBACK_DAYS = 12; // 최근 12일 종료 경기만 대상 (재생목록 RSS 가 최근 ~15개라 충분).
const DAY = 24 * 60 * 60 * 1000;

interface FeedEntry {
  videoId: string;
  title: string;
  published: Date;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** 재생목록 RSS → 최근 영상 목록. 실패 시 빈 배열. */
async function fetchPlaylistFeed(playlistId: string): Promise<FeedEntry[]> {
  try {
    const r = await fetch(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) return [];
    const xml = await r.text();
    const entries: FeedEntry[] = [];
    for (const block of xml.split("<entry>").slice(1)) {
      const vid = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
      const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
      const pub = block.match(/<published>([^<]+)<\/published>/)?.[1];
      if (!vid || !titleRaw) continue;
      entries.push({
        videoId: vid,
        title: decodeXmlEntities(titleRaw.trim()),
        published: pub ? new Date(pub) : new Date(0),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

/** 영상이 한국에서 임베드 재생 가능한지 — availableCountries 에 KR + playableInEmbed:true.
 *  지역차단(예: NBA 공식 풀하이라이트=쿠팡 중계권) 영상을 적재 전에 걸러내는 안전장치. */
async function isPlayableInKorea(videoId: string): Promise<boolean> {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return false;
    const html = await r.text();
    if (!/"playableInEmbed":true/.test(html)) return false;
    const ac = html.match(/"availableCountries":\[[^\]]*\]/)?.[0] ?? "";
    return ac.includes('"KR"');
  } catch {
    return false;
  }
}

// 영문 팀명에서 버릴 일반 토큰 (별칭/도시만 남기기).
const GENERIC_TOKENS = new Set([
  "fc", "sc", "cf", "afc", "ac", "cd", "ec", "united", "city", "club", "de",
  "hd", "county", "town", "the", "at", "vs", "1995", "park",
]);

/** 팀 → 제목 매칭용 needle 토큰 집합 (영문 별칭/도시 + 한글). 모두 소문자. */
function teamNeedles(nameEn: string, league: string, shortName: string | null): string[] {
  const set = new Set<string>();
  const en = nameEn.toLowerCase().trim();
  const parts = en.split(/\s+/);
  for (const w of parts) {
    if (w.length >= 3 && !GENERIC_TOKENS.has(w)) set.add(w);
  }
  // 마지막 단어 (보통 별칭: spurs, thunder, timberwolves).
  const last = parts[parts.length - 1];
  if (last && last.length >= 3 && !GENERIC_TOKENS.has(last)) set.add(last);
  // 한글명 토큰 (포항, 울산, 스틸러스 …).
  const ko = toKoreanTeamName(nameEn, league);
  if (ko) {
    for (const w of ko.split(/\s+/)) {
      if (w.length >= 2 && !GENERIC_TOKENS.has(w.toLowerCase())) set.add(w.toLowerCase());
    }
  }
  if (shortName) {
    const s = shortName.toLowerCase().trim();
    if (s.length >= 2 && !GENERIC_TOKENS.has(s)) set.add(s);
  }
  return [...set];
}

function titleHasTeam(needles: string[], titleLower: string): boolean {
  return needles.some((n) => titleLower.includes(n));
}

/** 제목에서 경기 날짜 추출 — K리그 "(26.05.17)" / NBA "May 30, 2026". 실패 시 null. */
function parseTitleDate(title: string): Date | null {
  const kr = title.match(/\((\d{2})\.(\d{2})\.(\d{2})\)/);
  if (kr) {
    return new Date(Date.UTC(2000 + Number(kr[1]), Number(kr[2]) - 1, Number(kr[3])));
  }
  const us = title.match(/([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/);
  if (us) {
    const t = Date.parse(`${us[1]} ${us[2]}, ${us[3]} UTC`);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return null;
}

/** 경기 시작(UTC)을 현지 달력 날짜(UTC 자정)로 정규화. */
function matchLocalDate(startTime: Date, offsetH: number): Date {
  const d = new Date(startTime.getTime() + offsetH * 60 * 60 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayDiff(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / DAY);
}

export interface HighlightRunResult {
  dryRun: boolean;
  byLeague: Record<
    string,
    {
      finished: number;
      matched: number;
      assigned: Array<{ matchId: number; title: string; videoId: string }>;
    }
  >;
}

export async function runYoutubeHighlights(opts?: {
  dryRun?: boolean;
  lookbackDays?: number;
}): Promise<HighlightRunResult> {
  const dryRun = opts?.dryRun ?? false;
  const since = new Date(Date.now() - (opts?.lookbackDays ?? LOOKBACK_DAYS) * DAY);
  const byLeague: HighlightRunResult["byLeague"] = {};

  for (const [league, playlistId] of Object.entries(HIGHLIGHT_PLAYLISTS)) {
    const offsetH = LEAGUE_TZ_OFFSET_H[league] ?? 0;
    const feed = await fetchPlaylistFeed(playlistId);
    const matches = await prisma.match.findMany({
      where: {
        league,
        status: "FINISHED",
        startTime: { gte: since },
        highlightYoutubeId: null,
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: "desc" },
    });

    const out = {
      finished: matches.length,
      matched: 0,
      assigned: [] as Array<{ matchId: number; title: string; videoId: string }>,
    };

    for (const m of matches) {
      const homeNeedles = teamNeedles(m.homeTeam.name, league, m.homeTeam.shortName);
      const awayNeedles = teamNeedles(m.awayTeam.name, league, m.awayTeam.shortName);
      const localDate = matchLocalDate(m.startTime, offsetH);

      const cands = feed
        .map((e) => ({ e, td: parseTitleDate(e.title) ?? e.published }))
        .filter(({ e, td }) => {
          const tl = e.title.toLowerCase();
          if (!titleHasTeam(homeNeedles, tl) || !titleHasTeam(awayNeedles, tl)) {
            return false;
          }
          return dayDiff(localDate, td) <= 1;
        })
        .sort((a, b) => dayDiff(localDate, a.td) - dayDiff(localDate, b.td));

      if (cands.length === 0) continue;
      const best = cands[0].e;

      // 한국 지역차단 영상 차단 — KR 가능 + 임베드 가능 확인 후에만 적재.
      // (NBA 공식 풀하이라이트는 한국 차단 → 자동 skip. K리그는 통과.)
      if (!(await isPlayableInKorea(best.videoId))) continue;

      out.matched += 1;
      out.assigned.push({ matchId: m.id, title: best.title, videoId: best.videoId });

      if (!dryRun) {
        await prisma.match.update({
          where: { id: m.id },
          data: { highlightYoutubeId: best.videoId },
        });
      }
    }

    byLeague[league] = out;
  }

  return { dryRun, byLeague };
}

/** 특정 리그의 highlightYoutubeId 전부 비움 (지역차단 발견 등으로 회수 시). */
export async function clearLeagueHighlights(league: string): Promise<number> {
  const res = await prisma.match.updateMany({
    where: { league, highlightYoutubeId: { not: null } },
    data: { highlightYoutubeId: null },
  });
  return res.count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const clearArg = process.argv.find((a) => a.startsWith("--clear="));
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const task = clearArg
    ? clearLeagueHighlights(clearArg.slice("--clear=".length)).then((n) =>
        console.log(`cleared ${n} highlights (${clearArg.slice("--clear=".length)})`),
      )
    : runYoutubeHighlights({
        dryRun: process.argv.includes("--dry"),
        lookbackDays: daysArg ? Number(daysArg.slice("--days=".length)) : undefined,
      }).then((res) => console.log(JSON.stringify(res, null, 2)));
  task
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
