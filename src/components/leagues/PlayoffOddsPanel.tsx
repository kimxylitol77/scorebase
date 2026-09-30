// 리그 예측 탭 — 플레이오프 확률판(KBO·NPB·NHL·NBA·KHL·MLS·KBL). 우승 후보 카드 + 조별 라운드 도달 확률표.
// 숫자는 playoff-sim(1h 공용 캐시). MLB 는 실제 대진 기반 MlbPostseasonOdds 가 따로 맡는다.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { STAGES } from "@/lib/predict/playoff-sim/engine";
import type { PlayoffOddsResult } from "@/lib/predict/playoff-sim/load";

const TITLE: Record<string, string> = {
  KBO: "포스트시즌·한국시리즈 우승 확률",
  NPB: "클라이맥스 시리즈·일본시리즈 우승 확률",
  NHL: "플레이오프·스탠리컵 우승 확률",
  NBA: "플레이오프·NBA 파이널 우승 확률",
  KHL: "플레이오프·가가린컵 우승 확률",
  MLS: "MLS컵 플레이오프·우승 확률",
  KBL: "플레이오프·챔피언결정전 우승 확률",
};
const RULE: Record<string, string> = {
  KBO: "정규시즌 5위까지 가을야구. 와일드카드(4위 1승 안고 시작) → 준PO(5전) → PO(5전) → 한국시리즈(7전).",
  NPB: "리그별 3위까지. 퍼스트 스테이지(3전, 2위 홈) → 파이널 스테이지(1위 1승 안고 6전 4선승) → 일본시리즈(7전).",
  NHL: "지구 3위 + 컨퍼런스 와일드카드 2장. 지구 브래킷 고정, 전 라운드 7전 4선승.",
  NBA: "컨퍼런스 1~6위 직행 + 7~10위 플레이인. 1v8·4v5 / 2v7·3v6 브래킷, 전 라운드 7전 4선승.",
  KHL: "컨퍼런스 8위까지. 라운드마다 재시드, 전 라운드 7전 4선승(근사).",
  MLS: "컨퍼런스 9위까지. 8v9 와일드카드 단판 → 1라운드 3전 2선승 → 컨퍼런스 4강·결승 단판 → MLS컵 단판(무승부는 승부차기 50%).",
  KBL: "정규리그 6위까지. 6강(3v6·4v5, 5전) → 4강(1·2위 직행, 5전) → 챔피언결정전(7전).",
};

function pctText(p: number) {
  if (p >= 0.9995) return "✓";
  if (p <= 0) return "—";
  if (p < 0.001) return "<0.1%";
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
}

