// KBO·NPB 선수 탭 뷰 — KBO 4탭(개요/시즌기록/경기/스플릿), NPB 3탭(스플릿 미제공).
// KBO=koreabaseball.com, NPB=npb.jp 스크래핑. MLB 와 동일 PlayerTabs·SeasonTable·SplitsView 재사용.

import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  fetchKboPitcherDetail,
  fetchKboPitcherProfile,
  fetchKboHitterStats,
  fetchKboHitterProfile,
  kboPhotoUrl,
  calcK9,
  type KboPitcherRecentGame,
  type KboPitcherProfile,
  type KboHitterProfile,
  type KboHitterStats,
} from "@/lib/sports/kbo-official";
import {
  fetchNpbHitterStats,
  fetchNpbPhotoUrl,
  npbTeamJpToKor,
  type NpbPitcherProfile,
  type NpbHitterStats,
} from "@/lib/sports/npb-official";
import {
  fetchNpbPitcherProfileCached as fetchNpbPitcherProfile,
  fetchNpbPitcherStatsCached as fetchNpbPitcherStats,
} from "@/lib/sports/npb-cache";
import { jpPitcherToKorean } from "@/lib/sports/npb-starters";
import { kanaToKorean } from "@/lib/sports/kana-to-korean";
import {
  getKboPitcherYearly,
  getKboHitterYearly,
  getKboSplits,
  getNpbPitcherYearly,
  getNpbHitterYearly,
} from "@/lib/sports/baseball-player-extras";
import type {
  PitcherSeasonRow,
  HitterSeasonRow,
  PlayerSplits,
} from "@/lib/sports/mlb-player-extras";
import { prisma } from "@/lib/db";
import PlayerTabs from "./PlayerTabs";
import { HitterSeasonTable, PitcherSeasonTable } from "./SeasonTable";
import SplitsView from "./SplitsView";

