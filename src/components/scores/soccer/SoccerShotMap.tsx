"use client";

import { useMemo, useState } from "react";
import { Crosshair, Goal, Map } from "lucide-react";
import type { MatchShot, MatchShotMap } from "@/lib/sports/thestatsapi-shotmaps";

interface Props {
  data: MatchShotMap;
  homeName: string;
  awayName: string;
}

type SideFilter = "all" | "home" | "away";
type ViewMode = "pitch" | "goal";

const PITCH_W = 105;
const PITCH_H = 68;
const HOME_COLOR = "#f43f5e";
const AWAY_COLOR = "#3b82f6";

const RESULT_LABEL: Record<string, string> = {
  goal: "골",
  save: "선방",
  post: "골대",
  block: "차단",
  miss: "빗나감",
};

const SITUATION_LABEL: Record<string, string> = {
  assisted: "패스 연결",
  corner: "코너킥",
  regular: "오픈 플레이",
  fast_break: "역습",
  set_piece: "세트피스",
  throw_in_set_piece: "스로인",
  free_kick: "프리킥",
  penalty: "페널티킥",
};

function shotX(shot: MatchShot, homeId: string): number {
  const normalized = Math.max(0, Math.min(100, Number(shot.x)));
  return ((shot.team === homeId ? normalized : 100 - normalized) / 100) * PITCH_W;
}

function shotY(shot: MatchShot): number {
  return (Math.max(0, Math.min(100, Number(shot.y))) / 100) * PITCH_H;
}

function shotColor(shot: MatchShot, homeId: string): string {
  return shot.team === homeId ? HOME_COLOR : AWAY_COLOR;
}

function shotRadius(shot: MatchShot): number {
  const xg = Number.isFinite(shot.xg) ? Number(shot.xg) : 0.03;
  return 1.15 + Math.sqrt(Math.max(0.01, xg)) * 3.2;
}

function shotLabel(shot: MatchShot): string {
  const result = RESULT_LABEL[shot.result] ?? shot.result;
  const situation = shot.sit ? SITUATION_LABEL[shot.sit] ?? shot.sit : null;
  return `${shot.min}분 ${shot.name} · ${result} · xG ${shot.xg?.toFixed(2) ?? "-"}${situation ? ` · ${situation}` : ""}`;
}

function totalXg(shots: MatchShot[]): number {
  return shots.reduce((sum, shot) => sum + (Number.isFinite(shot.xg) ? Number(shot.xg) : 0), 0);
}

