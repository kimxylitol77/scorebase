// 선수(투수) 상세 페이지 — league 별 분기.
//   ?league=KBO  → KBO 공식 (koreabaseball.com) scraping
//   ?league=NPB  → NPB 공식 (npb.jp) scraping + DB 최근 등판
//   default      → MLB Stats API (statsapi.mlb.com)

import { notFound, permanentRedirect, redirect } from "next/navigation";
import { isTsPlayerId } from "@/lib/links/leaderboard-link";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { isTsPlayerAlive } from "@/lib/players/ts-player-alive";
import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchPitcherProfileCached as fetchPitcherProfile,
  fetchPitcherRecentCached as fetchPitcherRecent,
  fetchHitterProfileCached as fetchHitterProfile,
  fetchHitterRecentCached as fetchHitterRecent,
} from "@/lib/sports/mlb-cache";
import { MlbHitterView, MlbPitcherView } from "./MlbViews";
import PlayerRelatedArticles from "@/components/players/PlayerRelatedArticles";
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
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { lookupNbaPlayerByBdlId } from "@/lib/sports/nba-players";
import {
  SOCCER_PLAYER_PAGE_LEAGUES,
  SOCCER_PLAYER_PAGE_LEAGUE_SET,
  soccerProfileSeasons,
} from "@/lib/players/soccer-player-page";
import { koEnLanguages } from "@/lib/i18n/en";
import { ChevronLeft } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import ShareCardButton from "@/components/ShareCardButton";

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
  const canonical = league && league !== "MLB" ? `/players/${pid}?league=${league}` : `/players/${pid}`;
  if (league === "KBO") {
    const info = await fetchKboPitcherProfile(pid);
    if (!info.name) return { title: "선수 미발견", robots: GOOGLE_NOINDEX };
    return {
      // 빙 검색 형태 "{선수} 성적/방어율" 커버 — 팀명을 title 로 승격
      title: `${info.name} 성적 — ${info.team ?? "KBO"} 투수 ERA·최근 등판 (KBO)`,
      description: `${info.team ?? "KBO"} ${info.name} 의 시즌 ERA(평균자책)·WHIP·IP·W-L·최근 등판 결과.`,
      alternates: { canonical },
      openGraph: {
        title: `${info.name} — KBO 선발 투수 통계`,
        images: ogPageImage({ title: info.name, subtitle: "KBO 선발 투수 시즌 통계·최근 등판", tag: "KBO" }),
      },
    };
  }
  if (league === "NPB") {
    const info = await fetchNpbPitcherProfile(pid);
    if (!info.name) return { title: "선수 미발견", robots: GOOGLE_NOINDEX };
    const koName = npbDisplayName(info.name, info.kana);
    const teamKo = npbTeamJpToKor(info.team) ?? info.team ?? "NPB";
    return {
      title: `${koName} 성적 — ${teamKo} 투수 ERA·최근 등판 (NPB)`,
      description: `${teamKo} ${koName} 의 시즌 ERA(평균자책)·WHIP·IP·승패·최근 등판.`,
      alternates: { canonical },
      openGraph: {
        title: `${koName} — NPB 선발 투수 통계`,
        images: ogPageImage({ title: koName, subtitle: "NPB 선발 투수 시즌 통계·최근 등판", tag: "NPB" }),
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
      languages: koEnLanguages(canonical, `/en/players/${pid}?league=${league}`),
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
        const nameKo = toKoreanPlayerName(profile.name) || profile.name;
        const main = profile.stats[0];
        const teamKo = main ? (toKoreanTeamName(main.teamName) || main.teamName) : "";
        const POS_KO: Record<string, string> = {
          Attacker: "공격수", Midfielder: "미드필더", Defender: "수비수", Goalkeeper: "골키퍼",
        };
        const posKo = main?.position ? POS_KO[main.position] ?? "" : "";
        const g = main?.goals ?? 0;
        const a = main?.assists ?? 0;
        const statBit = main && (g > 0 || a > 0) ? ` · 시즌 ${g}골 ${a}도움` : "";
        const who = [teamKo, posKo].filter(Boolean).join(" ");
        return {
          title: `${nameKo} — ${who || "축구 선수"}${statBit} · 프로필·기록·이적`,
          description:
            `${who ? `${who} ` : ""}${nameKo} 프로필 — 시즌 경기·골·도움·평점 통계, ` +
            `이적 기록과 시장가치(몸값)까지 실시간 데이터로 정리. 스코어베이스.`,
          alternates,
          openGraph: {
            title: `${nameKo} — ${who || "축구 선수"} 프로필`,
            images: ogPageImage({ title: nameKo, subtitle: `${who} 시즌 통계·이적·몸값`, tag: league }),
          },
        };
      }
    } catch {
      // af 실패 시 아래 제네릭 폴백
    }
    return {
      title: `선수 — ${league}`,
      description: `${league} 선수 프로필 · 통계 · 최근 경기.`,
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
        const POS_KO: Record<string, string> = { G: "가드", F: "포워드", C: "센터" };
        const posKo = info.pos ? POS_KO[info.pos.charAt(0)] ?? null : null;
        const teamKo = info.team ? toKoreanTeamName(info.team) || info.team : null;
        const who = [teamKo, posKo].filter(Boolean).join(" ");
        const noBit = info.number != null ? ` 등번호 ${info.number}번` : "";
        return {
          title: `${info.ko} — ${who || "NBA 선수"}${noBit} · 프로필·기록`,
          description: `${who ? `${who} ` : "NBA "}${info.ko}(${info.name}) 프로필 — 시즌 평균 득점·리바운드·어시스트, 경기별 기록과 연봉·드래프트 정보. 스코어베이스.`,
          keywords: [info.ko, `${info.ko} 프로필`, `${info.ko} 기록`, `${info.ko} 연봉`, info.name, "NBA"],
          alternates: { canonical },
        };
      }
    }
    return {
      title: `선수 — ${league}`,
      description: `${league} 선수 프로필 · 통계 · 최근 경기.`,
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
    if (!profile) return { title: "선수 미발견", robots: GOOGLE_NOINDEX };
    const isPitcher = profile.position === "P";
    const koName = toKoreanPlayerName(profile.name) || profile.name;
    // 빙 실측 "{선수} 타율"(이정후 타율 노출 11·클릭 0) — 시즌 스탯을 title 에 숫자로 박아
    // SERP 에서 즉답이 보이게. 스탯은 이미 fetch 한 profile.season 재사용이라 추가 비용 0.
    const s = profile.season;
    const hitterTitle =
      !isPitcher && s?.avg
        ? `${koName} 타율 ${s.avg}${s.hr != null ? ` 홈런 ${s.hr}` : ""}${s.ops ? ` OPS ${s.ops}` : ""} — MLB ${yr} 성적`
        : `${koName} — MLB 타자 성적·통계`;
    return {
      title: isPitcher ? `${koName} — MLB 선발 투수 성적·통계` : hitterTitle,
      description: isPitcher
        ? `${profile.team ?? ""} ${koName} 의 ${yr} 시즌 ERA·WHIP·K/9·최근 등판 결과.`
        : `${profile.team ?? ""} ${koName} 의 ${yr} 시즌 타율${s?.avg ? ` ${s.avg}` : ""}·홈런${s?.hr != null ? ` ${s.hr}개` : ""}·타점·OPS·최근 경기 기록.`,
      alternates: {
        canonical,
        // 영어판(/en/players) hreflang — MLB 는 bare 경로가 정본
        languages: koEnLanguages(canonical, `/en/players/${pid}`),
      },
      openGraph: {
        title: `${koName} — MLB ${isPitcher ? "선발 투수" : "타자"} 통계`,
        images: ogPageImage({ title: koName, subtitle: `MLB ${yr} 시즌 통계·최근 경기`, tag: "MLB" }),
      },
    };
  } catch {
    return { title: "선수 미발견", robots: GOOGLE_NOINDEX };
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
  if (league === "KBO" || league === "NPB") {
    const View = league === "KBO" ? KboPlayerView : NpbPlayerView;
    return (
      <>
        <View pid={pid} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
          <PlayerRelatedArticles pid={pid} name="" />
        </div>
      </>
    );
  }
  if (league === "NBA") return <NbaPlayerView pid={pid} />;
  if (league === "NHL") return <NhlPlayerView pid={pid} />;
  if (league === "LOL") return <LolPlayerView pid={pid} />;
  // 축구 8개 리그
  if (league && SOCCER_PLAYER_PAGE_LEAGUE_SET.has(league)) {
    // 축구 선수 페이지 단일화 (2026-06-10) — ts 매핑 있으면 /transfers 선수 페이지로
    // 영구 이동 (시장가치·커리어·대회별 스탯 통합본). 매핑 없는 선수는 기존 af 뷰 유지.
    const tsId = afPlayerToTs(pid);
    // 매핑이 죽은 ts id 를 가리키면(실측 70건) 리다이렉트가 곧 404 다 — 실재할 때만.
    if (tsId && (await isTsPlayerAlive(tsId))) redirect(`/transfers/${tsId}`);
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
    // 매핑이 죽은 ts id 를 가리키면(실측 70건) 리다이렉트가 곧 404 다 — 실재할 때만.
    if (tsId && (await isTsPlayerAlive(tsId))) redirect(`/transfers/${tsId}`);
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
          <PlayerRelatedArticles pid={pid} name={toKoreanPlayerName(hitterFirst.name) || hitterFirst.name} />
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
        <PlayerRelatedArticles pid={pid} name={toKoreanPlayerName(profile.name) || profile.name} />
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

  const nameKo = toKoreanPlayerName(profile.name) || profile.name;
  const main = profile.stats[0];
  const teamKo = main ? (toKoreanTeamName(main.teamName) || main.teamName) : "";

  return (
    <article className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <AmbientGlow />
      <header className="space-y-3">
        <Link
          href={`/leagues/${league}`}
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
              {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
              <ShareCardButton />
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
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
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
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
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
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
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
