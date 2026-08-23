// GoalSceneViz (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";

// 골 장면 시각화 — 빌드업 패스 경로 + 슈터 → 골문. TheSports goal/line 데이터(슈터/어시 full-field 좌표).
// belong 1=home(오른쪽 골 공격) / 2=away(왼쪽 골). 골 선택 버튼으로 장면 전환.

import { useState } from "react";

export interface GoalLinePass {
  belong: number;
  player_id: string;
  shirt_number: string;
  x: string; // full field 0~100 (origin 좌상단)
  y: string;
  shooter: number; // 1=슈터
  assist: number; // 1=어시스트
}
export interface GoalLineGoal {
  number: number;
  time: number; // 초
  goal_x: string;
  goal_y: string;
  own_goal: number;
  pass: GoalLinePass[];
}
interface Props {
  goals: GoalLineGoal[];
  homeName: string;
  awayName: string;
}

const W = 105;
const H = 68;
const tx = (x: number) => (x / 100) * W;
const ty = (y: number) => (y / 100) * H;
const HOME = "#3b82f6";
const AWAY = "#ef4444";

export default function GoalSceneViz({ goals, homeName, awayName }: Props) {
  const [sel, setSel] = useState(0);
  if (!goals.length) return null;
  const goal = goals[Math.min(sel, goals.length - 1)];
  const pts = goal.pass.map((p) => ({ ...p, px: tx(+p.x), py: ty(+p.y) }));
  const shooter = pts.find((p) => p.shooter === 1) ?? pts[pts.length - 1];
  const assist = pts.find((p) => p.assist === 1);
  const belong = shooter?.belong ?? 1;
  const color = belong === 1 ? HOME : AWAY;
  const goalMouth = { x: belong === 1 ? W : 0, y: H / 2 }; // 공격 방향 골문 중앙
  const min = Math.floor(goal.time / 60);

  return (
    <div>
      {/* 골 선택 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {goals.map((g, i) => {
          const b = (g.pass.find((p) => p.shooter === 1) ?? g.pass[0])?.belong ?? 1;
          return (
            <button
              key={g.number}
              onClick={() => setSel(i)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                i === sel ? "border-neutral-400 font-semibold" : "border-neutral-200 dark:border-neutral-700 opacity-60"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full align-middle mr-1.5" style={{ backgroundColor: b === 1 ? HOME : AWAY }} />
              {Math.floor(g.time / 60)}′ {g.own_goal ? "(OG)" : ""}
            </button>
          );
        })}
      </div>

      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="w-full rounded-lg" style={{ background: "#1a7a3c" }}>
        {/* 피치 라인 */}
        <g stroke="rgba(255,255,255,0.5)" strokeWidth={0.3} fill="none">
          <rect x={0} y={0} width={W} height={H} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
          <circle cx={W / 2} cy={H / 2} r={9.15} />
          <rect x={0} y={(H - 40.3) / 2} width={16.5} height={40.3} />
          <rect x={W - 16.5} y={(H - 40.3) / 2} width={16.5} height={40.3} />
          <rect x={0} y={(H - 18.3) / 2} width={5.5} height={18.3} />
          <rect x={W - 5.5} y={(H - 18.3) / 2} width={5.5} height={18.3} />
        </g>

        {/* 빌드업 패스 경로 */}
        {pts.length > 1 && (
          <polyline
            points={pts.map((p) => `${p.px},${p.py}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={0.5}
            strokeDasharray="1.5 1"
            opacity={0.7}
          />
        )}
        {/* 슈터 → 골문 슛 */}
        {shooter && (
          <line x1={shooter.px} y1={shooter.py} x2={goalMouth.x} y2={goalMouth.y} stroke={color} strokeWidth={0.9} markerEnd="url(#arrow)" />
        )}
        <defs>
          <marker id="arrow" markerWidth={4} markerHeight={4} refX={3} refY={2} orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill={color} />
          </marker>
        </defs>

        {/* 패스 지점 */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.px} cy={p.py} r={p.shooter ? 1.6 : 0.9} fill={p.shooter ? color : "white"} stroke={color} strokeWidth={0.3} />
        ))}
        {/* 슈터 번호 */}
        {shooter && (
          <text x={shooter.px} y={shooter.py - 2.2} fontSize={2.6} fill="white" textAnchor="middle" fontWeight="bold">
            #{shooter.shirt_number}
          </text>
        )}
        {assist && (
          <text x={assist.px} y={assist.py - 1.8} fontSize={2} fill="rgba(255,255,255,0.8)" textAnchor="middle">
            A:{assist.shirt_number}
          </text>
        )}
      </svg>

      <p className="mt-2 text-xs text-neutral-500">
        {min}′ {belong === 1 ? homeName : awayName} {goal.own_goal ? "own goal" : "goal"} · build-up {goal.pass.length}passes · dotted = pass, solid = shot · the goal side shows the attacking direction
      </p>
    </div>
  );
}
