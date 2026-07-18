// 감독 전술 연구 아티클 대시보드 — Article.tacticalContext(TacticalManagerContext) 렌더.
// 위젯: 전적 헤더 + 포메이션 사용 분포 + 평균 포지션 피치(af grid 시즌 평균) + 득점 샷맵 + 월별 xG 흐름.
// 서버 컴포넌트 — 인터랙션은 title 툴팁만. 전술판 심화 편집은 /lineup?d= 프리로드 링크로 유도.
import Link from "next/link";
import { PenTool } from "lucide-react";
import Pitch, { PitchMarker } from "@/components/pitch/Pitch";
import type { TacticalManagerContext } from "@/lib/tactical/manager-aggregate";

const CARD = "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]";
const H3 = "text-sm font-bold text-zinc-900 dark:text-white";
const CAPTION = "mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-white/45";

const SIT_KO: Record<string, string> = {
  regular: "오픈 플레이", assisted: "어시스트 연결", penalty: "페널티킥", set_piece: "세트피스",
  corner: "코너킥", free_kick: "프리킥", fast_break: "역습", own_goal: "자책골",
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2 text-center dark:bg-white/[0.05]">
      <div className="text-[10px] font-medium text-zinc-500 dark:text-white/45">{label}</div>
      <div className="mt-0.5 text-sm font-black tabular-nums text-zinc-900 dark:text-white">{value}</div>
    </div>
  );
}