/* ---------- 공통 헬퍼 ---------- */

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        accent
          ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30"
          : "bg-neutral-50 dark:bg-neutral-900"
      }`}
    >
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const badge = (text: string, cls: string) => (
  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>{text}</span>
);

function Header({
  backHref,
  backLabel,
  photoUrl,
  name,
  badges,
  sub,
  extra,
}: {
  backHref: string;
  backLabel: string;
  photoUrl?: string;
  name: string;
  badges: ReactNode;
  sub: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Link
        href={backHref}
        className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
      >
        ← {backLabel}
      </Link>
      <div className="flex items-center gap-4 flex-wrap">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name}
            width={96}
            height={96}
            className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
        )}
        <div className="space-y-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{name}</h1>
            {badges}
          </div>
          <div className="text-sm text-neutral-500">{sub}</div>
          {extra}
        </div>
      </div>
    </header>
  );
}

function PitcherCareerCard({ c, label }: { c: PitcherSeasonRow; label?: string }) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
        {label ?? "통산 (career)"}
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <Stat label="ERA" value={c.era ?? "—"} accent />
        <Stat label="WHIP" value={c.whip ?? "—"} />
        <Stat
          label="W-L"
          value={c.w != null && c.l != null ? `${c.w}-${c.l}` : "—"}
        />
        <Stat label="SV" value={c.sv != null ? String(c.sv) : "—"} />
        <Stat label="IP" value={c.ip ?? "—"} />
        <Stat label="삼진" value={c.so != null ? String(c.so) : "—"} />
      </div>
    </section>
  );
}

function HitterCareerCard({ c, label }: { c: HitterSeasonRow; label?: string }) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
        {label ?? "통산 (career)"}
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <Stat label="타율" value={c.avg ?? "—"} accent />
        <Stat label="OPS" value={c.ops ?? "—"} accent />
        <Stat label="HR" value={c.hr != null ? String(c.hr) : "—"} />
        <Stat label="RBI" value={c.rbi != null ? String(c.rbi) : "—"} />
        <Stat label="H" value={c.h != null ? String(c.h) : "—"} />
        <Stat label="OBP" value={c.obp ?? "—"} />
        <Stat label="SLG" value={c.slg ?? "—"} />
        <Stat label="SB" value={c.sb != null ? String(c.sb) : "—"} />
        <Stat label="R" value={c.r != null ? String(c.r) : "—"} />
      </div>
    </section>
  );
}

function Footer({ source }: { source: string }) {
  return (
    <p className="text-[11px] text-neutral-500 leading-relaxed">ⓘ 데이터 출처: {source}</p>
  );
}

// 데이터 있는 탭만 — filter(Boolean) 후 타입 보존.
type Tab = { key: string; label: string; content: ReactNode };
const tabsOf = (arr: (Tab | false | null | undefined)[]): Tab[] =>
  arr.filter((t): t is Tab => Boolean(t));

const hasSplits = (s: PlayerSplits): boolean =>
  Boolean(s.vsLeft || s.vsRight || s.home || s.away || s.byMonth.length > 0);

/* ============================================================
 * KBO
 * ==========================================================*/

function KboRecentGames({ games }: { games: KboPitcherRecentGame[] }) {
  if (games.length === 0)
    return <p className="text-sm text-neutral-500">최근 등판 기록이 없습니다.</p>;
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">날짜</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-2 py-2 font-medium">IP</th>
            <th className="text-right px-2 py-2 font-medium">ER</th>
            <th className="text-right px-2 py-2 font-medium">K</th>
            <th className="text-right px-2 py-2 font-medium">BB</th>
            <th className="text-right px-2 py-2 font-medium">H</th>
            <th className="text-right px-3 py-2 font-medium">경기 ERA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {games.map((g, i) => (
            <tr key={`${g.date}-${i}`}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">
                {g.date}
                {g.result && g.result !== "ND" && (
                  <span
                    className={`ml-1.5 inline-block w-4 text-center text-[10px] font-bold rounded ${
                      g.result === "W"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                    }`}
                  >
                    {g.result}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs font-medium">{g.opponent}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.ip ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.er ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.k ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.bb ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.h ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">
                {fmtNum(g.era, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function kboHandBats(profile: { hand?: "L" | "R"; bats?: "L" | "R" }): string {
  const h = profile.hand === "L" ? "좌투" : profile.hand === "R" ? "우투" : "";
  const b = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  return h && b ? `${h}/${b}` : h || b;
}

async function KboPitcherView({
  pid,
  profile,
  stats,
  recent,
}: {
  pid: string;
  profile: KboPitcherProfile;
  stats: Awaited<ReturnType<typeof fetchKboPitcherDetail>>["stats"];
  recent: KboPitcherRecentGame[];
}) {
  const [yearly, splits] = await Promise.all([
    getKboPitcherYearly(pid),
    getKboSplits(pid, "pitching"),
  ]);
  const name = profile.name ?? "(이름 정보 없음)";
  const team = profile.team ?? stats?.team;
  const season = new Date().getUTCFullYear();
  const k9 = stats ? calcK9(stats.k, stats.ip) : undefined;
  const handBats = kboHandBats(profile);

  const overview = (
    <>
      {stats && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(stats.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(stats.whip, 2)} accent />
            <Stat label="K/9" value={fmtNum(k9, 1)} />
            <Stat
              label="W-L"
              value={stats.wins != null && stats.losses != null ? `${stats.wins}-${stats.losses}` : "—"}
            />
            <Stat label="IP" value={stats.ip ?? "—"} />
            <Stat label="QS" value={stats.qs != null ? String(stats.qs) : "—"} />
            <Stat label="삼진" value={stats.k != null ? String(stats.k) : "—"} />
            <Stat label="볼넷" value={stats.bb != null ? String(stats.bb) : "—"} />
            <Stat label="피홈런" value={stats.hr != null ? String(stats.hr) : "—"} />
            <Stat label="피안타율" value={fmtNum(stats.avg, 3)} />
          </div>
        </section>
      )}
      {yearly.career && <PitcherCareerCard c={yearly.career} />}
    </>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Header
        backHref="/leagues/KBO"
        backLabel="KBO 리그"
        photoUrl={kboPhotoUrl(pid)}
        name={name}
        badges={
          <>
            {handBats && badge(handBats, "bg-neutral-100 dark:bg-neutral-800")}
            {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
            {profile.number && <span className="text-sm text-neutral-500">{profile.number}</span>}
          </>
        }
        sub={
          <>
            {team ? `${team} · ` : ""}
            {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
            KBO 공식 (koreabaseball.com)
          </>
        }
        extra={
          (profile.birthday || profile.career) && (
            <div className="text-xs text-neutral-500 space-y-0.5">
              {profile.birthday && <div>생년월일: {profile.birthday}</div>}
              {profile.career && <div>경력: {profile.career}</div>}
            </div>
          )
        }
      />
      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          yearly.seasons.length > 0 && {
            key: "seasons",
            label: "시즌기록",
            content: <PitcherSeasonTable rows={yearly.seasons} />,
          },
          recent.length > 0 && {
            key: "games",
            label: "경기",
            content: <KboRecentGames games={recent} />,
          },
          hasSplits(splits) && {
            key: "splits",
            label: "스플릿",
            content: <SplitsView splits={splits} group="pitching" />,
          },
        ])}
      />
      <Footer source="KBO 공식 (koreabaseball.com) · 연도별·스플릿 기록 포함" />
    </article>
  );
}

async function KboHitterView({
  pid,
  profile,
  stats,
}: {
  pid: string;
  profile: KboHitterProfile;
  stats: KboHitterStats;
}) {
  const [yearly, splits] = await Promise.all([
    getKboHitterYearly(pid),
    getKboSplits(pid, "hitting"),
  ]);
  const name = profile.name ?? "(이름 정보 없음)";
  const team = profile.team ?? stats.team;
  const season = new Date().getUTCFullYear();
  const batsLabel = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  const ops =
    stats.obp && stats.slg ? (parseFloat(stats.obp) + parseFloat(stats.slg)).toFixed(3) : "—";

  const overview = (
    <>
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
          {season} 시즌
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Stat label="타율" value={stats.avg ?? "—"} accent />
          <Stat label="OPS" value={ops} accent />
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
      {yearly.career && <HitterCareerCard c={yearly.career} />}
    </>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Header
        backHref="/leagues/KBO"
        backLabel="KBO 리그"
        photoUrl={kboPhotoUrl(pid)}
        name={name}
        badges={
          <>
            {batsLabel && badge(batsLabel, "bg-neutral-100 dark:bg-neutral-800")}
            {profile.position &&
              badge(
                profile.position.replace(/\(.+\)/, "").trim(),
                "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
              )}
            {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
            {profile.number && <span className="text-sm text-neutral-500">{profile.number}</span>}
          </>
        }
        sub={
          <>
            {team ? `${team} · ` : ""}
            {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
            KBO 공식 (koreabaseball.com)
          </>
        }
        extra={
          (profile.birthday || profile.career) && (
            <div className="text-xs text-neutral-500 space-y-0.5">
              {profile.birthday && <div>생년월일: {profile.birthday}</div>}
              {profile.career && <div>경력: {profile.career}</div>}
            </div>
          )
        }
      />
      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          yearly.seasons.length > 0 && {
            key: "seasons",
            label: "시즌기록",
            content: <HitterSeasonTable rows={yearly.seasons} />,
          },
          hasSplits(splits) && {
            key: "splits",
            label: "스플릿",
            content: <SplitsView splits={splits} group="hitting" />,
          },
        ])}
      />
      <Footer source="KBO 공식 (koreabaseball.com) · 연도별·스플릿 기록 포함" />
    </article>
  );
}

export async function KboPlayerView({ pid }: { pid: string }) {
  const hitter = await fetchKboHitterStats(pid);
  if (hitter && (hitter.avg != null || hitter.hr != null || hitter.h != null)) {
    const profile = await fetchKboHitterProfile(pid);
    return <KboHitterView pid={pid} profile={profile} stats={hitter} />;
  }
  const [detail, profile] = await Promise.all([
    fetchKboPitcherDetail(pid),
    fetchKboPitcherProfile(pid),
  ]);
  if (!profile.name && !detail.stats) notFound();
  return (
    <KboPitcherView pid={pid} profile={profile} stats={detail.stats} recent={detail.recent} />
  );
}

/* ============================================================
 * NPB (스플릿 미제공 → 개요/시즌기록/경기)
 * ==========================================================*/

// NPB 표시명 — 카나 음역 우선, 없으면 성 매핑. (metadata 도 재사용 → export)
export function npbDisplayName(jpFullName: string, kana?: string): string {
  if (kana) {
    const ko = kanaToKorean(kana);
    if (ko && /[가-힣]/.test(ko)) return ko;
  }
  const tokens = jpFullName.split(/[\s　]+/).filter(Boolean);
  if (tokens.length === 0) return jpFullName;
  const surnameKo = jpPitcherToKorean(tokens[0]);
  if (surnameKo === tokens[0]) return jpFullName;
  return tokens.length > 1 ? `${surnameKo} ${tokens.slice(1).join(" ")}` : surnameKo;
}

interface NpbDbGame {
  date: string;
  opponent: string;
  isHome: boolean;
  result: "W" | "L" | null;
  homeScore: number | null;
  awayScore: number | null;
}

async function fetchNpbRecentFromDb(
  pid: string,
  teamFullName: string | undefined,
): Promise<NpbDbGame[]> {
  if (!teamFullName) return [];
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum)) return [];
  const needle = `"pid":${pidNum}`;
  const seasonStart = new Date(Date.UTC(new Date().getUTCFullYear(), 2, 1));
  const matches = await prisma.match.findMany({
    where: {
      league: "NPB",
      status: "FINISHED",
      startTime: { gte: seasonStart },
      OR: [{ homeStarter: { contains: needle } }, { awayStarter: { contains: needle } }],
    },
    select: {
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeStarter: true,
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

function NpbRecentGames({ games }: { games: NpbDbGame[] }) {
  if (games.length === 0)
    return (
      <p className="text-sm text-neutral-500">
        누적 데이터가 아직 없습니다. 등판 후 1~2일 내 반영됩니다.
      </p>
    );
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
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
              <td className="px-3 py-2 text-right text-xs text-neutral-500">
                {g.isHome ? "홈" : "원정"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {g.homeScore != null && g.awayScore != null
                  ? `${g.homeScore} - ${g.awayScore}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {g.result ? (
                  <span
                    className={`inline-block w-5 text-center text-[10px] font-bold rounded ${
                      g.result === "W"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                    }`}
                  >
                    {g.result}
                  </span>
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

function npbHandBats(profile: { hand?: "L" | "R"; bats?: "L" | "R" }): string {
  const h = profile.hand === "L" ? "좌투" : profile.hand === "R" ? "우투" : "";
  const b = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  return h && b ? `${h}/${b}` : h || b;
}

async function NpbPitcherView({
  pid,
  profile,
  stats,
  photo,
}: {
  pid: string;
  profile: NpbPitcherProfile;
  stats: Awaited<ReturnType<typeof fetchNpbPitcherStats>>;
  photo?: string;
}) {
  const teamKo = npbTeamJpToKor(profile.team);
  const [yearly, recent] = await Promise.all([
    getNpbPitcherYearly(pid),
    fetchNpbRecentFromDb(pid, teamKo),
  ]);
  const koName = profile.name ? npbDisplayName(profile.name, profile.kana) : "(이름 정보 없음)";
  const season = stats?.season ?? new Date().getUTCFullYear();
  const handBats = npbHandBats(profile);
  const birthdayKo = profile.birthday
    ? profile.birthday.replace(/年/, "년 ").replace(/月/, "월 ").replace(/日/, "일")
    : undefined;

  const overview = (
    <>
      {stats && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(stats.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(stats.whip, 2)} accent />
            <Stat label="K/9" value={fmtNum(stats.k9, 1)} />
            <Stat
              label="W-L"
              value={stats.wins != null && stats.losses != null ? `${stats.wins}-${stats.losses}` : "—"}
            />
            <Stat label="IP" value={stats.ip ?? "—"} />
            <Stat label="G" value={stats.g != null ? String(stats.g) : "—"} />
            <Stat label="삼진" value={stats.k != null ? String(stats.k) : "—"} />
            <Stat label="볼넷" value={stats.bb != null ? String(stats.bb) : "—"} />
            <Stat label="피홈런" value={stats.hra != null ? String(stats.hra) : "—"} />
            <Stat label="자책점" value={stats.er != null ? String(stats.er) : "—"} />
          </div>
        </section>
      )}
      {yearly.career && <PitcherCareerCard c={yearly.career} />}
    </>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Header
        backHref="/leagues/NPB"
        backLabel="NPB 리그"
        photoUrl={photo}
        name={koName}
        badges={
          <>
            {handBats && badge(handBats, "bg-neutral-100 dark:bg-neutral-800")}
            {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
          </>
        }
        sub={
          <>
            {teamKo ? `${teamKo} · ` : ""}
            {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
            NPB 공식 (npb.jp)
          </>
        }
        extra={
          (birthdayKo || profile.name) && (
            <div className="text-xs text-neutral-500 space-y-0.5">
              {profile.name && (
                <div>
                  일본어 이름: {profile.name}
                  {profile.kana ? ` (${profile.kana})` : ""}
                </div>
              )}
              {birthdayKo && <div>생년월일: {birthdayKo}</div>}
            </div>
          )
        }
      />
      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          yearly.seasons.length > 0 && {
            key: "seasons",
            label: "시즌기록",
            content: <PitcherSeasonTable rows={yearly.seasons} />,
          },
          {
            key: "games",
            label: "경기",
            content: <NpbRecentGames games={recent} />,
          },
        ])}
      />
      <Footer source="NPB 공식 (npb.jp) · 최근 등판은 scorebase 매치 DB" />
    </article>
  );
}

