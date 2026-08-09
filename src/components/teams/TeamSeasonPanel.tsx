// 팀 페이지 시즌 데이터 패널 — 시즌 칩 토글로 "시즌 통계·팀 시즌 통계·xG 추이"를 시즌 단위로 접는다.
// 현재 시즌 기본, 과거 시즌은 칩 뒤로 접힘. 과거 팀 시즌 통계는 TeamSeasonStatArchive(영구 아카이브) 소스.
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
              {x.label} 시즌{x.isCurrent ? "" : " (완료)"}
            </button>
          ))}
        </div>
      )}

      {/* 시즌 통계 */}
      {s.stats ? (
        <section>
          <SectionH title="시즌 통계" subtitle={s.label ? `${s.label} 시즌` : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="순위" value={`${s.stats.position}위`} subtle={`/ ${s.stats.teams}팀`} />
            <Stat
              label="승점"
              value={`${s.stats.points}점`}
              subtle={`${s.stats.wins}승 ${s.stats.draws}무 ${s.stats.losses}패`}
            />
            <Stat
              label="골득실"
              value={`${s.stats.goalDiff > 0 ? "+" : ""}${s.stats.goalDiff}`}
              subtle={`${s.stats.goalsFor} - ${s.stats.goalsAgainst}`}
            />
            {s.elo != null ? (
              <Stat
                label="Elo"
                value={Math.round(s.elo).toString()}
                subtle={`공격 ${s.stats.attackRank ?? "-"}위 / 수비 ${s.stats.defenseRank ?? "-"}위`}
              />
            ) : (
              <Stat
                label="공격 / 수비"
                value={`${s.stats.attackRank ?? "-"}위 / ${s.stats.defenseRank ?? "-"}위`}
                subtle="리그 내 득점·실점 랭크"
              />
            )}
          </div>
        </section>
      ) : (
        s.isCurrent && (
          <section>
            <SectionH title="시즌 통계" subtitle={s.label ? `${s.label} 시즌` : undefined} />
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500">
              새 시즌 데이터가 쌓이는 중입니다. 경기가 진행되면 순위·승점·득실이 여기 채워집니다.
            </div>
          </section>
        )
      )}

      {/* 팀 시즌 통계 (ts 리그 집계 — 시즌별 영구 아카이브) */}
      {s.tsStat && (
        <section>
          <SectionH
            title="팀 시즌 통계"
            subtitle={[s.label ? `${s.label} 시즌` : null, s.tsStat.matches ? `${s.tsStat.matches}경기 · 리그 집계` : "리그 집계"].filter(Boolean).join(" · ")}
            icon={<BarChart3 className="h-5 w-5" aria-hidden />}
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {([
              { label: "득점", v: s.tsStat.goals },
              { label: "실점", v: s.tsStat.against },
              { label: "점유율", v: s.tsStat.poss, suf: "%" },
              { label: "슈팅", v: s.tsStat.shots },
              { label: "유효슈팅", v: s.tsStat.sot },
              { label: "패스성공", v: s.tsStat.passAcc, suf: "%" },
              { label: "드리블성공", v: s.tsStat.dribbleSucc },
              { label: "태클", v: s.tsStat.tackles },
              { label: "코너", v: s.tsStat.corners },
              { label: "파울", v: s.tsStat.fouls },
              { label: "경고", v: s.tsStat.yellow },
              { label: "퇴장", v: s.tsStat.red },
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
            title="xG 추이"
            subtitle={`${s.label ? `${s.label} 시즌 · ` : ""}${s.xg.count}경기 평균 · 차트는 최근 ${s.xg.items.length}경기`}
            icon={<Target className="h-5 w-5" aria-hidden />}
          />
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { label: "경기당 만든 xG", v: s.xg.xgForAvg },
                { label: "경기당 허용 xG", v: s.xg.xgAgainstAvg },
                { label: "경기당 실제 득점", v: s.xg.goalsAvg },
              ] as { label: string; v: number }[]).map((t) => (
                <div key={t.label} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
                  <div className="text-xl font-black tabular-nums">{t.v.toFixed(2)}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mb-2 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-emerald-500 dark:bg-emerald-600" aria-hidden /> 만든 xG
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-rose-500" aria-hidden /> 허용 xG
              </span>
            </div>
            <div className="flex items-end gap-1.5">
              {s.xg.items.map((x, i) => {
                const last = i === s.xg!.items.length - 1;
                return (
                  <div
                    key={x.matchId}
                    className="flex-1 min-w-0 flex flex-col items-center gap-1"
                    title={`vs ${x.opp} · ${x.gf}-${x.ga} ${x.result === "W" ? "승" : x.result === "D" ? "무" : "패"} · xG ${x.xgFor.toFixed(2)} - ${x.xgAgainst.toFixed(2)}`}
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
                      {x.result === "W" ? "승" : x.result === "D" ? "무" : "패"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-neutral-400 break-keep">
              막대에 마우스를 올리면 상대·스코어·xG 를 볼 수 있습니다. 만든 xG 가 허용 xG 보다 꾸준히 높은데
              결과가 안 따르면 불운 또는 결정력 문제, 반대면 내용 대비 초과 성과입니다.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