/** 포메이션 사용 분포 — 단일 시리즈 가로 바 + W-D-L·xG 텍스트 라벨. */
function FormationBars({ ctx }: { ctx: TacticalManagerContext }) {
  const max = Math.max(...ctx.formations.map((f) => f.count));
  return (
    <div className={CARD}>
      <h3 className={H3}>포메이션 사용 분포</h3>
      <div className="mt-3 space-y-2.5">
        {ctx.formations.slice(0, 5).map((f) => (
          <div key={f.formation} title={`${f.formation} — ${f.count}경기 ${f.w}승 ${f.d}무 ${f.l}패, 경기당 xG ${f.xgFor} / 실점 xG ${f.xgAgainst}`}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-bold text-zinc-800 dark:text-white/85">{f.formation}</span>
              <span className="tabular-nums text-zinc-500 dark:text-white/50">
                {f.count}경기 · {f.w}승 {f.d}무 {f.l}패 · xG {f.xgFor}
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-zinc-100 dark:bg-white/[0.06]">
              <div className="h-2 rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${(f.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className={CAPTION}>xG는 해당 포메이션 경기의 경기당 평균 기대득점.</p>
    </div>
  );
}

/** 평균 포지션 피치 — 최다 포메이션 경기에서 각 선수가 실제로 선 자리의 시즌 평균. */
function AvgPositionPitch({ ctx }: { ctx: TacticalManagerContext }) {
  const { mostUsedXi } = ctx;
  const mainCount = ctx.formations[0]?.count ?? 0;
  return (
    <div className={CARD}>
      <h3 className={H3}>베스트 XI 평균 포지션 — {mostUsedXi.formation}</h3>
      <div className="mx-auto mt-3 max-w-105">
        <Pitch orientation="vertical" aspect={3 / 4.2} stripes className="rounded-xl">
          {mostUsedXi.players.map((p) => {
            const photo = ctx.photoByAf?.[p.afId];
            return (
              <PitchMarker key={p.afId} x={p.x} y={100 - p.y} style={{ width: "76px" }}>
                <div className="flex flex-col items-center" title={`${p.nameKo} — 선발 ${p.starts}회`}>
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-800 shadow-lg ring-2 ring-white/80">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={p.nameKo} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-black text-neutral-300">{p.nameKo.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="mt-1 w-full truncate rounded bg-black/40 px-1 text-center text-[10px] font-bold leading-tight text-white">
                    {p.nameKo}
                  </div>
                  <div className="text-[9px] font-semibold leading-tight text-emerald-300 drop-shadow">선발 {p.starts}</div>
                </div>
              </PitchMarker>
            );
          })}
        </Pitch>
      </div>
      <p className={CAPTION}>
        {mostUsedXi.formation} 사용 {mainCount}경기에서 각 선수가 실제 배치된 자리의 평균 좌표. 명목 포메이션과 실제 서는 위치의 차이가 감독의 전술 디테일이다.
      </p>
      {ctx.lineupCode && (
        <Link
          href={`/lineup?d=${ctx.lineupCode}`}
          prefetch={false}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-bold text-blue-700 hover:border-blue-400 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300"
        >
          <PenTool className="h-3.5 w-3.5" aria-hidden />
          이 라인업으로 전술판 직접 그려보기
        </Link>
      )}
    </div>
  );
}

/** 시즌 득점 샷맵 — 상대 골문 방향(위) 좌표에 xG 크기 마커. */
function GoalShotmap({ ctx }: { ctx: TacticalManagerContext }) {
  if (!ctx.shotProfile || !ctx.goalsFor.length) return null;
  const sp = ctx.shotProfile.for;
  return (
    <div className={CARD}>
      <h3 className={H3}>시즌 득점 지도 — {sp.goals}골</h3>
      <div className="mx-auto mt-3 max-w-105">
        <Pitch orientation="vertical" aspect={3 / 4.2} className="rounded-xl">
          {ctx.goalsFor.map((g, i) => (
            <PitchMarker key={i} x={2.5 + g.y * 0.95} y={1.8 + g.x * 0.964}>
              <div
                className="rounded-full bg-amber-400/90 ring-1 ring-white/80"
                style={{ width: `${10 + g.xg * 18}px`, height: `${10 + g.xg * 18}px` }}
                title={`${g.min}' ${g.nameKo} — xG ${g.xg.toFixed(2)}${SIT_KO[g.sit] ? ` (${SIT_KO[g.sit]})` : ""}`}
              />
            </PitchMarker>
          ))}
        </Pitch>
      </div>
      <p className={CAPTION}>
        원 크기 = 슈팅 순간 기대득점(xG). 시즌 슈팅 {sp.shots}회, xG 합 {sp.xg}, 박스 안 비중 {Math.round(sp.insideBoxShare * 100)}%.
        최다 득점 {sp.topShooters.slice(0, 3).map((s) => `${s.nameKo} ${s.goals}골`).join(", ")}.
      </p>
    </div>
  );
}

/** 월별 xG 득실차 — 0 기준 다이버징 바 (양수 파랑 = 공격 우위). */
function XgMonthly({ ctx }: { ctx: TacticalManagerContext }) {
  const rows = ctx.monthly.filter((m) => m.played > 0);
  if (rows.length < 2) return null;
  const diffs = rows.map((m) => m.xgFor - m.xgAgainst);
  const maxAbs = Math.max(...diffs.map(Math.abs), 0.1);
  return (
    <div className={CARD}>
      <h3 className={H3}>월별 xG 득실차</h3>
      <div className="mt-3 flex items-stretch justify-between gap-1.5">
        {rows.map((m, i) => {
          const v = diffs[i];
          const h = (Math.abs(v) / maxAbs) * 44;
          const mo = Number(m.month.slice(5));
          return (
            <div
              key={m.month}
              className="flex min-w-0 flex-1 flex-col items-center"
              title={`${mo}월 — ${m.w}승 ${m.d}무 ${m.l}패, xG ${m.xgFor} 대 ${m.xgAgainst}`}
            >
              <div className="flex h-12 w-full items-end justify-center">
                {v >= 0 && <div className="w-3 rounded-t-sm bg-blue-500 dark:bg-blue-400" style={{ height: `${h}px` }} />}
              </div>
              <div className="my-0.5 h-px w-full bg-zinc-300 dark:bg-white/20" />
              <div className="flex h-12 w-full items-start justify-center">
                {v < 0 && <div className="w-3 rounded-b-sm bg-rose-500 dark:bg-rose-400" style={{ height: `${h}px` }} />}
              </div>
              <div className="mt-1 text-[10px] font-semibold tabular-nums text-zinc-600 dark:text-white/55">{mo}월</div>
              <div className={`text-[10px] font-bold tabular-nums ${v >= 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>
                {v >= 0 ? "+" : ""}{v.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>
      <p className={CAPTION}>월 합산 기대득점 − 기대실점. 양수(파랑)면 그 달 경기 내용이 상대보다 우위였다는 뜻.</p>
    </div>
  );
}

export default function TacticalManagerSection({ ctx }: { ctx: TacticalManagerContext }) {
  const r = ctx.record;
  const sacked = ctx.coachStints.length > 1;
  return (
    <section className="my-6 space-y-4">
      {/* 헤더 — 감독 + 시즌 전적 */}
      <div className={CARD}>
        <div className="flex items-center gap-3">
          {ctx.coachPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.coachPhoto} alt={ctx.coach.nameKo} className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-white/15" />
          )}
          <div className="min-w-0">
            <div className="text-base font-black text-zinc-900 dark:text-white">
              {ctx.coach.nameKo} — {ctx.team.nameKo}
            </div>
            <div className="text-xs text-zinc-500 dark:text-white/50">
              {ctx.seasonLabel} 시즌{ctx.coach.preferredFormation ? ` · 선호 포메이션 ${ctx.coach.preferredFormation}` : ""}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatTile label="순위" value={`${r.rank}위`} />
          <StatTile label="승점" value={`${r.points}`} />
          <StatTile label="전적" value={`${r.w}승 ${r.d}무 ${r.l}패`} />
          <StatTile label="득실" value={`${r.gf}-${r.ga}`} />
          <StatTile label="경기당 로테이션" value={`${ctx.xiChanges.avgPerMatch}명`} />
          <StatTile label="전 경기 선발" value={ctx.xiChanges.everPresent.length ? `${ctx.xiChanges.everPresent.length}명` : "없음"} />
        </div>
        {sacked && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-105 text-left text-xs">
              <thead>
                <tr className="text-zinc-500 dark:text-white/45">
                  <th className="py-1 pr-2 font-medium">감독</th>
                  <th className="py-1 pr-2 font-medium">기간</th>
                  <th className="py-1 pr-2 font-medium">전적</th>
                  <th className="py-1 font-medium">승점/경기</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800 dark:text-white/80">
                {ctx.coachStints.map((s, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-white/[0.06]">
                    <td className="py-1 pr-2 font-bold">{s.coachKo}</td>
                    <td className="py-1 pr-2 tabular-nums">{s.from.slice(5)} ~ {s.to.slice(5)}</td>
                    <td className="py-1 pr-2 tabular-nums">{s.played}경기 {s.w}승 {s.d}무 {s.l}패</td>
                    <td className="py-1 tabular-nums">{s.ppg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormationBars ctx={ctx} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AvgPositionPitch ctx={ctx} />
        <GoalShotmap ctx={ctx} />
      </div>
      <XgMonthly ctx={ctx} />
    </section>
  );
}
