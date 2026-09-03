// page (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { notFound, permanentRedirect, redirect } from "next/navigation";
import { isTsPlayerId } from "@/lib/links/leaderboard-link";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchPitcherProfileCached as fetchPitcherProfile,
  fetchPitcherRecentCached as fetchPitcherRecent,
  fetchHitterProfileCached as fetchHitterProfile,
  fetchHitterRecentCached as fetchHitterRecent,
} from "@/lib/sports/mlb-cache";
import { MlbHitterView, MlbPitcherView } from "./MlbViews";
import { fetchKboPitcherProfile } from "@/lib/sports/kbo-official";
import { npbTeamJpToKor } from "@/lib/sports/npb-official";
import { fetchNpbPitcherProfileCached as fetchNpbPitcherProfile } from "@/lib/sports/npb-cache";
import { KboPlayerView, NpbPlayerView, npbDisplayName } from "./KboNpbViews";
import { type SoccerPlayerProfile } from "@/lib/sports/api-football-pro";
import { fetchSoccerPlayerProfileCached } from "@/lib/players/soccer-player-cache";

// 요청 스코프 dedupe — generateMetadata 와 본문이 같은 (id, season) 호출을 공유해
// af 쿼터 소모가 기존(요청당 1콜)과 동일하게 유지된다. af 일 한도 소진 사고(3ea74b7) 재발 방지.
// 영속 캐시(unstable_cache, 6h) — React cache() 는 요청 단위라 매 요청 af 를 다시 때렸다.
// 상세 근거는 soccer-player-cache.ts.
const fetchSoccerProfileCached = fetchSoccerPlayerProfileCached;
import { NbaPlayerView } from "./NbaViews";
import { NhlPlayerView } from "./NhlViews";
import { LolPlayerView } from "./LolViews";
import { toEnglishTeamName } from "@/lib/i18n/en";

import { lookupNbaPlayerByBdlId } from "@/lib/sports/nba-players";
import {
  SOCCER_PLAYER_PAGE_LEAGUES,
  SOCCER_PLAYER_PAGE_LEAGUE_SET,
  soccerProfileSeasons,
} from "@/lib/players/soccer-player-page";
import { koEnLanguages } from "@/lib/i18n/en";
import { ChevronLeft } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import ShareCardButton from "@/components/en/ShareCardButton";

// ?league= 를 읽으므로 페이지 자체는 항상 동적이다. 여기에 revalidate 를 걸어도
// force-dynamic 이 이겨 무시되므로(과거 revalidate=600 이 그렇게 죽어 있었다),
// 캐시는 외부 API 호출 단위(mlb-cache·npb-cache)로 건다.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ pid: string }>;
  searchParams: Promise<{ league?: string }>;
}

