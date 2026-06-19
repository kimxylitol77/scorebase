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
  mlbHeadshotUrl,
  type PitcherRecentGame,
  type HitterRecentGame,
  type HitterProfile,
} from "@/lib/sports/mlb-stats-api";
import {
  fetchKboPitcherStats,
  fetchKboPitcherRecent,
  fetchKboPitcherProfile,
  fetchKboHitterStats,
  fetchKboHitterProfile,
  kboPhotoUrl,
  calcK9,
  type KboPitcherRecentGame,
  type KboHitterStats,
  type KboHitterProfile,
} from "@/lib/sports/kbo-official";
import { npbTeamJpToKor } from "@/lib/sports/npb-official";
import { fetchSoccerPlayerProfile, type SoccerPlayerProfile } from "@/lib/sports/api-football-pro";
import {
  fetchNbaPlayer,
  fetchNbaSeasonAverages,
  fetchNbaPlayerRecentGames,
  fetchLolPlayerSeason,
  type NbaPlayerProfile,
  type NbaSeasonAverages,
  type NbaGameStat,
  type LolPlayerStats,
  type LolMatchRow,
} from "@/lib/sports/balldontlie";
import {
  fetchNhlPlayerLanding,
  fetchNhlPlayerGameLog,
  type NhlPlayerLanding,
  type NhlPlayerGameLog,
} from "@/lib/sports/nhl-api";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";
import {
  fetchNpbPitcherProfileCached as fetchNpbPitcherProfile,
  fetchNpbPitcherStatsCached as fetchNpbPitcherStats,
} from "@/lib/sports/npb-cache";
import {
  fetchNpbHitterStats,
  fetchNpbPhotoUrl,
  type NpbHitterStats,
  type NpbPitcherProfile,
} from "@/lib/sports/npb-official";
import { jpPitcherToKorean } from "@/lib/sports/npb-starters";
import { kanaToKorean } from "@/lib/sports/kana-to-korean";
import { prisma } from "@/lib/db";

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
    // === 타자 view ===
    return renderMlbHitterView(hitterFirst, await fetchHitterRecent(id, season, 10), season);
  }

  // === 투수 view ===
  const [profile, recent] = await Promise.all([
    fetchPitcherProfile(id, season),
    fetchPitcherRecent(id, season, 10),
  ]);
  if (!profile) notFound();

  const handLabel =
    profile.hand === "L" ? "좌완" : profile.hand === "R" ? "우완" : "스위치";
  const s = profile.season;
  const photoUrl = mlbHeadshotUrl(id);

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/MLB" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← MLB
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={profile.name}
            width={96}
            height={96}
            className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{profile.name}</h1>
              {profile.number && <span className="text-xl font-bold text-neutral-400">#{profile.number}</span>}
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">{handLabel}</span>
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {profile.team ? `${profile.team} · ` : ""}
              {profile.birthCity}{profile.birthCountry ? `, ${profile.birthCountry}` : ""} · MLB Stats API
            </div>
            <PlayerBioLine height={profile.height} weight={profile.weight} debut={profile.debut} draft={profile.draft} school={profile.school} />
          </div>
        </div>
      </header>

      {s ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">{season} 시즌 누적</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(s.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(s.whip, 2)} />
            <Stat label="K/9" value={fmtNum(s.k9, 1)} />
            <Stat label="W-L" value={s.wins != null && s.losses != null ? `${s.wins}-${s.losses}` : "—"} />
            <Stat label="GS" value={s.gs != null ? String(s.gs) : "—"} />
            <Stat label="IP" value={s.ip ?? "—"} />
            <Stat label="삼진" value={s.so != null ? String(s.so) : "—"} />
            <Stat label="볼넷" value={s.bb != null ? String(s.bb) : "—"} />
            <Stat label="피홈런" value={s.hra != null ? String(s.hra) : "—"} />
            <Stat label="피안타율" value={s.avg ?? "—"} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 통계가 아직 없습니다.</p>
      )}

      {profile.career && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">통산 (career)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(profile.career.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(profile.career.whip, 2)} />
            <Stat label="W-L" value={profile.career.wins != null && profile.career.losses != null ? `${profile.career.wins}-${profile.career.losses}` : "—"} />
            <Stat label="경기" value={profile.career.games != null ? String(profile.career.games) : "—"} />
            <Stat label="선발" value={profile.career.gs != null ? String(profile.career.gs) : "—"} />
            <Stat label="이닝" value={profile.career.ip ?? "—"} />
            <Stat label="삼진" value={profile.career.so != null ? String(profile.career.so) : "—"} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 등판 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">{season} 등판 기록이 없습니다.</p>
        ) : (
          <MlbRecentGames games={recent} />
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: MLB 공식 Stats API (statsapi.mlb.com).
        ERA / WHIP / K/9 는 시즌 누적이며 매 등판마다 업데이트됩니다.
      </p>
    </article>
  );
}

