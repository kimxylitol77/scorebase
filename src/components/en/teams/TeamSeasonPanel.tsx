// teams__TeamSeasonPanel (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";

import { useState } from "react";
import { BarChart3, Target } from "lucide-react";

export interface PanelTeamStat {
  matches: number | null;
  goals: number | null;
  against: number | null;
  poss: number | null;
  shots: number | null;
  sot: number | null;
  passAcc: number | null;
  dribbleSucc: number | null;
  tackles: number | null;
  corners: number | null;
  fouls: number | null;
  yellow: number | null;
  red: number | null;
}

export interface PanelXgItem {
  matchId: number;
  date: string; // ISO — 클라이언트 직렬화용
  opp: string;
  result: "W" | "D" | "L";
  gf: number;
  ga: number;
  xgFor: number;
  xgAgainst: number;
}

export interface SeasonSlice {
  label: string | null; // null = 시즌 경계 없는 대회(칩 미표시)
  isCurrent: boolean;
  stats: {
    position: number;
    teams: number;
    points: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
    attackRank: number | null;
    defenseRank: number | null;
  } | null;
  elo: number | null; // 현재 시즌만 (Elo 는 시즌 누적이라 과거 스냅샷 없음)
  tsStat: PanelTeamStat | null;
  xg: {
    count: number; // 시즌 내 xG 보유 경기 수 (평균 분모)
    xgForAvg: number;
    xgAgainstAvg: number;
    goalsAvg: number;
    items: PanelXgItem[]; // 시간순, 최근 10경기
  } | null;
}

function SectionH({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {icon}
      <h2 className="text-lg font-black">{title}</h2>
      {subtitle && <span className="text-xs text-neutral-500">{subtitle}</span>}
    </div>
  );
}

function Stat({ label, value, subtle }: { label: string; value: string; subtle?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-black mt-1 tabular-nums">{value}</div>
      {subtle && <div className="text-xs text-neutral-500 mt-0.5">{subtle}</div>}
    </div>
  );
}