import { ogPageImage } from "@/lib/seo/og";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pid } = await params;
  const { league } = await searchParams;
  // league 별로 다른 선수 — canonical 에 league param 유지.
  //  단 MLB 는 bare(/players/{pid}) 가 정본 — ?league=MLB 로 들어와도 같은 페이지라 자기중복 방지.
  if (league === "KBO" || league === "NPB") return { title: "Not Found", robots: GOOGLE_NOINDEX };
  const koCanonical = league && league !== "MLB" ? `/players/${pid}?league=${league}` : `/players/${pid}`;
  const canonical = league && league !== "MLB" ? `/en/players/${pid}?league=${league}` : `/en/players/${pid}`;
  if (league === "KBO") {
    const info = await fetchKboPitcherProfile(pid);
    if (!info.name) return { title: "Player not found", robots: GOOGLE_NOINDEX };
    return {
      // 빙 검색 형태 "{선수} 성적/방어율" 커버 — 팀명을 title 로 승격
      title: `${info.name} stats — ${info.team ?? "KBO"} pitcher ERA and recent outings (KBO)`,
      description: `${info.team ?? "KBO"} ${info.name}'s season ERA, WHIP, IP, W-L and recent outings.`,
      alternates: { canonical },
      openGraph: {
        title: `${info.name} — KBO starting pitcher statistics`,
        images: ogPageImage({ title: info.name, subtitle: "KBO starting pitcher season statistics and recent outings", tag: "KBO" }),
      },
    };
  }
  if (league === "NPB") {
    const info = await fetchNpbPitcherProfile(pid);
    if (!info.name) return { title: "Player not found", robots: GOOGLE_NOINDEX };
    const koName = npbDisplayName(info.name, info.kana);
    const teamKo = npbTeamJpToKor(info.team) ?? info.team ?? "NPB";
    return {
      title: `${koName} stats — ${teamKo} pitcher ERA and recent outings (NPB)`,
      description: `${teamKo} ${koName}'s season ERA, WHIP, IP, win-loss record and recent outings.`,
      alternates: { canonical },
      openGraph: {
        title: `${koName} — NPB starting pitcher statistics`,
        images: ogPageImage({ title: koName, subtitle: "NPB starting pitcher season statistics and recent outings", tag: "NPB" }),
      },
    };
  }
  // 축구/NBA/NHL/LOL 등은 metadata 단에서는 generic title 만 반환 (본문에서 별도 fetch).
  // MLB API 로 잘못 fetch 해 404 → 페이지 전체 500 으로 떨어지던 버그 fix.
  const SOCCER_LEAGUES = SOCCER_PLAYER_PAGE_LEAGUES;
  if (league && SOCCER_LEAGUES.includes(league)) {
    // 축구 — 기존엔 "선수 — EPL" 제네릭이라 선수명 검색(빙 실측 파레데스 109노출 등)에
    // 제목이 아예 안 실렸다. 본문과 같은 시즌 폴백 순서로 cached fetch 를 호출하므로
    // React cache dedupe 로 af 실제 콜 수는 기존과 동일(요청당 1회).
    const alternates = {
      canonical,
      languages: koEnLanguages(koCanonical, canonical),
    };
    try {
      const id = Number(pid);
      let profile: SoccerPlayerProfile | null = null;
      if (Number.isFinite(id)) {
        for (const s of soccerProfileSeasons(new Date())) {
          profile = await fetchSoccerProfileCached(id, s);
          if (profile) break;
        }
      }
      if (profile) {
        const nameKo = profile.name || profile.name;
        const main = profile.stats[0];
        const teamKo = main ? (toEnglishTeamName(main.teamName) || main.teamName) : "";
        const POS_KO: Record<string, string> = {
          Attacker: "Forward", Midfielder: "Midfielder", Defender: "Defender", Goalkeeper: "Goalkeeper",
        };
        const posKo = main?.position ? POS_KO[main.position] ?? "" : "";
        const g = main?.goals ?? 0;
        const a = main?.assists ?? 0;
        const statBit = main && (g > 0 || a > 0) ? ` · season ${g}Goals ${a}Assists` : "";
        const who = [teamKo, posKo].filter(Boolean).join(" ");
        return {
          title: `${nameKo} — ${who || "Football player"}${statBit} · profile, stats and transfers`,
          description:
            `${who ? `${who} ` : ""}${nameKo} profile — season appearances, goals, assists and ratings, ` +
            `with transfer history and market value, kept up to date. Scorebase.`,
          alternates,
          openGraph: {
            title: `${nameKo} — ${who || "Football player"} profile`,
            images: ogPageImage({ title: nameKo, subtitle: `${who} season statistics, transfers and market value`, tag: league }),
          },
        };
      }
    } catch {
      // af 실패 시 아래 제네릭 폴백
    }
    return {
      title: `player — ${league}`,
      description: `${league} player profile, statistics and recent games.`,
      alternates,
    };
  }
  if (league && ["NBA", "NHL", "LOL"].includes(league)) {
    // NBA 는 정적 사전(nba-players.json)으로 API 호출 없이 이름·포지션·팀 확보 —
    // 제네릭 "선수 — NBA" 제목은 선수명 검색에 아예 안 실렸다(빙 실측 NBA 노출 0).
    if (league === "NBA") {
      const bdl = Number(pid);
      const info = Number.isFinite(bdl) ? lookupNbaPlayerByBdlId(bdl) : null;
      if (info) {
        const POS_KO: Record<string, string> = { G: "Guard", F: "Forward", C: "Center" };
        const posKo = info.pos ? POS_KO[info.pos.charAt(0)] ?? null : null;
        const teamKo = info.team ? toEnglishTeamName(info.team) || info.team : null;
        const who = [teamKo, posKo].filter(Boolean).join(" ");
        const noBit = info.number != null ? ` #${info.number}` : "";
        return {
          title: `${info.ko} — ${who || "NBA player"}${noBit} · profile and stats`,
          description: `${who ? `${who} ` : "NBA "}${info.ko}(${info.name}) profile — points, rebounds and assists per game, plus game logs, salary and draft information. Scorebase.`,
          keywords: [info.ko, `${info.ko} profile`, `${info.ko} records`, `${info.ko} salary`, info.name, "NBA"],
          alternates: { canonical },
        };
      }
    }
    return {
      title: `player — ${league}`,
      description: `${league} player profile, statistics and recent games.`,
      // NBA/NHL/LOL 은 영어판 미지원 — hreflang 미연결
      alternates: { canonical },
    };
  }
  const id = Number(pid);
  if (!Number.isFinite(id)) return { title: "Not Found", robots: GOOGLE_NOINDEX };
  const yr = new Date().getUTCFullYear();
  // 본문과 동일하게 fetchHitterProfile 로 position 받아 타자/투수 분기 (404 throw 면 generic fallback).
  try {
    const profile = await fetchHitterProfile(id, yr);
    if (!profile) return { title: "Player not found", robots: GOOGLE_NOINDEX };
    const isPitcher = profile.position === "P";
    const koName = profile.name || profile.name;
    // 빙 실측 "{선수} 타율"(이정후 타율 노출 11·클릭 0) — 시즌 스탯을 title 에 숫자로 박아
    // SERP 에서 즉답이 보이게. 스탯은 이미 fetch 한 profile.season 재사용이라 추가 비용 0.
    const s = profile.season;
    const hitterTitle =
      !isPitcher && s?.avg
        ? `${koName} AVG ${s.avg}${s.hr != null ? ` HR ${s.hr}` : ""}${s.ops ? ` OPS ${s.ops}` : ""} — MLB ${yr} stats`
        : `${koName} — MLB hitter statistics`;
    return {
      title: isPitcher ? `${koName} — MLB starting pitcher statistics` : hitterTitle,
      description: isPitcher
        ? `${profile.team ?? ""} ${koName}'s ${yr} season ERA, WHIP, K/9 and recent outings.`
        : `${profile.team ?? ""} ${koName}'s ${yr} season AVG${s?.avg ? ` ${s.avg}` : ""}·HR${s?.hr != null ? ` ${s.hr}` : ""}, RBI, OPS and recent game logs.`,
      alternates: {
        canonical,
        // 영어판(/en/players) hreflang — MLB 는 bare 경로가 정본
        languages: koEnLanguages(koCanonical, canonical),
      },
      openGraph: {
        title: `${koName} — MLB ${isPitcher ? "Starting pitcher" : "Batter"} statistics`,
        images: ogPageImage({ title: koName, subtitle: `MLB ${yr} season statistics and recent games`, tag: "MLB" }),
      },
    };
  } catch {
    return { title: "Player not found", robots: GOOGLE_NOINDEX };
  }
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const { pid } = await params;
  const { league } = await searchParams;

  // 안전망 — 이 페이지는 숫자 id 전용이다. ts player id(문자열)가 들어오면 정본인
  // /transfers/{tsId} 로 넘긴다. 예전에 링크가 여기로 새어 404 가 났다
  // (2026-08-19 /soccer/sub-impact 실측). 야구·농구·하키·LoL 은 자체 id 체계라 제외.
  if (isTsPlayerId(pid) && (!league || SOCCER_PLAYER_PAGE_LEAGUE_SET.has(league))) {
    permanentRedirect(`/transfers/${pid}`);
  }

  // KBO/NPB 도 관련 글 위젯 노출 (기존 MLB 전용 → 3리그 공통)
  // KBO·NPB 는 선수명·팀명·기록 원본이 한국어 전용 — 영어판 미지원
  if (league === "KBO" || league === "NPB") notFound();
  if (league === "NBA") return <NbaPlayerView pid={pid} />;
  if (league === "NHL") return <NhlPlayerView pid={pid} />;
  if (league === "LOL") return <LolPlayerView pid={pid} />;
  // 축구 8개 리그
  if (league && SOCCER_PLAYER_PAGE_LEAGUE_SET.has(league)) {
    // 축구 선수 페이지 단일화 (2026-06-10) — ts 매핑 있으면 /transfers 선수 페이지로
    // 영구 이동 (시장가치·커리어·대회별 스탯 통합본). 매핑 없는 선수는 기존 af 뷰 유지.
    const tsId = afPlayerToTs(pid);
    if (tsId) redirect(`/transfers/${tsId}`);
    return renderSoccerPlayerView(pid, league);
  }

  // MLB (default) — 타자/투수 분기. fetchHitterProfile 한 번으로 person 정보 + position 받음.
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const season = new Date().getUTCFullYear();

  // primaryPosition 으로 분기.
  // MLB 에 없는 id 는 statsapi 404 throw 로 페이지 전체가 500 나던 버그(2026-06-12 실측:
  // league 파라미터 없는 축구 af id 링크·구글 색인 잔존 URL) → 가드 + ts 매핑 구제 redirect.
  let hitterFirst: Awaited<ReturnType<typeof fetchHitterProfile>> = null;
  try {
    hitterFirst = await fetchHitterProfile(id, season);
  } catch {
    hitterFirst = null;
  }
  if (!hitterFirst) {
    // MLB 미존재 — league 없이 들어온 축구 af id 면 통합 선수 페이지로
    const tsId = afPlayerToTs(pid);
    if (tsId) redirect(`/transfers/${tsId}`);
    notFound();
  }
  const isPitcher = hitterFirst.position === "P";

  if (!isPitcher) {
    return (
      <>
        <MlbHitterView
          profile={hitterFirst}
          recent={await fetchHitterRecent(id, season, 10)}
          season={season}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        </div>
      </>
    );
  }

  // === 투수 view ===
  const [profile, recent] = await Promise.all([
    fetchPitcherProfile(id, season),
    fetchPitcherRecent(id, season, 10),
  ]);
  if (!profile) notFound();
  return (
    <>
      <MlbPitcherView profile={profile} recent={recent} season={season} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
      </div>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30" : "bg-neutral-50 dark:bg-white/[0.04]"}`}>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
}