/* ============================================================
 * KBO 투수 view — koreabaseball.com PitcherDetail.aspx scraping
 * ==========================================================*/
async function KboPlayerView({ pid }: { pid: string }) {
  // 1) 타자 stats 시도 — 데이터 있으면 hitter view (선수 페이지 layout 은 hitter/pitcher 동일)
  const hitter = await fetchKboHitterStats(pid);
  // 핵심 hitter stats (avg/hr/rbi 등) 가 들어있으면 타자로 판단
  if (hitter && (hitter.avg != null || hitter.hr != null || hitter.h != null)) {
    const profile = await fetchKboHitterProfile(pid);
    return renderKboHitterView(pid, profile, hitter);
  }

  // 2) 기존 투수 view
  const [statsRes, recent, profile] = await Promise.all([
    fetchKboPitcherStats(pid),
    fetchKboPitcherRecent(pid),
    fetchKboPitcherProfile(pid),
  ]);
  if (!profile.name && !statsRes) notFound();
  const stats = statsRes;
  const k9 = stats ? calcK9(stats.k, stats.ip) : undefined;
  const name = profile.name ?? "(이름 정보 없음)";
  const team = profile.team ?? stats?.team;
  const season = new Date().getUTCFullYear();
  const handLabel =
    profile.hand === "L" ? "좌완" : profile.hand === "R" ? "우완" : "";
  const batsLabel =
    profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  const handBatsLabel =
    handLabel && batsLabel ? `${handLabel}/${batsLabel}` : (handLabel || batsLabel);

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/KBO" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← KBO 리그
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kboPhotoUrl(pid)}
            alt={name}
            width={96}
            height={96}
            className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{name}</h1>
              {handBatsLabel && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">
                  {handBatsLabel}
                </span>
              )}
              {profile.age != null && (
                <span className="text-sm text-neutral-500">{profile.age}세</span>
              )}
              {profile.number && (
                <span className="text-sm text-neutral-500">{profile.number}</span>
              )}
            </div>
            <div className="text-sm text-neutral-500">
              {team ? `${team} · ` : ""}
              {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
              KBO 공식 (koreabaseball.com)
            </div>
          </div>
        </div>
        {(profile.birthday || profile.career) && (
          <div className="text-xs text-neutral-500 space-y-0.5">
            {profile.birthday && <div>생년월일: {profile.birthday}</div>}
            {profile.career && <div>경력: {profile.career}</div>}
            {profile.position && <div>포지션: {profile.position}</div>}
          </div>
        )}
      </header>

      {stats ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">{season} 시즌 누적</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(stats.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(stats.whip, 2)} />
            <Stat label="K/9" value={fmtNum(k9, 1)} />
            <Stat label="W-L" value={stats.wins != null && stats.losses != null ? `${stats.wins}-${stats.losses}` : "—"} />
            <Stat label="IP" value={stats.ip ?? "—"} />
            <Stat label="QS" value={stats.qs != null ? String(stats.qs) : "—"} />
            <Stat label="삼진" value={stats.k != null ? String(stats.k) : "—"} />
            <Stat label="볼넷" value={stats.bb != null ? String(stats.bb) : "—"} />
            <Stat label="피홈런" value={stats.hr != null ? String(stats.hr) : "—"} />
            <Stat label="피안타율" value={fmtNum(stats.avg, 3)} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 통계가 아직 없습니다.</p>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 등판 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">{season} 등판 기록이 없습니다.</p>
        ) : (
          <KboRecentGames games={recent} />
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: KBO 공식 (koreabaseball.com) · 시즌 누적과 최근 등판 game-by-game.
      </p>
    </article>
  );
}

