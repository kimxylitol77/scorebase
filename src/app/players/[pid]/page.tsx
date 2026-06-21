// 선수(투수) 상세 페이지 — league 별 분기.
//   ?league=KBO  → KBO 공식 (koreabaseball.com) scraping
//   ?league=NPB  → NPB 공식 (npb.jp) scraping + DB 최근 등판
//   default      → MLB Stats API (statsapi.mlb.com)

import { notFound, redirect } from "next/navigation";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchPitcherProfile,
  fetchPitcherRecent,
  fetchHitterProfile,
  fetchHitterRecent,
} from "@/lib/sports/mlb-stats-api";
import { MlbHitterView, MlbPitcherView } from "./MlbViews";
import { fetchKboPitcherProfile } from "@/lib/sports/kbo-official";
import { npbTeamJpToKor } from "@/lib/sports/npb-official";
import { fetchNpbPitcherProfileCached as fetchNpbPitcherProfile } from "@/lib/sports/npb-cache";
import { KboPlayerView, NpbPlayerView, npbDisplayName } from "./KboNpbViews";
import { fetchSoccerPlayerProfile, type SoccerPlayerProfile } from "@/lib/sports/api-football-pro";
import {
  fetchNbaPlayer,
  type NbaPlayerProfile,
  type NbaSeasonAverages,
  type NbaGameStat,
} from "@/lib/sports/balldontlie";
import lolPlayersData from "../../../../data/lol-players.json";
import { aggregateLolPlayers } from "@/lib/sports/lol-player-stats";
import { fetchNbaEspnStats } from "@/lib/sports/espn-nba-player";
import {
  fetchNhlPlayerLanding,
  fetchNhlPlayerGameLog,
  type NhlPlayerLanding,
  type NhlPlayerGameLog,
} from "@/lib/sports/nhl-api";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";

export const dynamic = "force-dynamic";
export const revalidate = 600;

interface Props {
  params: Promise<{ pid: string }>;
  searchParams: Promise<{ league?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pid } = await params;
  const { league } = await searchParams;
  // league 별로 다른 선수 — canonical 에 league param 유지 (없으면 MLB 기본)
  const canonical = league ? `/players/${pid}?league=${league}` : `/players/${pid}`;
  if (league === "KBO") {
    const info = await fetchKboPitcherProfile(pid);
    if (!info.name) return { title: "선수 미발견" };
    return {
      title: `${info.name} — KBO 선발 투수 통계`,
      description: `${info.team ?? "KBO"} ${info.name} 의 시즌 ERA·WHIP·IP·W-L·최근 등판 결과.`,
      alternates: { canonical },
    };
  }
  if (league === "NPB") {
    const info = await fetchNpbPitcherProfile(pid);
    if (!info.name) return { title: "선수 미발견" };
    const koName = npbDisplayName(info.name, info.kana);
    const teamKo = npbTeamJpToKor(info.team) ?? info.team ?? "NPB";
    return {
      title: `${koName} — NPB 선발 투수 통계`,
      description: `${teamKo} ${koName} 의 시즌 ERA·WHIP·IP·승패·최근 등판.`,
      alternates: { canonical },
    };
  }
  // 축구/NBA/NHL/LOL 등은 metadata 단에서는 generic title 만 반환 (본문에서 별도 fetch).
  // MLB API 로 잘못 fetch 해 404 → 페이지 전체 500 으로 떨어지던 버그 fix.
  const SOCCER_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL", "UEL", "UECL", "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL", "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD", "CSL", "A_LEAGUE", "CLUB_WORLD_CUP"];
  if (league && (SOCCER_LEAGUES.includes(league) || ["NBA", "NHL", "LOL"].includes(league))) {
    return {
      title: `선수 — ${league}`,
      description: `${league} 선수 프로필 · 통계 · 최근 경기.`,
      alternates: { canonical },
    };
  }
  const id = Number(pid);
  if (!Number.isFinite(id)) return { title: "Not Found" };
  const yr = new Date().getUTCFullYear();
  // 본문과 동일하게 fetchHitterProfile 로 position 받아 타자/투수 분기 (404 throw 면 generic fallback).
  try {
    const profile = await fetchHitterProfile(id, yr);
    if (!profile) return { title: "선수 미발견" };
    const isPitcher = profile.position === "P";
    return {
      title: isPitcher
        ? `${profile.name} — MLB 선발 투수 통계`
        : `${profile.name} — MLB 타자 통계`,
      description: isPitcher
        ? `${profile.team ?? ""} ${profile.name} 의 ${yr} 시즌 ERA·WHIP·K/9·최근 등판 결과.`
        : `${profile.team ?? ""} ${profile.name} 의 ${yr} 시즌 타율·홈런·타점·OPS·최근 경기 기록.`,
      alternates: { canonical },
    };
  } catch {
    return { title: "선수 미발견" };
  }
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const { pid } = await params;
  const { league } = await searchParams;