export default async function PlayoffOddsPanel({ result, bracketHref }: { result: PlayoffOddsResult; bracketHref?: string }) {
  const { league, odds, groupLabel, record } = result;
  const stages = STAGES[league];
  const last = stages.length - 1;
  const teams = await prisma.team.findMany({ where: { id: { in: odds.map((o) => o.teamId) } }, select: { id: true, name: true, logoUrl: true } });
  const tm = new Map(teams.map((t) => [t.id, t]));
  const nameOf = (id: number) => {
    const t = tm.get(id);
    return t ? toKoreanTeamName(t.name, league) || t.name : `팀 ${id}`;
  };
  const Logo = ({ id, size }: { id: number; size: number }) => {
    const src = tm.get(id)?.logoUrl;
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-white object-contain p-0.5" style={{ width: size, height: size }} />
    ) : (
      <span className="shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" style={{ width: size, height: size }} />
    );
  };
  const post = result.phase === "post";
  const champion = odds.find((o) => o.stage[last] >= 0.9995) ?? null;
  const top = [...odds].filter((o) => o.stage[last] > 0).sort((a, b) => b.stage[last] - a.stage[last]).slice(0, 4);
  // 포스트시즌 중 탈락 = 진출했는데 우승 가능성이 0 (이미 진 시리즈가 있다)
  const out = (o: (typeof odds)[number]) => o.stage[0] < 0.001 || (post && o.stage[last] === 0);
  const groups = [...new Set(odds.map((o) => o.group))].sort();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">
          {TITLE[league]}
          {post && (
            <span className="ml-2 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{champion ? "시즌 종료" : "포스트시즌 진행 중"}</span>
          )}
          {result.early && (
            <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">시즌 초반 · Elo 비중 큼</span>
          )}
        </h2>
        <p className="mt-1 text-xs text-neutral-500 break-keep">
          {post
            ? "정규시즌이 끝나 공식 최종 순위로 시드를 고정했습니다. 끝난 시리즈는 결과, 진행 중인 시리즈는 현재 승수부터 남은 경기를 Elo 로 3,000번 치른 결과입니다. "
            : `남은 정규시즌 ${result.remaining.toLocaleString()}경기를 Elo 로 3,000번 치르고, 그때마다 규정대로 시드를 정해 플레이오프를 끝까지 치른 결과입니다. `}
          {RULE[league]}
        </p>
      </div>
      {bracketHref && (
        <Link
          href={bracketHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-600 ring-1 ring-rose-500/20 transition hover:bg-rose-500/15 dark:text-rose-400"
        >
          포스트시즌 대진표 →
        </Link>
      )}
      </div>

      {champion && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 p-5 ring-1 ring-amber-300/60 dark:from-amber-950/30 dark:to-yellow-950/20 dark:ring-amber-700/40">
          <Logo id={champion.teamId} size={44} />
          <div>
            <div className="text-xs font-bold text-amber-700 dark:text-amber-300">{stages[last - 1]} 우승</div>
            <div className="text-2xl font-black">{nameOf(champion.teamId)}</div>
          </div>
        </div>
      )}
      {!champion && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {top.map((o, i) => (
          <div key={o.teamId} className="rounded-2xl bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-400">{i + 1}위 후보</span>
              <Logo id={o.teamId} size={36} />
            </div>
            <div className="mt-1 truncate text-sm font-bold">{nameOf(o.teamId)}</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{pctText(o.stage[last])}</div>
            <div className="mt-0.5 truncate text-[11px] text-neutral-500 tabular-nums">
              {stages[0]} {pctText(o.stage[0])}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, o.stage[last] * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      )}

      <div className={`grid gap-4 ${groups.length > 1 ? "xl:grid-cols-2" : ""}`}>
        {groups.map((g) => {
          const rows = odds.filter((o) => o.group === g).sort((a, b) => b.stage[last] - a.stage[last] || b.stage[0] - a.stage[0]);
          return (
            <div key={g} className="min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
              {groupLabel[g] && <div className="px-4 pt-3 pb-1 text-xs font-bold text-neutral-700 dark:text-neutral-200">{groupLabel[g]}</div>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] text-neutral-500 whitespace-nowrap">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">팀</th>
                      {stages.map((s, k) => (
                        <th key={s} className={`px-0.5 py-2 text-center font-medium sm:px-1 ${k > 0 && k < last && stages.length > 4 ? "hidden sm:table-cell" : ""}`}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                    {rows.map((o) => (
                      <tr key={o.teamId} className={out(o) ? "opacity-50" : ""}>
                        <td className="max-w-[9.5rem] px-2 py-1.5 sm:max-w-none">
                          <Link href={`/teams/${o.teamId}`} prefetch={false} className="flex min-w-0 items-center gap-2 hover:underline">
                            <Logo id={o.teamId} size={22} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{nameOf(o.teamId)}</span>
                              <span className="block truncate text-[10px] text-neutral-500 tabular-nums">{record[o.teamId]}</span>
                            </span>
                          </Link>
                        </td>
                        {o.stage.map((p, k) => (
                          <td key={k} className={`px-0.5 py-1.5 text-center sm:px-1 ${k > 0 && k < last && stages.length > 4 ? "hidden sm:table-cell" : ""}`}>
                            <span
                              className={`inline-block min-w-[2.6rem] rounded-md px-1 py-1 text-[11px] tabular-nums sm:min-w-[3.1rem] sm:text-xs ${k === last ? "font-black" : "font-semibold"} ${p <= 0 ? "text-neutral-400" : "text-neutral-900 dark:text-white"}`}
                              style={p > 0 ? { background: `rgba(16,185,129,${p >= 0.9995 ? 0.18 : Math.min(0.28, 0.04 + p * 0.3)})` } : undefined}
                            >
                              {pctText(p)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-400 break-keep">
        경기 승률은 자체 Elo(홈 어드밴티지 포함) · 휴대폰에선 중간 라운드 열을 줄여 진출·우승만 보입니다 · 1시간마다 갱신 · 베팅 권유가 아닌 데이터 모델 추정
      </p>
    </section>
  );
}
