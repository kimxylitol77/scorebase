"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Pause, Play, Route, Target } from "lucide-react";
import type { MatchTrendData } from "@/components/live/MatchTrendChart";
import type { GoalLineGoal, GoalLinePass } from "@/components/charts/GoalSceneViz";
import type { SoccerGoal } from "@/lib/sports/live-scores";
import type { MatchShotMap } from "@/lib/sports/thestatsapi-shotmaps";
import {
  classifyGoalSituation,
  GOAL_SITUATION_LABEL,
  type GoalSituation,
} from "@/lib/sports/thesports/goal-situation";

interface Props {
  goals: GoalLineGoal[];
  homeName: string;
  awayName: string;
  nameById?: Record<string, string>;
  trend?: MatchTrendData | null;
  eventGoals?: SoccerGoal[] | null;
  shotMap?: MatchShotMap | null;
  timeline?: unknown;
}

type TeamSide = 1 | 2;

interface ReplayPoint extends GoalLinePass {
  px: number;
  py: number;
}

interface GoalScene {
  goal: GoalLineGoal;
  points: ReplayPoint[];
  shooter: ReplayPoint;
  assist?: ReplayPoint;
  scoringSide: TeamSide;
  targetX: number;
  targetY: number;
  shotXg?: number;
  goalMouth?: string | null;
  situation: GoalSituation | null;
  score: string;
  minute: number;
  minuteLabel: string;
  scorerFallback?: string;
}

const PITCH_W = 105;
const PITCH_H = 68;
const HOME_COLOR = "#f43f5e";
const AWAY_COLOR = "#3b82f6";

function toPitchX(value: string): number {
  return (Math.max(0, Math.min(100, Number(value))) / 100) * PITCH_W;
}

function toPitchY(value: string): number {
  return (Math.max(0, Math.min(100, Number(value))) / 100) * PITCH_H;
}

function isValidPass(pass: GoalLinePass): boolean {
  return Number.isFinite(Number(pass.x)) && Number.isFinite(Number(pass.y));
}

function getPlayerName(
  point: ReplayPoint | undefined,
  nameById: Record<string, string>,
  fallback?: string,
): string {
  if (!point) return "선수 정보 없음";
  return nameById[point.player_id] || fallback || `#${point.shirt_number}`;
}

function parseMinute(value: string | undefined): number | null {
  const match = value?.match(/(\d+)(?:\+(\d+))?/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2] ?? 0);
}