/* ============================================================
 * 축구 선수 view (API-Football)
 * ==========================================================*/

async function renderSoccerPlayerView(pid: string, league: string) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  // 시즌 폴백 — 새 시즌이 아직 데이터를 못 채운 경계 구간에서 통째로 404 나던 것 방지.
  // 상세 근거는 soccerProfileSeasons 주석.
  const seasons = soccerProfileSeasons(new Date());
  let profile: SoccerPlayerProfile | null = null;
  let season = seasons[0];
  for (const s of seasons) {
    profile = await fetchSoccerProfileCached(id, s);
    if (profile) { season = s; break; }
  }
  if (!profile) notFound();

  const nameKo = profile.name || profile.name;
  const main = profile.stats[0];
  const teamKo = main ? (toEnglishTeamName(main.teamName) || main.teamName) : "";

  return (
    <article className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <AmbientGlow />
      <header className="space-y-3">
        <Link
          href={`/en/standings/${league}`}
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> {league}
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photoUrl}
              alt={nameKo}
              width={96}
              height={96}
              className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{nameKo}</h1>
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}</span>}
              <ShareCardButton />
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.nationality ?? ""}
              {profile.height ? ` · ${profile.height}cm` : ""}
              {profile.weight ? ` · ${profile.weight}kg` : ""}
            </div>
            <div className="text-[11px] text-neutral-400">
              API-Football · {season}-{String(season + 1).slice(2)} Season
            </div>
          </div>
        </div>
      </header>

      {main && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {main.leagueName} Season total
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="GP" value={String(main.appearances ?? "—")} accent />
            <Stat label="R" value={String(main.goals ?? 0)} accent />
            <Stat label="Assists" value={String(main.assists ?? 0)} />
            <Stat label="Rating" value={main.rating ? Number(main.rating).toFixed(2) : "—"} />
            <Stat label=" min" value={String(main.minutes ?? "—")} />
            <Stat label="Starter" value={String(main.lineups ?? "—")} />
            <Stat label="Shots / on target" value={`${main.shotsTotal ?? "—"}/${main.shotsOn ?? "—"}`} />
            <Stat label="Passes" value={String(main.passesTotal ?? "—")} />
            <Stat label="Key passes" value={String(main.passesKey ?? "—")} />
            <Stat label="Tackles" value={String(main.tacklesTotal ?? "—")} />
            <Stat label="🟨" value={String(main.yellowCards ?? 0)} />
            <Stat label="🟥" value={String(main.redCards ?? 0)} />
          </div>
        </section>
      )}

      {profile.stats.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Stats by competition ({profile.stats.length})</h2>
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Competition</th>
                  <th className="text-left px-3 py-2 font-medium">Team</th>
                  <th className="text-right px-2 py-2 font-medium">G</th>
                  <th className="text-right px-2 py-2 font-medium">R</th>
                  <th className="text-right px-2 py-2 font-medium">Assists</th>
                  <th className="text-right px-2 py-2 font-medium"> min</th>
                  <th className="text-right px-3 py-2 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {profile.stats.map((s, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 truncate max-w-[200px]">{s.leagueName}</td>
                    <td className="px-3 py-2 truncate max-w-[160px]">
                      {toEnglishTeamName(s.teamName) || s.teamName}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.appearances ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.goals ?? 0}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.assists ?? 0}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.minutes ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.rating ? Number(s.rating).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ Data source: API-Football (api-sports.io). Season stats refresh automatically every day.
      </p>
    </article>
  );
}
