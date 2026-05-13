// 선수(투수) 상세 페이지 — league 별 분기.
//   ?league=KBO  → KBO 공식 (koreabaseball.com) scraping
//   ?league=NPB  → NPB 공식 (npb.jp) scraping + DB 최근 등판
//   default      → MLB Stats API (statsapi.mlb.com)

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchPitcherProfile,
  fetchPitcherRecent,
  type PitcherRecentGame,
} from "@/lib/sports/mlb-stats-api";
import {
  fetchKboPitcherStats,
  fetchKboPitcherRecent,
  fetchKboPitcherProfile,
  calcK9,
  type KboPitcherRecentGame,
} from "@/lib/sports/kbo-official";
import { npbTeamJpToKor } from "@/lib/sports/npb-official";
import {
  fetchNpbPitcherProfileCached as fetchNpbPitcherProfile,
  fetchNpbPitcherStatsCached as fetchNpbPitcherStats,
} from "@/lib/sports/npb-cache";
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
  if (league === "KBO") {
    const info = await fetchKboPitcherProfile(pid);
    if (!info.name) return { title: "선수 미발견" };
    return {
      title: `${info.name} — KBO 선발 투수 통계`,
      description: `${info.team ?? "KBO"} ${info.name} 의 시즌 ERA·WHIP·IP·W-L·최근 등판 결과.`,
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
    };
  }
  const id = Number(pid);
  if (!Number.isFinite(id)) return { title: "Not Found" };
  const profile = await fetchPitcherProfile(id, new Date().getUTCFullYear());
  if (!profile) return { title: "선수 미발견" };
  return {
    title: `${profile.name} — MLB 선발 투수 통계`,
    description: `${profile.team ?? ""} ${profile.name} 의 ${new Date().getUTCFullYear()} 시즌 ERA·WHIP·K/9·최근 등판 결과.`,
  };
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const { pid } = await params;
  const { league } = await searchParams;

  if (league === "KBO") return <KboPlayerView pid={pid} />;
  if (league === "NPB") return <NpbPlayerView pid={pid} />;

  // MLB (default)
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const season = new Date().getUTCFullYear();
  const [profile, recent] = await Promise.all([
    fetchPitcherProfile(id, season),
    fetchPitcherRecent(id, season, 10),
  ]);
  if (!profile) notFound();

  const handLabel =
    profile.hand === "L" ? "좌완" : profile.hand === "R" ? "우완" : "스위치";
  const s = profile.season;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/MLB" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← MLB
        </Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{profile.name}</h1>
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">{handLabel}</span>
          {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
        </div>
        <div className="text-sm text-neutral-500">
          {profile.team ? `${profile.team} · ` : ""}
          {profile.birthCity}{profile.birthCountry ? `, ${profile.birthCountry}` : ""} · MLB Stats API
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

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/leagues/NPB" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← NPB 리그
        </Link>
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