export default function TeamSeasonPanel({ seasons }: { seasons: SeasonSlice[] }) {
  const [idx, setIdx] = useState(0);
  if (seasons.length === 0) return null;
  const s = seasons[Math.min(idx, seasons.length - 1)];
  const showChips = seasons.length > 1 && seasons.every((x) => x.label);
  const xgMax = s.xg ? Math.max(1, ...s.xg.items.flatMap((x) => [x.xgFor, x.xgAgainst])) : 1;

  return (
    <div className="space-y-10">
      {/* 시즌 칩 — 현재 시즌 기본, 과거 시즌은 여기 접힘 */}
      {/* ⚠ Tailwind 4 의 space-y 는 자식 margin-bottom 구현 — 칩 행에 음수 mb 를 주면 간격을 덮어써 다음 섹션과 겹친다 */}
      {showChips && (
        <div className="flex items-center gap-2 flex-wrap">
          {seasons.map((x, i) => (
            <button
              key={x.label}
              type="button"
              onClick={() => setIdx(i)}
              aria-pressed={i === idx}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold border transition-colors ${
                i === idx
                  ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                  : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
              }`}
            >
              {x.label} season{x.isCurrent ? "" : " (complete)"}
            </button>
          ))}
        </div>
      )}

      {/* 시즌 통계 */}
      {s.stats ? (
        <section>
          <SectionH title="Season stats" subtitle={s.label ? `${s.label} season` : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Pos" value={`${s.stats.position}`} subtle={`/ ${s.stats.teams}Team`} />
            <Stat
              label="Pts"
              value={`${s.stats.points} pts`}
              subtle={`${s.stats.wins}W ${s.stats.draws}D ${s.stats.losses}L`}
            />
            <Stat
              label="GD"
              value={`${s.stats.goalDiff > 0 ? "+" : ""}${s.stats.goalDiff}`}
              subtle={`${s.stats.goalsFor} - ${s.stats.goalsAgainst}`}
            />
            {s.elo != null ? (
              <Stat
                label="Elo"
                value={Math.round(s.elo).toString()}
                subtle={`Attack ${s.stats.attackRank ?? "-"} / defence ${s.stats.defenseRank ?? "-"}`}
              />
            ) : (
              <Stat
                label="Attack / defence"
                value={`${s.stats.attackRank ?? "-"} / ${s.stats.defenseRank ?? "-"}`}
                subtle="Rank for goals scored and conceded"
              />
            )}
          </div>
        </section>
      ) : (
        s.isCurrent && (
          <section>
            <SectionH title="Season stats" subtitle={s.label ? `${s.label} season` : undefined} />
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500">
              New season data is still accumulating. Position, points and goal difference fill in as matches are played.
            </div>
          </section>
        )
      )}

      {/* 팀 시즌 통계 (ts 리그 집계 — 시즌별 영구 아카이브) */}
      {s.tsStat && (
        <section>
          <SectionH
            title="Team season stats"
            subtitle={[s.label ? `${s.label} season` : null, s.tsStat.matches ? `${s.tsStat.matches} matches · league totals` : "league totals"].filter(Boolean).join(" · ")}
            icon={<BarChart3 className="h-5 w-5" aria-hidden />}
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {([
              { label: "GF", v: s.tsStat.goals },
              { label: "GA", v: s.tsStat.against },
              { label: "Possession", v: s.tsStat.poss, suf: "%" },
              { label: "Shots", v: s.tsStat.shots },
              { label: "On target", v: s.tsStat.sot },
              { label: "Pass acc.", v: s.tsStat.passAcc, suf: "%" },
              { label: "Dribbles", v: s.tsStat.dribbleSucc },
              { label: "Tackles", v: s.tsStat.tackles },
              { label: "Corners", v: s.tsStat.corners },
              { label: "Fouls", v: s.tsStat.fouls },
              { label: "Yellows", v: s.tsStat.yellow },
              { label: "Reds", v: s.tsStat.red },
            ] as { label: string; v: number | null; suf?: string }[])
              .filter((t) => t.v != null)
              .map((t) => (
                <div key={t.label} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
                  <div className="text-xl font-black tabular-nums">{t.v}{t.suf || ""}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* xG 추이 — 시즌 평균 + 최근 10경기 (af expectedGoals) */}
      {s.xg && (
        <section>
          <SectionH
            title="xG trend"
            subtitle={`${s.label ? `${s.label} season · ` : ""}${s.xg.count} match average · chart covers the last ${s.xg.items.length} matches`}
            icon={<Target className="h-5 w-5" aria-hidden />}
          />
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { label: "xG created per match", v: s.xg.xgForAvg },
                { label: "xG conceded per match", v: s.xg.xgAgainstAvg },
                { label: "Actual goals per match", v: s.xg.goalsAvg },
              ] as { label: string; v: number }[]).map((t) => (
                <div key={t.label} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
                  <div className="text-xl font-black tabular-nums">{t.v.toFixed(2)}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mb-2 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-emerald-500 dark:bg-emerald-600" aria-hidden /> xG created
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-rose-500" aria-hidden /> xG conceded
              </span>
            </div>
            <div className="flex items-end gap-1.5">
              {s.xg.items.map((x, i) => {
                const last = i === s.xg!.items.length - 1;
                return (
                  <div
                    key={x.matchId}
                    className="flex-1 min-w-0 flex flex-col items-center gap-1"
                    title={`vs ${x.opp} · ${x.gf}-${x.ga} ${x.result === "W" ? "W" : x.result === "D" ? "D" : "L"} · xG ${x.xgFor.toFixed(2)} - ${x.xgAgainst.toFixed(2)}`}
                  >
                    <div className="flex items-end justify-center gap-0.5 w-full h-24">
                      <div className="w-3 max-w-[45%] flex flex-col items-center justify-end h-full">
                        {last && (
                          <span className="text-[9px] tabular-nums text-neutral-500 mb-0.5">{x.xgFor.toFixed(1)}</span>
                        )}
                        <div
                          className="w-full rounded-t bg-emerald-500 dark:bg-emerald-600"
                          style={{ height: `${Math.max(3, (x.xgFor / xgMax) * 100)}%` }}
                        />
                      </div>
                      <div className="w-3 max-w-[45%] flex flex-col items-center justify-end h-full">
                        {last && (
                          <span className="text-[9px] tabular-nums text-neutral-500 mb-0.5">{x.xgAgainst.toFixed(1)}</span>
                        )}
                        <div
                          className="w-full rounded-t bg-rose-500"
                          style={{ height: `${Math.max(3, (x.xgAgainst / xgMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold ${x.result === "W" ? "text-emerald-600 dark:text-emerald-400" : x.result === "L" ? "text-rose-500" : "text-neutral-400"}`}
                    >
                      {x.result === "W" ? "W" : x.result === "D" ? "D" : "L"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-neutral-400 break-keep">
              Hover a bar for the opponent, score and xG. Consistently creating more xG than you concede without the results
              points to bad luck or finishing; the reverse means outperforming the underlying play.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
