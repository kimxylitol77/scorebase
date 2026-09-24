// LOL/LCK 선수 상세 — 개요/통산/경기/챔피언 4탭.
// 개요·경기·챔피언은 DB lolGames(TheSports 세트 스코어보드) 집계 = 우리가 수집한 최근 시즌 범위.
// 통산은 ts player/stats 사전(data/lol-career.json) = 데뷔 이후 누적 + 최근 N경기 폼.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import lolPlayersData from "../../../../data/lol-players.json";
import {
  getLolPlayerDetail,
  type LolPlayerGame,
  type LolPlayerChamp,
} from "@/lib/sports/lol-player-stats";
import { lolPlayerCareer, type LolCareerLine, type LolCareerChamp } from "@/lib/sports/lol-career";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import PlayerTabs from "./PlayerTabs";
import LolSeasonOverview from "./LolSeasonOverview";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft } from "lucide-react";
import ShareCardButton from "@/components/ShareCardButton";

const POSITION_KO: Record<number, string> = { 1: "원딜", 2: "미드", 3: "탑", 4: "정글", 5: "서폿" };

interface LolProfile {
  name: string;
  realName?: string;
  photo?: string;
  position?: number | null;
  birthday?: number | null; // unix sec (일부 선수 null)
  teamId?: string;
  countryId?: string;
}

/* ---------- 공통 헬퍼 ---------- */

const d1 = (n: number) => n.toFixed(1);
const fmtDate = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;

type Tab = { key: string; label: string; content: ReactNode };
const tabsOf = (arr: (Tab | false | null | undefined)[]): Tab[] =>
  arr.filter((t): t is Tab => Boolean(t));

const WinBadge = ({ win }: { win: boolean }) => (
  <span
    className={`inline-block w-5 text-center text-[10px] font-bold rounded ${
      win
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
        : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
    }`}
  >
    {win ? "W" : "L"}
  </span>
);

/* ---------- 경기 탭 ---------- */