async function NpbHitterView({
  pid,
  profile,
  stats,
  photo,
}: {
  pid: string;
  profile: NpbPitcherProfile;
  stats: NpbHitterStats;
  photo?: string;
}) {
  const yearly = await getNpbHitterYearly(pid);
  const koName = profile.name ? npbDisplayName(profile.name, profile.kana) : "(이름 정보 없음)";
  const teamKo = npbTeamJpToKor(profile.team);
  const batsLabel = profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : "";
  const ops = stats.obp != null && stats.slg != null ? (stats.obp + stats.slg).toFixed(3) : "—";

  const overview = (
    <>
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
          {stats.season} 시즌
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
      {yearly.career && <HitterCareerCard c={yearly.career} />}
    </>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Header
        backHref="/leagues/NPB"
        backLabel="NPB 리그"
        photoUrl={photo}
        name={koName}
        badges={
          <>
            {batsLabel && badge(batsLabel, "bg-neutral-100 dark:bg-neutral-800")}
            {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
          </>
        }
        sub={
          <>
            {teamKo ? `${teamKo} · ` : ""}
            {profile.height && profile.weight ? `${profile.height}/${profile.weight} · ` : ""}
            NPB 공식 (npb.jp)
          </>
        }
        extra={
          profile.name && (
            <div className="text-[11px] text-neutral-400">
              일본어 이름: {profile.name}
              {profile.kana ? ` (${profile.kana})` : ""}
            </div>
          )
        }
      />
      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          yearly.seasons.length > 0 && {
            key: "seasons",
            label: "시즌기록",
            content: <HitterSeasonTable rows={yearly.seasons} />,
          },
        ])}
      />
      <Footer source="NPB 공식 (npb.jp)" />
    </article>
  );
}

export async function NpbPlayerView({ pid }: { pid: string }) {
  const [profile, pStats] = await Promise.all([
    fetchNpbPitcherProfile(pid),
    fetchNpbPitcherStats(pid),
  ]);
  // NPB 투수는 tablefix_b 에 타격이 채워지는 변칙이 있어, 타격 유무로 판정하면
  // 투수가 타자로 오분류된다 → 투수 데이터(이닝/방어율) 우선.
  const isPitcher = !!pStats && (!!pStats.ip || pStats.era != null);
  if (!isPitcher) {
    const hitter = await fetchNpbHitterStats(pid);
    if (hitter && (hitter.avg != null || hitter.hr != null || hitter.hits != null)) {
      const photo = await fetchNpbPhotoUrl(pid);
      return <NpbHitterView pid={pid} profile={profile} stats={hitter} photo={photo} />;
    }
  }
  if (!profile.name && !pStats) notFound();
  const photo = await fetchNpbPhotoUrl(pid);
  return <NpbPitcherView pid={pid} profile={profile} stats={pStats} photo={photo} />;
}