  if (league === "KBO") return <KboPlayerView pid={pid} />;
  if (league === "NPB") return <NpbPlayerView pid={pid} />;
  if (league === "NBA") return renderNbaPlayerView(pid);
  if (league === "NHL") return renderNhlPlayerView(pid);
  if (league === "LOL") return renderLolPlayerView(pid);
  // 축구 8개 리그
  if (
    league &&
    ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL", "UEL", "UECL", "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL", "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD", "CSL", "A_LEAGUE", "CLUB_WORLD_CUP"].includes(league)
  ) {
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
      <MlbHitterView
        profile={hitterFirst}
        recent={await fetchHitterRecent(id, season, 10)}
        season={season}
      />
    );
  }

  // === 투수 view ===
  const [profile, recent] = await Promise.all([
    fetchPitcherProfile(id, season),
    fetchPitcherRecent(id, season, 10),
  ]);
  if (!profile) notFound();
  return <MlbPitcherView profile={profile} recent={recent} season={season} />;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30" : "bg-neutral-50 dark:bg-neutral-900"}`}>
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
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const season = m >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const profile = await fetchSoccerPlayerProfile(id, season);
  if (!profile) notFound();

  const nameKo = toKoreanPlayerName(profile.name) || profile.name;
  const main = profile.stats[0];
  const teamKo = main ? (toKoreanTeamName(main.teamName) || main.teamName) : "";

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link
          href={`/leagues/${league}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← {league}
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
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{nameKo}</h1>
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.nationality ?? ""}
              {profile.height ? ` · ${profile.height}cm` : ""}
              {profile.weight ? ` · ${profile.weight}kg` : ""}
            </div>
            <div className="text-[11px] text-neutral-400">
              API-Football · {season}-{String(season + 1).slice(2)} 시즌
            </div>
          </div>
        </div>
      </header>

      {main && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {main.leagueName} 시즌 누적
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="출장" value={String(main.appearances ?? "—")} accent />
            <Stat label="득점" value={String(main.goals ?? 0)} accent />
            <Stat label="도움" value={String(main.assists ?? 0)} />
            <Stat label="평점" value={main.rating ? Number(main.rating).toFixed(2) : "—"} />
            <Stat label="분" value={String(main.minutes ?? "—")} />
            <Stat label="선발" value={String(main.lineups ?? "—")} />
            <Stat label="슛/유효" value={`${main.shotsTotal ?? "—"}/${main.shotsOn ?? "—"}`} />
            <Stat label="패스" value={String(main.passesTotal ?? "—")} />
            <Stat label="키패스" value={String(main.passesKey ?? "—")} />
            <Stat label="태클" value={String(main.tacklesTotal ?? "—")} />
            <Stat label="🟨" value={String(main.yellowCards ?? 0)} />
            <Stat label="🟥" value={String(main.redCards ?? 0)} />
          </div>
        </section>
      )}

      {profile.stats.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">대회별 stats ({profile.stats.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">대회</th>
                  <th className="text-left px-3 py-2 font-medium">팀</th>
                  <th className="text-right px-2 py-2 font-medium">경기</th>
                  <th className="text-right px-2 py-2 font-medium">득점</th>
                  <th className="text-right px-2 py-2 font-medium">도움</th>
                  <th className="text-right px-2 py-2 font-medium">분</th>
                  <th className="text-right px-3 py-2 font-medium">평점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {profile.stats.map((s, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 truncate max-w-[200px]">{s.leagueName}</td>
                    <td className="px-3 py-2 truncate max-w-[160px]">
                      {toKoreanTeamName(s.teamName) || s.teamName}
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
        ⓘ 데이터 출처: API-Football (api-sports.io). 시즌 stats 는 매일 자동 갱신됩니다.
      </p>
    </article>
  );
}

/* ============================================================
 * NBA 선수 view (BALLDONTLIE)
 * ==========================================================*/

// NBA 선수 연봉(USD) → "$52.6M · ₩726억" 표기. TheSports player.salary.
function fmtUsdKrw(usd: number): string {
  const eok = (usd * 1380) / 1e8;
  const krw = eok >= 10000 ? `${(eok / 10000).toFixed(2)}조` : `${Math.round(eok).toLocaleString()}억`;
  return `$${(usd / 1e6).toFixed(1)}M · ₩${krw}`;
}

async function renderNbaPlayerView(pid: string) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const season = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const profile = await fetchNbaPlayer(id);
  if (!profile) notFound();
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const nameKo = toKoreanPlayerName(fullName) || fullName;
  const teamKo = profile.team ? toKoreanTeamName(profile.team.fullName) || profile.team.fullName : "";
  const tsp = lookupNbaPlayer(fullName); // ESPN headshot + TheSports 프로필(생일·출생지·연봉·경력)
  const photo = tsp?.photo;
  // 통계는 BDL plan 401 → 무료 ESPN(overview 시즌평균 + gamelog 최근경기)으로 우회
  const { avg, recent } = tsp?.espnId ? await fetchNbaEspnStats(tsp.espnId) : { avg: null, recent: [] };
  const birth = tsp?.birthday ? new Date(tsp.birthday * 1000) : null;
  const age = birth ? Math.floor((Date.now() - birth.getTime()) / 31557600000) : null;
  const birthStr = birth ? `${birth.getUTCFullYear()}.${String(birth.getUTCMonth() + 1).padStart(2, "0")}.${String(birth.getUTCDate()).padStart(2, "0")}` : null;
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/NBA" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← NBA
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={nameKo} className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 object-cover object-top" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-2xl font-bold text-neutral-400">
              {profile.firstName[0]}{profile.lastName[0]}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{nameKo}</h1>
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.jerseyNumber && <span className="text-sm text-neutral-500">#{profile.jerseyNumber}</span>}
              {age != null && <span className="text-sm text-neutral-500">{age}세</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.height ? `${profile.height} · ` : ""}
              {profile.weight ? `${profile.weight} lbs` : ""}
              {profile.country ? ` · ${profile.country}` : ""}
              {tsp?.city ? ` · 출생 ${tsp.city}` : ""}
            </div>
            {tsp?.salary ? (
              <div className="text-sm">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">연봉 {fmtUsdKrw(tsp.salary)}</span>
                {tsp.careerAge ? <span className="text-neutral-400"> · NBA {tsp.careerAge}년차</span> : null}
              </div>
            ) : null}
            <div className="text-[11px] text-neutral-400">
              BALLDONTLIE · ESPN · TheSports · {season} 시즌
              {profile.draftYear ? ` · ${profile.draftYear} 드래프트 ${profile.draftRound}R ${profile.draftNumber}순위` : ""}
              {birthStr ? ` · ${birthStr} 생` : ""}
            </div>
          </div>
        </div>
      </header>

      {avg ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌 평균 ({avg.gamesPlayed}경기)
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="PTS" value={avg.pts.toFixed(1)} accent />
            <Stat label="REB" value={avg.reb.toFixed(1)} accent />
            <Stat label="AST" value={avg.ast.toFixed(1)} accent />
            <Stat label="STL" value={avg.stl.toFixed(1)} />
            <Stat label="BLK" value={avg.blk.toFixed(1)} />
            <Stat label="MIN" value={avg.min} />
            <Stat label="FG%" value={(avg.fgPct * 100).toFixed(1)} />
            <Stat label="3P%" value={(avg.fg3Pct * 100).toFixed(1)} />
            <Stat label="FT%" value={(avg.ftPct * 100).toFixed(1)} />
            <Stat label="TO" value={avg.turnover.toFixed(1)} />
            <Stat label="OREB" value={avg.oreb.toFixed(1)} />
            <Stat label="DREB" value={avg.dreb.toFixed(1)} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 통계가 없습니다.</p>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 경기 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">{season} 경기 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">일자</th>
                  <th className="text-left px-2 py-2 font-medium">매치</th>
                  <th className="text-right px-2 py-2 font-medium">MIN</th>
                  <th className="text-right px-2 py-2 font-medium">PTS</th>
                  <th className="text-right px-2 py-2 font-medium">REB</th>
                  <th className="text-right px-2 py-2 font-medium">AST</th>
                  <th className="text-right px-2 py-2 font-medium">STL</th>
                  <th className="text-right px-2 py-2 font-medium">BLK</th>
                  <th className="text-right px-3 py-2 font-medium">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recent.map((g) => (
                  <tr key={g.id}>
                    <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.game?.date?.slice(0, 10) ?? "—"}</td>
                    <td className="px-2 py-2 truncate">
                      {g.game ? `${g.game.visitorTeam.abbr} ${g.game.visitorTeamScore} - ${g.game.homeTeamScore} ${g.game.homeTeam.abbr}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.min}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.pts}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.reb}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.ast}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.stl}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.blk}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.plusMinus ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: 기본정보 BALLDONTLIE · 통계·사진 ESPN · 연봉·생일·출생지 TheSports.
      </p>
    </article>
  );
}

