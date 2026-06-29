"use client";

// LoL 세트별 인게임 상세 — 스코어보드(챔프·KDA·CS·골드·아이템) + 골드추이 차트. TheSports lolGames JSON 기반.
// 세트 탭으로 전환. red/blue 팀 구분. 이미지는 eimg.thesports.com 직접(차단 시 proxy 전환).

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { LolGamesData, LolGameSet, LolGamePlayer } from "@/lib/sports/lol-ingame";
import { computeLolMvp } from "@/lib/sports/lol-ingame";

const RED = "#e24b4a";
const BLUE = "#5b9bd5";

export default function LolInGame({ games }: { games: LolGamesData }) {
  const [sel, setSel] = useState(0);
  if (!games?.sets?.length) return null;
  const mvp = computeLolMvp(games);
  const set = games.sets[Math.min(sel, games.sets.length - 1)];
  const redP = set.players.filter((p) => p.teamId === set.red.id);
  const blueP = set.players.filter((p) => p.teamId === set.blue.id);
  const chartData = set.econ.map((e) => ({
    min: Math.round(e.t / 60),
    lead: Math.round(-e.v / 100) / 10, // red팀 기준 골드 리드(k)
  }));

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-4 sm:p-5 space-y-4">
      {/* 경기 MVP — 시리즈 전체 집계로 1명 */}
      {mvp && (
        <div className="flex items-center gap-3 rounded-xl bg-rose-500/[0.06] ring-1 ring-rose-500/20 dark:bg-rose-500/[0.08] p-3 sm:p-3.5">
          {mvp.cimg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/_next/image?url=${encodeURIComponent(mvp.cimg)}&w=96&q=75`}
              alt={mvp.champ}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover shrink-0 ring-1 ring-rose-500/20"
              loading="lazy"
            />
          ) : (
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-rose-500/10 shrink-0 inline-flex items-center justify-center font-bold text-rose-500">
              {mvp.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
                <Trophy className="w-3 h-3" /> MVP
              </span>
              <Link
                href={`/players/${mvp.playerId}?league=LOL`}
                className="font-extrabold truncate hover:underline"
              >
                {mvp.name}
              </Link>
              <span className="text-xs text-neutral-500 truncate">
                {mvp.teamShort} · {mvp.champ}
                {mvp.games > 1 ? ` 외 ${mvp.games}세트` : ""}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-neutral-600 dark:text-neutral-300 tabular-nums">
              <span>
                <b className="text-neutral-800 dark:text-neutral-100">
                  {mvp.k}/{mvp.d}/{mvp.a}
                </b>{" "}
                KDA {mvp.kda.toFixed(2)}
              </span>
              <span>킬관여 {Math.round(mvp.kp * 100)}%</span>
              <span className="hidden sm:inline">CS {mvp.cs}</span>
              <span className="hidden sm:inline">{(mvp.gold / 1000).toFixed(1)}k G</span>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 + 세트 탭 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          게임별 인게임 상세
        </div>
        <div className="flex gap-1">
          {games.sets.map((s, i) => (
            <button
              key={s.box}
              onClick={() => setSel(i)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                i === sel
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              SET {s.box}
            </button>
          ))}
        </div>
      </div>

      {/* 세트 요약 */}
      <div className="text-xs text-neutral-500 flex items-center gap-3 flex-wrap">
        <span className="font-semibold">{Math.floor(set.durationSec / 60)}분</span>
        <span>킬 {set.redKills}:{set.blueKills}</span>
        <span>타워 {set.redTower}:{set.blueTower}</span>
        <span>드래곤 {set.redDragon}:{set.blueDragon}</span>
      </div>

      {/* 스코어보드 */}
      <div className="space-y-3">
        <TeamBoard team={set.red.name} kills={set.redKills} players={redP} color={RED} />
        <TeamBoard team={set.blue.name} kills={set.blueKills} players={blueP} color={BLUE} />
      </div>

      {/* 골드 추이 */}
      {chartData.length > 1 && (
        <div>
          <div className="text-xs text-neutral-500 mb-1">
            골드 추이 — <span style={{ color: RED }} className="font-semibold">{set.red.short}</span> 리드폭
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.2} />
                <XAxis
                  dataKey="min"
                  stroke="#737373"
                  fontSize={11}
                  tick={{ fill: "currentColor" }}
                  tickFormatter={(v: number) => `${v}분`}
                />
                <YAxis
                  stroke="#737373"
                  fontSize={11}
                  tick={{ fill: "currentColor" }}
                  tickFormatter={(v: number) => `${v}k`}
                />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(1)}k`, `${set.red.short} 리드`]}
                  labelFormatter={(l) => `${l}분`}
                  contentStyle={{
                    backgroundColor: "var(--tooltip-bg, #fff)",
                    border: "1px solid #e5e5e5",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="lead" stroke={RED} fill={RED} fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamBoard({
  team,
  kills,
  players,
  color,
}: {
  team: string;
  kills: number;
  players: LolGamePlayer[];
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="font-bold text-sm" style={{ color }}>
          {team}
        </span>
        <span className="text-xs text-neutral-500">{kills} kills</span>
      </div>
      <div className="space-y-0.5">
        {players.map((p, i) => (
          <PlayerRow key={i} p={p} />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ p }: { p: LolGamePlayer }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-[13px] py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {p.cimg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.cimg} alt="" className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-white/[0.06] shrink-0" loading="lazy" />
        ) : (
          <div className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-white/[0.06] shrink-0" />
        )}
        <Link
          href={`/players/${p.playerId}?league=LOL`}
          className="font-semibold truncate hover:underline"
        >
          {p.name}
        </Link>
        <span className="text-neutral-400 text-xs truncate hidden sm:inline">{p.champ}</span>
      </div>
      <span className="tabular-nums text-neutral-600 dark:text-neutral-300">
        {p.k}/{p.d}/{p.a}
      </span>
      <span className="tabular-nums text-neutral-400 text-xs hidden sm:inline">CS {p.cs}</span>
      <div className="flex gap-0.5">
        {p.items.slice(0, 6).map((it, j) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={j}
            src={it.l}
            alt=""
            title={it.n}
            className="w-5 h-5 rounded bg-neutral-100 dark:bg-white/[0.06]"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}
