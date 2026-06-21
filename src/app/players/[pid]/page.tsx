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
import { NbaPlayerView } from "./NbaViews";
import { NhlPlayerView } from "./NhlViews";
import { LolPlayerView } from "./LolViews";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";

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
  if (league === "NBA") return <NbaPlayerView pid={pid} />;
  if (league === "NHL") return <NhlPlayerView pid={pid} />;
  if (league === "LOL") return <LolPlayerView pid={pid} />;
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