/* ============================================================
 * NHL 선수 view (NHL 공식 API)
 * ==========================================================*/

async function renderNhlPlayerView(pid: string) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const profile = await fetchNhlPlayerLanding(id);
  if (!profile) notFound();
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const seasonStart = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const seasonStr = `${seasonStart}${seasonStart + 1}`;
  const recent = await fetchNhlPlayerGameLog(id, seasonStr, 2, 10);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const nameKo = toKoreanPlayerName(fullName) || fullName;
  const teamKo = profile.teamFullName ? toKoreanTeamName(profile.teamFullName) || profile.teamFullName : "";
  const isGoalie = profile.position === "G";
  const f = profile.featured ?? {};
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/NHL" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← NHL
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {profile.headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.headshot}
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
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{nameKo}</h1>
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.jerseyNumber != null && <span className="text-sm text-neutral-500">#{profile.jerseyNumber}</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.shootsCatches ? `${profile.shootsCatches} · ` : ""}
              {profile.birthCountry ?? ""}
            </div>
            <div className="text-[11px] text-neutral-400">
              NHL 공식 API · {seasonStart}-{String(seasonStart + 1).slice(2)} 시즌
              {profile.draftYear ? ` · ${profile.draftYear} 드래프트 ${profile.draftOverall}순위` : ""}
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
          {seasonStart} 시즌 누적
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {isGoalie ? (
            <>
              <Stat label="W-L-OT" value={`${f.wins ?? 0}-${f.losses ?? 0}-${f.otLosses ?? 0}`} accent />
              <Stat label="SV%" value={f.savePctg != null ? f.savePctg.toFixed(3) : "—"} accent />
              <Stat label="GAA" value={f.goalsAgainstAvg != null ? f.goalsAgainstAvg.toFixed(2) : "—"} accent />
              <Stat label="SHO" value={String(f.shutouts ?? 0)} />
              <Stat label="GP" value={String(f.gamesPlayed ?? 0)} />
            </>
          ) : (
            <>
              <Stat label="G" value={String(f.goals ?? 0)} accent />
              <Stat label="A" value={String(f.assists ?? 0)} accent />
              <Stat label="PTS" value={String(f.points ?? 0)} accent />
              <Stat label="+/-" value={String(f.plusMinus ?? "—")} />
              <Stat label="PIM" value={String(f.pim ?? 0)} />
              <Stat label="GP" value={String(f.gamesPlayed ?? 0)} />
              <Stat label="SOG" value={String(f.shots ?? 0)} />
              <Stat label="PP G" value={String(f.powerPlayGoals ?? 0)} />
              <Stat label="SH G" value={String(f.shorthandedGoals ?? 0)} />
              <Stat label="GW G" value={String(f.gameWinningGoals ?? 0)} />
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 경기 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">시즌 경기 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">일자</th>
                  <th className="text-left px-2 py-2 font-medium">상대</th>
                  <th className="text-right px-2 py-2 font-medium">G</th>
                  <th className="text-right px-2 py-2 font-medium">A</th>
                  <th className="text-right px-2 py-2 font-medium">PTS</th>
                  <th className="text-right px-2 py-2 font-medium">+/-</th>
                  <th className="text-right px-2 py-2 font-medium">SOG</th>
                  <th className="text-right px-3 py-2 font-medium">TOI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recent.map((g, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.gameDate}</td>
                    <td className="px-2 py-2 truncate">
                      {g.homeRoadFlag === "H" ? "vs " : "@ "}
                      {g.opponentAbbrev}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.goals}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.assists}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.points}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.plusMinus ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.shots}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.toi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: NHL 공식 API (api-web.nhle.com).
      </p>
    </article>
  );
}