// 선수 신체/이력 한 줄 (키·몸무게는 한국 독자용 cm·kg 변환). 투수·타자 공통.
function PlayerBioLine({ height, weight, debut, draft, school }: { height?: string; weight?: number; debut?: string; draft?: string; school?: string }) {
  const cm = height?.match(/(\d+)'\s*(\d+)/);
  const hcm = cm ? `${Math.round((Number(cm[1]) * 12 + Number(cm[2])) * 2.54)}cm` : null;
  const phys = hcm && weight ? `${hcm} · ${Math.round(weight * 0.4536)}kg` : hcm;
  const parts = [phys, debut ? `데뷔 ${debut}` : null, draft || null, school || null].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
      {parts.map((p, i) => (<span key={i}>{p}</span>))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30" : "bg-neutral-50 dark:bg-neutral-900"}`}>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function MlbRecentGames({ games }: { games: PitcherRecentGame[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">날짜</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-3 py-2 font-medium">IP</th>
            <th className="text-right px-3 py-2 font-medium">ER</th>
            <th className="text-right px-3 py-2 font-medium">K</th>
            <th className="text-right px-3 py-2 font-medium">BB</th>
            <th className="text-right px-3 py-2 font-medium">H</th>
            <th className="text-right px-3 py-2 font-medium">시즌 ERA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {games.map((g) => (
            <tr key={g.date}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">
                {g.date.slice(5)}
                {g.decision && (
                  <span className={`ml-1.5 inline-block w-4 text-center text-[10px] font-bold rounded ${
                    g.decision === "W" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : g.decision === "L" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}>{g.decision}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                <span className="text-neutral-400 mr-1">{g.isHome ? "vs" : "@"}</span>
                <span className="font-medium">{g.opponent}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{g.ip}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{g.er}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.so}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{g.bb}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{g.hits}</td>
              <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{g.era}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KboRecentGames({ games }: { games: KboPitcherRecentGame[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">날짜</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-3 py-2 font-medium">IP</th>
            <th className="text-right px-3 py-2 font-medium">ER</th>
            <th className="text-right px-3 py-2 font-medium">K</th>
            <th className="text-right px-3 py-2 font-medium">BB</th>
            <th className="text-right px-3 py-2 font-medium">H</th>
            <th className="text-right px-3 py-2 font-medium">경기 ERA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {games.map((g, i) => (
            <tr key={`${g.date}-${i}`}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">
                {g.date}
                {g.result && g.result !== "ND" && (
                  <span className={`ml-1.5 inline-block w-4 text-center text-[10px] font-bold rounded ${
                    g.result === "W" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                  }`}>{g.result}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs font-medium">{g.opponent}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.ip ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{g.er ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.k ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{g.bb ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{g.h ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{fmtNum(g.era, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
}

/* ============================================================
 * NPB 투수 view — npb.jp /bis/players/{pid}.html scraping
 *   + DB 의 같은 pid FINISHED 매치에서 최근 등판 list 추출
 * ==========================================================*/

/**
 * NPB 선수 표시명 — 카나(히라가나) 가 있으면 카나 → 한글 음역(전체).
 * 카나 없으면 jpPitcherToKorean 의 성 매핑만 적용, 그것도 없으면 원어.
 */
function npbDisplayName(jpFullName: string, kana?: string): string {
  if (kana) {
    const ko = kanaToKorean(kana);
    if (ko && /[가-힣]/.test(ko)) return ko;
  }
  const tokens = jpFullName.split(/[\s　]+/).filter(Boolean);
  if (tokens.length === 0) return jpFullName;
  const surnameKo = jpPitcherToKorean(tokens[0]);
  if (surnameKo === tokens[0]) return jpFullName;
  return tokens.length > 1
    ? `${surnameKo} ${tokens.slice(1).join(" ")}`
    : surnameKo;
}

interface NpbRecentGame {
  date: string; // "05.13" KST
  opponent: string;
  isHome: boolean;
  result: "W" | "L" | null; // 팀 승패 (선발 W/L 아님)
  homeScore: number | null;
  awayScore: number | null;
}

async function fetchNpbRecentFromDb(
  pid: string,
  teamFullName: string | undefined,
): Promise<NpbRecentGame[]> {
  if (!teamFullName) return [];
  // homeStarter/awayStarter JSON 안에 `"pid":12345678` 식으로 저장됨
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum)) return [];
  const needle = `"pid":${pidNum}`;
  const seasonStart = new Date(Date.UTC(new Date().getUTCFullYear(), 2, 1)); // 3/1 ~
  const matches = await prisma.match.findMany({
    where: {
      league: "NPB",
      status: "FINISHED",
      startTime: { gte: seasonStart },
      OR: [
        { homeStarter: { contains: needle } },
        { awayStarter: { contains: needle } },
      ],
    },
    select: {
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeStarter: true,
      awayStarter: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "desc" },
    take: 10,
  });
  return matches.map((m) => {
    const isHome = (m.homeStarter ?? "").includes(needle);
    const opponent = isHome ? m.awayTeam.name : m.homeTeam.name;
    const teamScore = isHome ? m.homeScore : m.awayScore;
    const oppScore = isHome ? m.awayScore : m.homeScore;
    const result: "W" | "L" | null =
      teamScore == null || oppScore == null
        ? null
        : teamScore > oppScore
          ? "W"
          : teamScore < oppScore
            ? "L"
            : null;
    const kst = new Date(m.startTime.getTime() + 9 * 3600 * 1000);
    const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(kst.getUTCDate()).padStart(2, "0");
    return {
      date: `${mm}.${dd}`,
      opponent,
      isHome,
      result,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    };
  });
}

async function NpbPlayerView({ pid }: { pid: string }) {
  // 1) 타자 stats 시도 — 데이터 있으면 hitter view
  const hitter = await fetchNpbHitterStats(pid);
  if (hitter && (hitter.avg != null || hitter.hr != null || hitter.hits != null)) {
    const hitterProfile = await fetchNpbPitcherProfile(pid); // 동일 profile 구조
    const photo = await fetchNpbPhotoUrl(pid);
    return renderNpbHitterView(pid, hitterProfile, hitter, photo);
  }

  const [profile, stats] = await Promise.all([
    fetchNpbPitcherProfile(pid),
    fetchNpbPitcherStats(pid),
  ]);
  if (!profile.name && !stats) notFound();
  const season = stats?.season ?? new Date().getUTCFullYear();
  const koName = profile.name
    ? npbDisplayName(profile.name, profile.kana)
    : "(이름 정보 없음)";
  const teamKo = npbTeamJpToKor(profile.team);
  const recent = await fetchNpbRecentFromDb(pid, teamKo);
  const handLabel = profile.hand === "L" ? "좌완" : profile.hand === "R" ? "우완" : "";
  const batsLabel = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  const handBatsLabel =
    handLabel && batsLabel ? `${handLabel}/${batsLabel}` : (handLabel || batsLabel);
  const birthdayKo = profile.birthday
    ? profile.birthday.replace(/年/, "년 ").replace(/月/, "월 ").replace(/日/, "일")
    : undefined;

  const photoUrl = await fetchNpbPhotoUrl(pid);

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/NPB" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← NPB 리그
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={koName}
              width={96}
              height={96}
              className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{koName}</h1>
              {handBatsLabel && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">
                  {handBatsLabel}
                </span>
              )}
              {profile.age != null && (
                <span className="text-sm text-neutral-500">{profile.age}세</span>
              )}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
              NPB 공식 (npb.jp)
            </div>
          </div>
        </div>
        {(birthdayKo || profile.name) && (
          <div className="text-xs text-neutral-500 space-y-0.5">
            {profile.name && (
              <div>
                일본어 이름: {profile.name}
                {profile.kana ? ` (${profile.kana})` : ""}
              </div>
            )}
            {birthdayKo && <div>생년월일: {birthdayKo}</div>}
          </div>
        )}
      </header>

      {stats ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">{season} 시즌 누적</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(stats.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(stats.whip, 2)} />
            <Stat label="K/9" value={fmtNum(stats.k9, 1)} />
            <Stat label="W-L" value={stats.wins != null && stats.losses != null ? `${stats.wins}-${stats.losses}` : "—"} />
            <Stat label="IP" value={stats.ip ?? "—"} />
            <Stat label="G" value={stats.g != null ? String(stats.g) : "—"} />
            <Stat label="삼진" value={stats.k != null ? String(stats.k) : "—"} />
            <Stat label="볼넷" value={stats.bb != null ? String(stats.bb) : "—"} />
            <Stat label="피홈런" value={stats.hra != null ? String(stats.hra) : "—"} />
            <Stat label="자책점" value={stats.er != null ? String(stats.er) : "—"} />
            <Stat label="피안타" value={stats.hits != null ? String(stats.hits) : "—"} />
            <Stat label="완투" value={stats.cg != null ? String(stats.cg) : "—"} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 통계가 아직 없습니다.</p>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 선발 등판 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">
            누적 데이터가 아직 없습니다. 등판 후 1~2일 내 반영됩니다.
          </p>
        ) : (
          <NpbRecentGames games={recent} />
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: NPB 공식 (npb.jp) — 시즌 누적. WHIP·K/9 는 안타·볼넷·삼진·투구이닝으로 직접 계산.
        최근 등판은 scorebase 내부 매치 DB 기준 (선발 확정 매치만).
      </p>
    </article>
  );
}

function NpbRecentGames({ games }: { games: NpbRecentGame[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">날짜</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-3 py-2 font-medium">홈/원정</th>
            <th className="text-right px-3 py-2 font-medium">스코어</th>
            <th className="text-right px-3 py-2 font-medium">팀 결과</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {games.map((g, i) => (
            <tr key={`${g.date}-${i}`}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.date}</td>
              <td className="px-3 py-2 text-xs font-medium">{g.opponent}</td>
              <td className="px-3 py-2 text-right text-xs text-neutral-500">{g.isHome ? "홈" : "원정"}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {g.homeScore != null && g.awayScore != null ? `${g.homeScore} - ${g.awayScore}` : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {g.result ? (
                  <span className={`inline-block w-5 text-center text-[10px] font-bold rounded ${
                    g.result === "W"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                  }`}>{g.result}</span>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
 * MLB 타자 view (외야수·내야수·포수)
 * ==========================================================*/

function renderMlbHitterView(
  profile: HitterProfile,
  recent: HitterRecentGame[],
  season: number,
) {
  const photoUrl = mlbHeadshotUrl(profile.pid);
  const batsLabel =
    profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : profile.bats === "S" ? "스위치" : "";
  const s = profile.season;
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/MLB" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← MLB
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={profile.name}
            width={96}
            height={96}
            className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{profile.name}</h1>
              {profile.number && <span className="text-xl font-bold text-neutral-400">#{profile.number}</span>}
              {batsLabel && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">
                  {batsLabel}
                </span>
              )}
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {profile.team ? `${profile.team} · ` : ""}
              {profile.birthCity}
              {profile.birthCountry ? `, ${profile.birthCountry}` : ""} · MLB Stats API
            </div>
            <PlayerBioLine height={profile.height} weight={profile.weight} debut={profile.debut} draft={profile.draft} school={profile.school} />
          </div>
        </div>
      </header>

      {s ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌 누적
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="타율" value={s.avg ?? "—"} accent />
            <Stat label="OPS" value={s.ops ?? "—"} accent />
            <Stat label="HR" value={s.hr != null ? String(s.hr) : "—"} />
            <Stat label="RBI" value={s.rbi != null ? String(s.rbi) : "—"} />
            <Stat label="SB" value={s.sb != null ? String(s.sb) : "—"} />
            <Stat label="경기" value={s.games != null ? String(s.games) : "—"} />
            <Stat label="OBP" value={s.obp ?? "—"} />
            <Stat label="SLG" value={s.slg ?? "—"} />
            <Stat label="H" value={s.hits != null ? String(s.hits) : "—"} />
            <Stat label="2B" value={s.doubles != null ? String(s.doubles) : "—"} />
            <Stat label="BB" value={s.bb != null ? String(s.bb) : "—"} />
            <Stat label="SO" value={s.so != null ? String(s.so) : "—"} />
            <Stat label="PA" value={s.pa != null ? String(s.pa) : "—"} />
            <Stat label="AB" value={s.ab != null ? String(s.ab) : "—"} />
            <Stat label="3B" value={s.triples != null ? String(s.triples) : "—"} />
            <Stat label="R" value={s.runs != null ? String(s.runs) : "—"} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 타격 통계가 아직 없습니다.</p>
      )}

      {profile.career && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">통산 (career)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="타율" value={profile.career.avg ?? "—"} accent />
            <Stat label="OPS" value={profile.career.ops ?? "—"} accent />
            <Stat label="HR" value={profile.career.hr != null ? String(profile.career.hr) : "—"} />
            <Stat label="RBI" value={profile.career.rbi != null ? String(profile.career.rbi) : "—"} />
            <Stat label="H" value={profile.career.hits != null ? String(profile.career.hits) : "—"} />
            <Stat label="OBP" value={profile.career.obp ?? "—"} />
            <Stat label="SLG" value={profile.career.slg ?? "—"} />
            <Stat label="SB" value={profile.career.sb != null ? String(profile.career.sb) : "—"} />
            <Stat label="R" value={profile.career.runs != null ? String(profile.career.runs) : "—"} />
            <Stat label="경기" value={profile.career.games != null ? String(profile.career.games) : "—"} />
          </div>
        </section>
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
                  <th className="text-left px-3 py-2 font-medium">상대</th>
                  <th className="text-right px-2 py-2 font-medium">AB</th>
                  <th className="text-right px-2 py-2 font-medium">H</th>
                  <th className="text-right px-2 py-2 font-medium">HR</th>
                  <th className="text-right px-2 py-2 font-medium">RBI</th>
                  <th className="text-right px-2 py-2 font-medium">R</th>
                  <th className="text-right px-2 py-2 font-medium">BB</th>
                  <th className="text-right px-2 py-2 font-medium">SO</th>
                  <th className="text-right px-2 py-2 font-medium">SB</th>
                  <th className="text-right px-3 py-2 font-medium">AVG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recent.map((g, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.date}</td>
                    <td className="px-3 py-2 truncate">
                      {g.isHome ? "vs " : "@ "}
                      {g.opponent}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.ab}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.h}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.hr}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.rbi}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.r}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.bb}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.so}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{g.sb}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{g.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: MLB 공식 Stats API (statsapi.mlb.com). 시즌 누적은 매 경기 후 업데이트됩니다.
      </p>
    </article>
  );
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

async function renderNbaPlayerView(pid: string) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const season = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const [profile, avg, recent] = await Promise.all([
    fetchNbaPlayer(id),
    fetchNbaSeasonAverages(id, season),
    fetchNbaPlayerRecentGames(id, season, 10),
  ]);
  if (!profile) notFound();
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const nameKo = toKoreanPlayerName(fullName) || fullName;
  const teamKo = profile.team ? toKoreanTeamName(profile.team.fullName) || profile.team.fullName : "";
  const photo = lookupNbaPlayer(fullName)?.photo; // ESPN headshot (이름 매칭)
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
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.height ? `${profile.height} · ` : ""}
              {profile.weight ? `${profile.weight} lbs` : ""}
              {profile.country ? ` · ${profile.country}` : ""}
            </div>
            <div className="text-[11px] text-neutral-400">
              BALLDONTLIE · {season} 시즌
              {profile.draftYear ? ` · ${profile.draftYear} 드래프트 ${profile.draftRound}R ${profile.draftNumber}순위` : ""}
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
        ⓘ 데이터 출처: BALLDONTLIE NBA API.
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
 * KBO 타자 view
 * ==========================================================*/

function renderKboHitterView(
  pid: string,
  profile: KboHitterProfile,
  stats: KboHitterStats,
) {
  const name = profile.name ?? "(이름 정보 없음)";
  const team = profile.team ?? stats.team;
  const handBatsLabel = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  const season = new Date().getUTCFullYear();
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/KBO" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← KBO 리그
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kboPhotoUrl(pid)}
            alt={name}
            width={96}
            height={96}
            className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{name}</h1>
              {handBatsLabel && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">
                  {handBatsLabel}
                </span>
              )}
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position.replace(/\(.+\)/, "").trim()}
                </span>
              )}
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
              {profile.number && <span className="text-sm text-neutral-500">{profile.number}</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {team ? `${team} · ` : ""}
              {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
              KBO 공식 (koreabaseball.com)
            </div>
          </div>
        </div>
        {(profile.birthday || profile.career) && (
          <div className="text-xs text-neutral-500 space-y-0.5">
            {profile.birthday && <div>생년월일: {profile.birthday}</div>}
            {profile.career && <div>경력: {profile.career}</div>}
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
          {season} 시즌 누적
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Stat label="타율" value={stats.avg ?? "—"} accent />
          <Stat label="OPS" value={stats.obp && stats.slg ? (parseFloat(stats.obp) + parseFloat(stats.slg)).toFixed(3) : "—"} accent />
          <Stat label="HR" value={stats.hr != null ? String(stats.hr) : "—"} />
          <Stat label="RBI" value={stats.rbi != null ? String(stats.rbi) : "—"} />
          <Stat label="SB" value={stats.sb != null ? String(stats.sb) : "—"} />
          <Stat label="경기" value={stats.g != null ? String(stats.g) : "—"} />
          <Stat label="OBP" value={stats.obp ?? "—"} />
          <Stat label="SLG" value={stats.slg ?? "—"} />
          <Stat label="H" value={stats.h != null ? String(stats.h) : "—"} />
          <Stat label="2B" value={stats.d2b != null ? String(stats.d2b) : "—"} />
          <Stat label="BB" value={stats.bb != null ? String(stats.bb) : "—"} />
          <Stat label="SO" value={stats.so != null ? String(stats.so) : "—"} />
        </div>
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: KBO 공식 (koreabaseball.com). 시즌 누적은 매 경기 후 업데이트됩니다.
      </p>
    </article>
  );
}

/* ============================================================
 * NPB 타자 view
 * ==========================================================*/

function renderNpbHitterView(
  pid: string,
  profile: NpbPitcherProfile,
  stats: NpbHitterStats,
  photoUrl: string | undefined,
) {
  const koName = profile.name ? npbDisplayName(profile.name, profile.kana) : "(이름 정보 없음)";
  const teamKo = npbTeamJpToKor(profile.team);
  const batsLabel = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  const ops = stats.obp != null && stats.slg != null ? (stats.obp + stats.slg).toFixed(3) : "—";
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/NPB" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← NPB 리그
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={koName}
              width={96}
              height={96}
              className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{koName}</h1>
              {batsLabel && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">
                  {batsLabel}
                </span>
              )}
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
              NPB 공식 (npb.jp)
            </div>
            {profile.name && (
              <div className="text-[11px] text-neutral-400">
                일본어 이름: {profile.name}
                {profile.kana ? ` (${profile.kana})` : ""}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
          {stats.season} 시즌 누적
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Stat label="타율" value={stats.avg != null ? stats.avg.toFixed(3) : "—"} accent />
          <Stat label="OPS" value={ops} accent />
          <Stat label="HR" value={stats.hr != null ? String(stats.hr) : "—"} />
          <Stat label="RBI" value={stats.rbi != null ? String(stats.rbi) : "—"} />
          <Stat label="SB" value={stats.sb != null ? String(stats.sb) : "—"} />
          <Stat label="경기" value={stats.g != null ? String(stats.g) : "—"} />
          <Stat label="OBP" value={stats.obp != null ? stats.obp.toFixed(3) : "—"} />
          <Stat label="SLG" value={stats.slg != null ? stats.slg.toFixed(3) : "—"} />
          <Stat label="H" value={stats.hits != null ? String(stats.hits) : "—"} />
          <Stat label="2B" value={stats.d2b != null ? String(stats.d2b) : "—"} />
          <Stat label="BB" value={stats.bb != null ? String(stats.bb) : "—"} />
          <Stat label="SO" value={stats.so != null ? String(stats.so) : "—"} />
        </div>
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: NPB 공식 (npb.jp). 시즌 누적은 매 경기 후 업데이트됩니다.
      </p>
    </article>
  );
}

/* ============================================================
 * LOL/LCK 선수 view (BALLDONTLIE match stats 집계)
 * ==========================================================*/

async function renderLolPlayerView(pid: string) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const now = new Date();
  // LoL 시즌은 1~12월. 봄/여름 split 도 같은 tournament_id 안 — 1월 시작 기준.
  const season = now.getUTCFullYear();
  const { stats, recent } = await fetchLolPlayerSeason(id, season);
  if (!stats) notFound();

  const roleLabel = (r?: string) => {
    if (!r) return "";
    const m: Record<string, string> = {
      top: "탑", jungle: "정글", mid: "미드", bottom: "원딜", support: "서폿",
    };
    return m[r.toLowerCase()] ?? r;
  };

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/LOL" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← LCK
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 flex items-center justify-center text-3xl font-black text-white">
            {stats.nickname.slice(0, 1).toUpperCase()}
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{stats.nickname}</h1>
              {stats.primaryRole && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {roleLabel(stats.primaryRole)}
                </span>
              )}
            </div>
            <div className="text-sm text-neutral-500">
              {stats.team ? `${stats.team} · ` : ""}
              {stats.matches}경기 출전
            </div>
            <div className="text-[11px] text-neutral-400">
              BALLDONTLIE · {season} 시즌 (LCK)
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
          시즌 누적 — 평균
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Stat label="KDA" value={stats.kda.toFixed(2)} accent />
          <Stat
            label="K/D/A"
            value={`${stats.killsAvg.toFixed(1)}/${stats.deathsAvg.toFixed(1)}/${stats.assistsAvg.toFixed(1)}`}
            accent
          />
          <Stat label="CS" value={stats.csAvg.toFixed(1)} accent />
          <Stat label="골드" value={Math.round(stats.goldAvg).toLocaleString()} />
          <Stat label="딜량" value={Math.round(stats.damageAvg).toLocaleString()} />
          <Stat label="와드" value={stats.wardsAvg.toFixed(1)} />
          <Stat label="총 킬" value={String(stats.kills)} />
          <Stat label="총 데스" value={String(stats.deaths)} />
          <Stat label="총 어시" value={String(stats.assists)} />
          <Stat label="경기" value={String(stats.matches)} />
        </div>
      </section>

      {stats.topChampions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">자주 픽한 챔피언 ({stats.topChampions.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {stats.topChampions.map((c) => (
              <div
                key={c.name}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center"
              >
                <div className="text-sm font-semibold truncate">{c.name}</div>
                <div className="text-xs text-neutral-500 mt-1">{c.picks}판</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">최근 경기 ({recent.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">챔피언</th>
                  <th className="text-left px-2 py-2 font-medium">포지션</th>
                  <th className="text-right px-2 py-2 font-medium">K/D/A</th>
                  <th className="text-right px-2 py-2 font-medium">CS</th>
                  <th className="text-right px-2 py-2 font-medium">골드</th>
                  <th className="text-right px-2 py-2 font-medium">딜량</th>
                  <th className="text-right px-3 py-2 font-medium">와드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recent.map((m) => (
                  <tr key={m.matchMapId}>
                    <td className="px-3 py-2 font-semibold truncate">{m.champion}</td>
                    <td className="px-2 py-2 text-xs text-neutral-500">{roleLabel(m.role)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {m.kills}/{m.deaths}/{m.assists}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{m.cs}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {m.gold.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {m.damage.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.wards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: BALLDONTLIE LoL API (player_match_map_stats 집계).
      </p>
    </article>
  );
}