function formatMinute(value: string | undefined, fallback: number): string {
  const clean = value?.trim().replace(/[’']/g, "");
  return `${clean || fallback}′`;
}

function getMomentumAtMinute(trend: MatchTrendData | null | undefined, minute: number): number | null {
  const firstHalf = Array.isArray(trend?.data?.[0]) ? trend.data[0] : [];
  const secondHalf = Array.isArray(trend?.data?.[1]) ? trend.data[1] : [];
  const value = minute <= 45
    ? firstHalf[Math.max(0, Math.min(minute - 1, firstHalf.length - 1))]
    : secondHalf[Math.max(0, Math.min(minute - 46, secondHalf.length - 1))];
  return Number.isFinite(value) ? value : null;
}

function buildScenes(
  goals: GoalLineGoal[],
  eventGoals: SoccerGoal[] | null | undefined,
  shotMap: MatchShotMap | null | undefined,
  timeline: unknown,
): GoalScene[] {
  let homeScore = 0;
  let awayScore = 0;
  const orderedEvents = [...(eventGoals ?? [])].sort(
    (a, b) => (parseMinute(a.minute) ?? 0) - (parseMinute(b.minute) ?? 0),
  );

  return [...goals]
    .sort((a, b) => a.time - b.time)
    .flatMap((goal, index) => {
      const rawPoints = Array.isArray(goal.pass) ? goal.pass : [];
      const rawShooter = rawPoints.find((point) => Number(point.shooter) === 1) ?? rawPoints[0];
      const shooterSide: TeamSide = Number(rawShooter?.belong) === 2 ? 2 : 1;
      const fallbackScoringSide: TeamSide = Number(goal.own_goal) === 1
        ? shooterSide === 1 ? 2 : 1
        : shooterSide;
      const event = orderedEvents[index];
      const scoringSide: TeamSide = event?.side === "home"
        ? 1
        : event?.side === "away"
          ? 2
          : fallbackScoringSide;
      if (scoringSide === 1) homeScore += 1;
      else awayScore += 1;

      const points = rawPoints
        .filter(isValidPass)
        .map((pass) => ({ ...pass, px: toPitchX(pass.x), py: toPitchY(pass.y) }));
      if (points.length === 0) return [];

      const shooter = points.find((point) => Number(point.shooter) === 1) ?? points[points.length - 1];
      const assist = points.find((point) => Number(point.assist) === 1);

      const normalTargetX = shooterSide === 1 ? PITCH_W : 0;
      const targetX = Number(goal.own_goal) === 1 ? PITCH_W - normalTargetX : normalTargetX;
      const fallbackMinute = Math.max(1, Math.floor(goal.time / 60));
      const minute = parseMinute(event?.minute) ?? fallbackMinute;
      const sourceTeamId = scoringSide === 1 ? shotMap?.home.id : shotMap?.away.id;
      const matchingShot = shotMap?.shots
        .filter((shot) => shot.result === "goal" && shot.team === sourceTeamId)
        .sort((a, b) => Math.abs(a.min - minute) - Math.abs(b.min - minute))[0];
      const hasMinuteMatch = !!matchingShot && Math.abs(matchingShot.min - minute) <= 2;
      const mouthY = hasMinuteMatch ? matchingShot.mouthXyz?.y : null;
      const goalWidth = 7.32;
      const targetY = Number.isFinite(mouthY)
        ? (PITCH_H - goalWidth) / 2 + (Math.max(0, Math.min(100, Number(mouthY))) / 100) * goalWidth
        : PITCH_H / 2;

      return [{
        goal,
        points,
        shooter,
        assist,
        scoringSide,
        targetX,
        targetY,
        shotXg: hasMinuteMatch && Number.isFinite(matchingShot.xg) ? Number(matchingShot.xg) : undefined,
        goalMouth: hasMinuteMatch ? matchingShot.mouth : null,
        situation: classifyGoalSituation({
          goal,
          event,
          minute,
          scoringSide,
          shotSituation: hasMinuteMatch ? matchingShot.sit : null,
          timeline,
        }),
        score: `${homeScore}-${awayScore}`,
        minute,
        minuteLabel: formatMinute(event?.minute, fallbackMinute),
        scorerFallback: event?.player || undefined,
      }];
    });
}

export default function SoccerGoalReplay({
  goals,
  homeName,
  awayName,
  nameById = {},
  trend,
  eventGoals,
  shotMap,
  timeline,
}: Props) {
  const markerId = `goal-replay-arrow-${useId().replace(/:/g, "")}`;
  const scenes = useMemo(
    () => buildScenes(goals, eventGoals, shotMap, timeline),
    [eventGoals, goals, shotMap, timeline],
  );
  const [selected, setSelected] = useState(0);
  const [visibleSteps, setVisibleSteps] = useState(1);
  const [playing, setPlaying] = useState(true);
  const scene = scenes[Math.min(selected, Math.max(0, scenes.length - 1))];

  useEffect(() => {
    if (!scene || !playing) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const reducedMotionTimer = window.setTimeout(() => {
        setVisibleSteps(scene.points.length + 1);
        setPlaying(false);
      }, 0);
      return () => window.clearTimeout(reducedMotionTimer);
    }
    const delay = Math.max(180, Math.min(480, Math.round(3200 / scene.points.length)));
    const timer = window.setInterval(() => {
      setVisibleSteps((current) => {
        if (current >= scene.points.length + 1) {
          window.clearInterval(timer);
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [playing, scene]);

  if (!scene) return null;

  const shownPoints = scene.points.slice(0, Math.min(visibleSteps, scene.points.length));
  const shotVisible = visibleSteps > scene.points.length;
  const currentPoint = shownPoints[shownPoints.length - 1] ?? scene.points[0];
  const ballX = shotVisible ? scene.targetX : currentPoint.px;
  const ballY = shotVisible ? scene.targetY : currentPoint.py;
  const color = scene.scoringSide === 1 ? HOME_COLOR : AWAY_COLOR;
  const teamName = scene.scoringSide === 1 ? homeName : awayName;
  const shooterName = getPlayerName(scene.shooter, nameById, scene.scorerFallback);
  const assistName = scene.assist ? getPlayerName(scene.assist, nameById) : null;
  const momentum = getMomentumAtMinute(trend, scene.minute);
  const momentumTeam = momentum == null ? null : momentum >= 0 ? homeName : awayName;

  const selectScene = (index: number) => {
    setSelected(index);
    setVisibleSteps(1);
    setPlaying(true);
  };

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (visibleSteps >= scene.points.length + 1) setVisibleSteps(1);
    setPlaying(true);
  };

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight sm:text-base">
            <Route className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            골 장면 재연
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">실제 골 경로 좌표 · 득점 유형 · 슈팅 방향</p>
        </div>
        <button
          type="button"
          onClick={togglePlayback}
          title={playing ? "재연 일시정지" : "골 장면 재생"}
          aria-label={playing ? "재연 일시정지" : "골 장면 재생"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </button>
      </header>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="골 장면 선택">
        {scenes.map((item, index) => {
          const active = index === selected;
          const itemColor = item.scoringSide === 1 ? HOME_COLOR : AWAY_COLOR;
          return (
            <button
              key={`${item.goal.number}-${item.goal.time}`}
              type="button"
              aria-pressed={active}
              onClick={() => selectScene(index)}
              className={`h-9 shrink-0 rounded-md border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                active
                  ? "border-neutral-400 bg-neutral-100 text-neutral-950 dark:border-neutral-500 dark:bg-neutral-800 dark:text-white"
                  : "border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900 dark:border-white/10 dark:bg-neutral-950 dark:hover:text-neutral-100"
              }`}
            >
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: itemColor }} />
              {item.minuteLabel} · {item.score}
              {item.situation ? ` · ${GOAL_SITUATION_LABEL[item.situation]}` : ""}
            </button>
          );
        })}
      </div>

      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
        <span className="truncate text-right text-xs font-semibold text-rose-600 dark:text-rose-400 sm:text-sm">{homeName}</span>
        <strong className="whitespace-nowrap text-base tabular-nums sm:text-lg">{scene.score}</strong>
        <span className="truncate text-left text-xs font-semibold text-blue-600 dark:text-blue-400 sm:text-sm">{awayName}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-emerald-950/20 bg-[#176b3a]">
        <svg
          viewBox={`-2 -2 ${PITCH_W + 4} ${PITCH_H + 4}`}
          className="block aspect-[105/68] w-full"
          role="img"
          aria-label={`${scene.minuteLabel} ${teamName} 득점의 패스 경로와 슈팅 방향`}
        >
          <defs>
            <marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
            </marker>
          </defs>
          {[0, 2, 4].map((index) => (
            <rect key={index} x={index * 21} y={0} width={21} height={PITCH_H} fill="rgba(255,255,255,0.035)" />
          ))}
          <g stroke="rgba(255,255,255,0.62)" strokeWidth={0.35} fill="none">
            <rect x={0} y={0} width={PITCH_W} height={PITCH_H} />
            <line x1={PITCH_W / 2} y1={0} x2={PITCH_W / 2} y2={PITCH_H} />
            <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={9.15} />
            <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={0.65} fill="rgba(255,255,255,0.62)" />
            <rect x={0} y={(PITCH_H - 40.3) / 2} width={16.5} height={40.3} />
            <rect x={PITCH_W - 16.5} y={(PITCH_H - 40.3) / 2} width={16.5} height={40.3} />
            <rect x={0} y={(PITCH_H - 18.3) / 2} width={5.5} height={18.3} />
            <rect x={PITCH_W - 5.5} y={(PITCH_H - 18.3) / 2} width={5.5} height={18.3} />
          </g>

          {scene.points.length > 1 && (
            <polyline
              points={scene.points.map((point) => `${point.px},${point.py}`).join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={0.65}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {shownPoints.length > 1 && (
            <polyline
              points={shownPoints.map((point) => `${point.px},${point.py}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {shotVisible && (
            <line
              x1={scene.shooter.px}
              y1={scene.shooter.py}
              x2={scene.targetX}
              y2={scene.targetY}
              stroke={color}
              strokeWidth={1.25}
              strokeLinecap="round"
              markerEnd={`url(#${markerId})`}
            />
          )}

          {scene.points.map((point, index) => {
            const reached = index < visibleSteps;
            const isShooter = Number(point.shooter) === 1;
            const isAssist = Number(point.assist) === 1;
            return (
              <g key={`${point.player_id}-${index}`} opacity={reached ? 1 : 0.38}>
                <circle
                  cx={point.px}
                  cy={point.py}
                  r={isShooter ? 2.15 : isAssist ? 1.9 : 1.45}
                  fill={isShooter ? color : isAssist ? "#fbbf24" : "white"}
                  stroke={color}
                  strokeWidth={0.42}
                />
                <text x={point.px} y={point.py + 0.65} fontSize={isShooter ? 2 : 1.65} fill={isShooter ? "white" : "#111827"} textAnchor="middle" fontWeight="700">
                  {point.shirt_number}
                </text>
              </g>
            );
          })}
          <circle cx={ballX} cy={ballY} r={0.92} fill="white" stroke="#111827" strokeWidth={0.35} />
          <text
            x={scene.targetX === PITCH_W ? PITCH_W - 3 : 3}
            y={PITCH_H - 2}
            fontSize={2.25}
            fill="rgba(255,255,255,0.82)"
            textAnchor={scene.targetX === PITCH_W ? "end" : "start"}
          >
            {scene.targetX === PITCH_W ? "공격 방향 →" : "← 공격 방향"}
          </text>
        </svg>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="min-w-0 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
          <div className="flex min-w-0 items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
            <Target className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
            <span className="truncate">{scene.minuteLabel} {shooterName} 득점</span>
            {scene.situation && (
              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {GOAL_SITUATION_LABEL[scene.situation]}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">
            {assistName ? `${assistName} 도움` : "도움 기록 없음"} · 경로 {scene.points.length}지점
            {scene.shotXg != null ? ` · xG ${scene.shotXg.toFixed(2)}` : ""}
          </p>
        </div>
        <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
          <div className="font-semibold text-neutral-900 dark:text-neutral-100">득점 당시 흐름</div>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {momentum == null
              ? "모멘텀 데이터 없음"
              : `${momentumTeam} 우세 · ${momentum > 0 ? "+" : ""}${momentum}`}
          </p>
        </div>
      </div>
    </section>
  );
}