function LolGames({ games }: { games: LolPlayerGame[] }) {
  if (games.length === 0) return <p className="text-sm text-neutral-500">경기 기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">일자</th>
            <th className="text-left px-2 py-2 font-medium">상대</th>
            <th className="text-left px-2 py-2 font-medium">챔피언</th>
            <th className="text-right px-2 py-2 font-medium">K/D/A</th>
            <th className="text-right px-2 py-2 font-medium">CS</th>
            <th className="text-right px-2 py-2 font-medium">시간</th>
            <th className="text-right px-3 py-2 font-medium">결과</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {games.map((g, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{fmtDate(g.date)}</td>
              <td className="px-2 py-2 truncate max-w-[120px]">{g.opponent}</td>
              <td className="px-2 py-2 font-medium truncate max-w-[110px]">{g.champ}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">
                {g.k}/{g.d}/{g.a}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.cs}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{Math.round(g.durationSec / 60)}분</td>
              <td className="px-3 py-2 text-right">
                <WinBadge win={g.win} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 통산 탭 ---------- */

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** 폼 구간 라벨 — en-mirror 사전이 통짜로 치환하도록 창 크기별 문자열을 따로 둔다 */
const WINDOW_KO: Record<number, string> = {
  10: "최근 10경기", 20: "최근 20경기", 30: "최근 30경기", 40: "최근 40경기", 50: "최근 50경기",
};

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 tabular-nums">{sub}</div>}
    </div>
  );
}

function LolCareer({ career, champs, form }: { career: LolCareerLine; champs: LolCareerChamp[]; form: Array<{ window: number; line: LolCareerLine }> }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">통산 기록</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox label="통산 전적" value={`${career.win}승 ${career.lose}패`} sub={`승률 ${pct(career.winRate)}`} />
          <StatBox label="KDA" value={career.kda.toFixed(2)} sub={`${d1(career.k)} / ${d1(career.d)} / ${d1(career.a)}`} />
          <StatBox label="킬 관여율" value={pct(career.part)} />
          <StatBox label="분당 CS" value={d1(career.csPerMin)} />
          <StatBox label="분당 골드" value={Math.round(career.goldPerMin).toLocaleString()} />
          <StatBox label="분당 대미지" value={Math.round(career.dmgPerMin).toLocaleString()} />
        </div>
      </section>

      {form.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">최근 경기 폼</h3>
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-white/[0.04]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">구간</th>
                  <th className="px-2 py-2 text-right font-medium">전적</th>
                  <th className="px-2 py-2 text-right font-medium">승률</th>
                  <th className="px-2 py-2 text-right font-medium">평균 K/D/A</th>
                  <th className="px-2 py-2 text-right font-medium">KDA</th>
                  <th className="px-3 py-2 text-right font-medium">킬 관여</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {form.map((f) => (
                  <tr key={f.window}>
                    <td className="px-3 py-2 font-medium">{WINDOW_KO[f.window] ?? `최근 ${f.window}경기`}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{f.line.win}-{f.line.lose}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pct(f.line.winRate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{d1(f.line.k)}/{d1(f.line.d)}/{d1(f.line.a)}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-blue-600 dark:text-blue-400">{f.line.kda.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(f.line.part)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {champs.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">통산 챔피언 풀</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {champs.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                {c.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 object-cover dark:bg-neutral-900" loading="lazy" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-900" />
                )}
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-xs font-semibold">{c.name}</div>
                  <div className="text-[11px] tabular-nums text-neutral-500">{c.played}판 · {pct(c.winRate)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- 챔피언 탭 ---------- */

function LolChamps({ champs }: { champs: LolPlayerChamp[] }) {
  if (champs.length === 0) return <p className="text-sm text-neutral-500">챔피언 기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">챔피언</th>
            <th className="text-right px-2 py-2 font-medium">게임</th>
            <th className="text-right px-2 py-2 font-medium">평균 K/D/A</th>
            <th className="text-right px-2 py-2 font-medium">KDA</th>
            <th className="text-right px-3 py-2 font-medium">승률</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {champs.map((c) => (
            <tr key={c.champ}>
              <td className="px-3 py-2 font-medium">{c.champ}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{c.games}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {d1(c.k)}/{d1(c.d)}/{d1(c.a)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">{c.kda.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{Math.round(c.winRate * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
 * 메인 뷰
 * ==========================================================*/

export async function LolPlayerView({ pid }: { pid: string }) {
  const profile = (lolPlayersData as { players: Record<string, LolProfile> }).players[pid];
  const detail = await getLolPlayerDetail(pid);
  const careerData = lolPlayerCareer(pid);
  // 리그 라벨은 경기 기록에서 뽑는다 — LCK 고정이면 LEC·LCS 선수 페이지가 전부 "LCK"로 나온다
  const league = detail?.league ?? "LOL";
  const leagueLabel = LEAGUE_DISPLAY[league] ?? league;
  if (!profile && !detail) notFound();

  const agg = detail?.agg;
  const name = agg?.name || profile?.name || "선수";
  const games = agg?.games ?? 0;
  const pos = profile?.position != null ? POSITION_KO[profile.position] : undefined;
  const birth = profile?.birthday ? new Date(profile.birthday * 1000) : null;
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const age = birth ? Math.floor((Date.now() - birth.getTime()) / 31557600000) : null;

  const overview = agg ? (
    <LolSeasonOverview agg={agg} />
  ) : (
    <p className="text-sm text-neutral-500">집계된 경기 기록이 없습니다.</p>
  );

  return (
    <article className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <header className="space-y-3">
        <Link
          href={`/leagues/${league}`}
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> {leagueLabel}
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {profile?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo}
              alt={name}
              className="w-24 h-24 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 flex items-center justify-center text-3xl font-black text-white">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name}</h1>
              {pos && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {pos}
                </span>
              )}
              {age != null && <span className="text-sm text-neutral-500">{age}세</span>}
              <ShareCardButton />
            </div>
            {profile?.realName && <div className="text-sm text-neutral-500">{profile.realName}</div>}
            <div className="text-sm text-neutral-500">{leagueLabel} · {games}세트 출전</div>
            <div className="text-[11px] text-neutral-400">TheSports (세트별 스코어보드 집계)</div>
          </div>
        </div>
      </header>

      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          careerData && {
            key: "career",
            label: "통산",
            content: <LolCareer career={careerData.career} champs={careerData.champs} form={careerData.form} />,
          },
          detail && detail.games.length > 0 && {
            key: "games",
            label: "경기",
            content: <LolGames games={detail.games} />,
          },
          detail && detail.champs.length > 0 && {
            key: "champs",
            label: "챔피언",
            content: <LolChamps champs={detail.champs} />,
          },
        ])}
      />

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: TheSports LoL. 개요·경기·챔피언 탭은 우리가 수집한 세트별 스코어보드 집계라 최근 시즌 범위이고,
        통산 탭은 TheSports 선수 누적 기록(데뷔 이후 전적·챔피언 풀 + 최근 10~50경기 폼)입니다.
      </p>
    </article>
  );
}