/* ============================================================
 * LOL/LCK 선수 view (BALLDONTLIE match stats 집계)
 * ==========================================================*/

async function renderLolPlayerView(pid: string) {
  const profile = (
    lolPlayersData as {
      players: Record<
        string,
        { name: string; realName: string; photo: string; teamId: string }
      >;
    }
  ).players[pid];
  const agg = (await aggregateLolPlayers()).find((p) => p.playerId === pid);
  if (!profile && !agg) notFound();
  const name = agg?.name || profile?.name || "선수";
  const games = agg?.games ?? 0;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/LOL" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← LCK
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {profile?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo}
              alt=""
              className="w-24 h-24 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 flex items-center justify-center text-3xl font-black text-white">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{name}</h1>
            {profile?.realName && (
              <div className="text-sm text-neutral-500">{profile.realName}</div>
            )}
            <div className="text-sm text-neutral-500">LCK · {games}세트 출전</div>
            <div className="text-[11px] text-neutral-400">TheSports</div>
          </div>
        </div>
      </header>

      {agg && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            시즌 누적
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="KDA" value={agg.kda.toFixed(2)} accent />
            <Stat
              label="K/D/A"
              value={`${(agg.kills / agg.games).toFixed(1)}/${(agg.deaths / agg.games).toFixed(1)}/${(agg.assists / agg.games).toFixed(1)}`}
              accent
            />
            <Stat label="CS" value={agg.csPerGame.toFixed(0)} accent />
            <Stat label="총 킬" value={String(agg.kills)} />
            <Stat label="총 어시" value={String(agg.assists)} />
            <Stat label="세트" value={String(agg.games)} />
          </div>
        </section>
      )}

      {agg && agg.champs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">플레이한 챔피언 ({agg.champs.length})</h2>
          <div className="flex flex-wrap gap-2">
            {agg.champs.map((c) => (
              <span
                key={c}
                className="px-2.5 py-1 rounded-md text-sm border border-neutral-200 dark:border-neutral-800"
              >
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: TheSports LoL (세트별 스코어보드 집계).
      </p>
    </article>
  );
}