export default function SoccerShotMap({ data, homeName, awayName }: Props) {
  const [side, setSide] = useState<SideFilter>("all");
  const [view, setView] = useState<ViewMode>("pitch");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rows = useMemo(
    () => data.shots.map((shot, index) => ({ shot, key: `${shot.pid}-${shot.min}-${index}` })),
    [data.shots],
  );
  const filtered = rows.filter(({ shot }) =>
    side === "all" || (side === "home" ? shot.team === data.home.id : shot.team === data.away.id),
  );
  const homeShots = data.shots.filter((shot) => shot.team === data.home.id);
  const awayShots = data.shots.filter((shot) => shot.team === data.away.id);
  const topChances = [...filtered]
    .filter(({ shot }) => Number.isFinite(shot.xg))
    .sort((a, b) => Number(b.shot.xg) - Number(a.shot.xg))
    .slice(0, 5);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight sm:text-base">
            <Crosshair className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            슛맵과 슈팅 xG
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">점이 클수록 득점 가능성이 높은 기회입니다.</p>
        </div>
        <div className="inline-flex shrink-0 rounded-md bg-neutral-100 p-1 dark:bg-neutral-900" role="group" aria-label="슛맵 보기 방식">
          <button
            type="button"
            aria-pressed={view === "pitch"}
            onClick={() => setView("pitch")}
            title="경기장 슛맵"
            className={`inline-flex h-8 w-8 items-center justify-center rounded ${view === "pitch" ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"}`}
          >
            <Map className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={view === "goal"}
            onClick={() => setView("goal")}
            title="골문 도착 위치"
            className={`inline-flex h-8 w-8 items-center justify-center rounded ${view === "goal" ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"}`}
          >
            <Goal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
        <div className="min-w-0 text-right">
          <div className="truncate text-xs font-semibold text-rose-600 dark:text-rose-400">{homeName}</div>
          <div className="text-sm font-bold tabular-nums">{totalXg(homeShots).toFixed(2)} xG · {homeShots.length}슛</div>
        </div>
        <span className="text-[10px] font-semibold text-neutral-400">VS</span>
        <div className="min-w-0 text-left">
          <div className="truncate text-xs font-semibold text-blue-600 dark:text-blue-400">{awayName}</div>
          <div className="text-sm font-bold tabular-nums">{totalXg(awayShots).toFixed(2)} xG · {awayShots.length}슛</div>
        </div>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto" role="group" aria-label="팀 필터">
        {([
          ["all", "전체"],
          ["home", homeName],
          ["away", awayName],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={side === key}
            onClick={() => setSide(key)}
            className={`h-8 max-w-36 shrink-0 truncate rounded-md border px-3 text-xs font-semibold transition-colors ${
              side === key
                ? "border-neutral-400 bg-neutral-100 text-neutral-950 dark:border-neutral-500 dark:bg-neutral-800 dark:text-white"
                : "border-neutral-200 text-neutral-500 dark:border-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "pitch" ? (
        <div className="overflow-hidden rounded-lg border border-emerald-950/20 bg-[#176b3a]">
          <svg viewBox={`-2 -2 ${PITCH_W + 4} ${PITCH_H + 4}`} className="block aspect-[105/68] w-full" role="img" aria-label={`${homeName} 대 ${awayName} 슈팅 위치와 기대득점`}>
            {[0, 2, 4].map((index) => <rect key={index} x={index * 21} y={0} width={21} height={PITCH_H} fill="rgba(255,255,255,0.035)" />)}
            <g stroke="rgba(255,255,255,0.65)" strokeWidth={0.35} fill="none">
              <rect x={0} y={0} width={PITCH_W} height={PITCH_H} />
              <line x1={PITCH_W / 2} y1={0} x2={PITCH_W / 2} y2={PITCH_H} />
              <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={9.15} />
              <rect x={0} y={(PITCH_H - 40.3) / 2} width={16.5} height={40.3} />
              <rect x={PITCH_W - 16.5} y={(PITCH_H - 40.3) / 2} width={16.5} height={40.3} />
              <rect x={0} y={(PITCH_H - 18.3) / 2} width={5.5} height={18.3} />
              <rect x={PITCH_W - 5.5} y={(PITCH_H - 18.3) / 2} width={5.5} height={18.3} />
            </g>
            {filtered.map(({ shot, key }) => {
              const color = shotColor(shot, data.home.id);
              const goal = shot.result === "goal";
              const selected = selectedKey === key;
              return (
                <g key={key} role="button" tabIndex={0} onClick={() => setSelectedKey(key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedKey(key); }} className="cursor-pointer outline-none">
                  <circle cx={shotX(shot, data.home.id)} cy={shotY(shot)} r={shotRadius(shot) + (selected ? 1.1 : 0)} fill={goal ? color : `${color}80`} stroke={goal ? "white" : color} strokeWidth={selected ? 0.9 : goal ? 0.65 : 0.45} />
                  {goal && <text x={shotX(shot, data.home.id)} y={shotY(shot) + 0.8} fontSize={2.4} fill="white" textAnchor="middle" fontWeight="800">G</text>}
                  <title>{shotLabel(shot)}</title>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            [data.home.id, homeName, HOME_COLOR],
            [data.away.id, awayName, AWAY_COLOR],
          ] as const).map(([teamId, teamName, color]) => {
            const shots = filtered.filter(({ shot }) => shot.team === teamId && shot.mouthXyz);
            return (
              <div key={teamId} className="min-w-0 rounded-md bg-neutral-950 p-3 text-white">
                <div className="mb-2 truncate text-center text-xs font-semibold">{teamName} · 골문 도착 위치</div>
                <svg viewBox="-8 -8 116 66" className="block aspect-[2/1] w-full" role="img" aria-label={`${teamName} 슈팅 골문 도착 위치`}>
                  <g stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" fill="none">
                    <path d="M0 50V0H100V50" />
                    <path d="M0 50H100" opacity="0.45" />
                  </g>
                  {shots.map(({ shot, key }) => {
                    const mouth = shot.mouthXyz!;
                    const cx = Math.max(-6, Math.min(106, mouth.y));
                    const cy = 50 - Math.max(-6, Math.min(56, mouth.z));
                    const goal = shot.result === "goal";
                    return (
                      <circle key={key} cx={cx} cy={cy} r={goal ? 3 : 2.1} fill={goal ? color : `${color}99`} stroke={goal ? "white" : color} strokeWidth={goal ? 1 : 0.5}>
                        <title>{shotLabel(shot)}</title>
                      </circle>
                    );
                  })}
                </svg>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />{homeName}</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />{awayName}</span>
        <span>G = 득점</span>
        <span>크기 = xG</span>
      </div>

      {topChances.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-white/10">
          <div className="mb-2 text-xs font-bold">결정적 기회</div>
          <ol className="space-y-1.5">
            {topChances.map(({ shot, key }, index) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => { setView("pitch"); setSelectedKey(key); }}
                  className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="text-[10px] font-bold text-neutral-400">{index + 1}</span>
                  <span className="min-w-0 truncate text-xs"><strong>{shot.min}′ {shot.name}</strong> · {RESULT_LABEL[shot.result] ?? shot.result}</span>
                  <strong className="text-xs tabular-nums" style={{ color: shotColor(shot, data.home.id) }}>xG {shot.xg?.toFixed(2)}</strong>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
