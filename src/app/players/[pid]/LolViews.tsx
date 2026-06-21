// LOL/LCK 선수 상세 — 개요/경기/챔피언 3탭. DB lolGames(TheSports 세트 스코어보드) 집계.
// 시즌별 career 는 e스포츠 특성상 데이터 없음 → 챔피언 숙련도가 그 자리.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import lolPlayersData from "../../../../data/lol-players.json";
import {
  getLolPlayerDetail,
  type LolPlayerGame,
  type LolPlayerChamp,
} from "@/lib/sports/lol-player-stats";
import PlayerTabs from "./PlayerTabs";
import LolSeasonOverview from "./LolSeasonOverview";

const POSITION_KO: Record<number, string> = { 1: "원딜", 2: "미드", 3: "탑", 4: "정글", 5: "서폿" };

interface LolProfile {
  name: string;
  realName?: string;
  photo?: string;
  position?: number;
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
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
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
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
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

/* ---------- 챔피언 탭 ---------- */

function LolChamps({ champs }: { champs: LolPlayerChamp[] }) {
  if (champs.length === 0) return <p className="text-sm text-neutral-500">챔피언 기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">챔피언</th>
            <th className="text-right px-2 py-2 font-medium">게임</th>
            <th className="text-right px-2 py-2 font-medium">평균 K/D/A</th>
            <th className="text-right px-2 py-2 font-medium">KDA</th>
            <th className="text-right px-3 py-2 font-medium">승률</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
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
  if (!profile && !detail) notFound();

  const agg = detail?.agg;
  const name = agg?.name || profile?.name || "선수";
  const games = agg?.games ?? 0;
  const pos = profile?.position != null ? POSITION_KO[profile.position] : undefined;
  const birth = profile?.birthday ? new Date(profile.birthday * 1000) : null;
  const age = birth ? Math.floor((Date.now() - birth.getTime()) / 31557600000) : null;

  const overview = agg ? (
    <LolSeasonOverview agg={agg} />
  ) : (
    <p className="text-sm text-neutral-500">집계된 경기 기록이 없습니다.</p>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="space-y-3">
        <Link href="/leagues/LOL" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← LCK
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
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{name}</h1>
              {pos && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {pos}
                </span>
              )}
              {age != null && <span className="text-sm text-neutral-500">{age}세</span>}
            </div>
            {profile?.realName && <div className="text-sm text-neutral-500">{profile.realName}</div>}
            <div className="text-sm text-neutral-500">LCK · {games}세트 출전</div>
            <div className="text-[11px] text-neutral-400">TheSports (세트별 스코어보드 집계)</div>
          </div>
        </div>
      </header>

      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
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
        ⓘ 데이터 출처: TheSports LoL (세트별 스코어보드 집계). 수집된 LCK 경기 범위 내 통계입니다.
      </p>
    </article>
  );
}
