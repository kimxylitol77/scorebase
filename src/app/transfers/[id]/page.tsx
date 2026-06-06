// 선수 개인페이지 (TheSports 기반) — 몸값 추이 + 변동 이력 + 이적 기록.
//   id = TheSports player id. PlayerMarketValue / TheSportsPlayer / FootballTransfer 만 사용 (api-football 안 씀).
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
};
const POS_LABEL: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
}
function fmtDate(unixSec?: number): string {
  if (!unixSec) return "—";
  const d = new Date(unixSec * 1000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface HistPt { market_time?: number; market_value?: number; team_id?: string; age?: number }

async function loadPlayer(id: string) {
  const mv = await prisma.playerMarketValue.findUnique({ where: { id } });
  if (!mv) return null;
  const tsp = await prisma.theSportsPlayer.findUnique({
    where: { id },
    select: { nameKo: true, name: true, photoUrl: true, position: true },
  });
  return { mv, tsp };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await loadPlayer(id);
  if (!p) return { title: "선수 미발견" };
  const name = p.tsp?.nameKo || p.tsp?.name || "선수";
  const val = p.mv.currentValue ? Math.round(p.mv.currentValue / 1e6) : null;
  return {
    title: `${name} 시장가치${val ? ` €${val}M` : ""} — 몸값 추이`,
    description: `${name} 의 시장가치 변동 추이와 이적 기록. TheSports 데이터 기반.`,
  };
}

// 면적 라인차트 (SVG)
function ValueChart({ points }: { points: { t: number; v: number }[] }) {
  if (points.length < 2) return null;
  const w = 640, h = 180, padX = 8, padTop = 16, padBot = 24;
  const vals = points.map((p) => p.v);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const xy = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (w - padX * 2);
    const y = padTop + (1 - (p.v - min) / span) * (h - padTop - padBot);
    return { x, y };
  });
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${padX},${h - padBot} ${line} ${w - padX},${h - padBot}`;
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "#06b6d4" : "#f87171";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="vgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#vgrad)" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={stroke} />
      ))}
    </svg>
  );
}

export default async function PlayerTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await loadPlayer(id);
  if (!p) notFound();
  const { mv, tsp } = p;

  const name = tsp?.nameKo || tsp?.name || "선수";
  const value = mv.currentValue ? Math.round(mv.currentValue / 1e6) : null;
  const league = mv.league && LEAGUE_LABEL[mv.league] ? mv.league : null;

  // 팀 resolve (ts → 우리 Team)
  let teamName = "—", teamLogo: string | null = null, ourTeamId: number | null = null;
  if (mv.teamId) {
    const ts = await prisma.teamSourceId.findFirst({
      where: { source: "thesports", externalId: mv.teamId },
      select: { teamId: true },
    });
    if (ts) {
      const team = await prisma.team.findUnique({ where: { id: ts.teamId }, select: { id: true, name: true, logoUrl: true } });
      if (team) { teamName = team.name; teamLogo = team.logoUrl; ourTeamId = team.id; }
    }
  }

  // 몸값 이력
  const hist = (Array.isArray(mv.history) ? (mv.history as HistPt[]) : [])
    .filter((h) => (h?.market_value || 0) > 0 && h?.market_time);
  const points = hist.map((h) => ({ t: h.market_time!, v: (h.market_value || 0) / 1e6 }));
  const peak = points.length ? Math.max(...points.map((p) => p.v)) : value || 0;
  // 직전 시점 대비 변동(%) — 리스트와 동일 기준. 유스 시절 초기값 대비 "전체" 는
  // 수천% 가 나와 무의미하므로 쓰지 않는다.
  const prevV = points.length >= 2 ? points[points.length - 2].v : 0;
  const recentChg = prevV > 0 && value != null ? Math.round(((value - prevV) / prevV) * 100) : 0;

  // 이적 기록
  const transfers = await prisma.footballTransfer.findMany({
    where: { playerId: id },
    orderBy: { transferTime: "desc" },
    take: 30,
  });

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <Link href={`/transfers${league ? `?league=${mv.league}` : ""}`} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
        ← 이적시장
      </Link>

      {/* 헤더 */}
      <header className="flex items-center gap-4 flex-wrap">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
          {tsp?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tsp.photoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-neutral-500 dark:text-neutral-400">{name.slice(0, 1)}</span>
          )}
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name}</h1>
            {tsp?.position && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                {POS_LABEL[tsp.position]}
              </span>
            )}
            {mv.age != null && <span className="text-sm text-neutral-500">{mv.age}세</span>}
          </div>
          <Link
            href={ourTeamId != null ? `/teams/${ourTeamId}` : "#"}
            className="text-sm text-neutral-500 flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition w-fit"
          >
            {teamLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamLogo} alt="" className="w-4 h-4 object-contain" />
            )}
            {teamName}
            {league && <span className="text-neutral-400">· {LEAGUE_LABEL[mv.league!]}</span>}
          </Link>
        </div>
        {value != null && (
          <div className="ml-auto text-right leading-tight">
            <div className="text-xs text-neutral-400">현재 시장가치</div>
            <div className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums">€{value}M</div>
            <div className="text-xs text-neutral-500 tabular-nums">{krw(value)}</div>
            {points.length >= 2 && (
              <div className={`text-xs font-semibold tabular-nums ${recentChg >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {recentChg >= 0 ? "▲" : "▼"} {Math.abs(recentChg)}% <span className="text-neutral-400 font-normal">최근</span>
              </div>
            )}
          </div>
        )}
      </header>

      {/* 몸값 추이 차트 */}
      {points.length >= 2 && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">시장가치 추이</h2>
            <span className="text-xs text-neutral-400">최고 €{Math.round(peak)}M</span>
          </div>
          <ValueChart points={points} />
        </section>
      )}

      {/* 변동 이력 테이블 */}
      {hist.length >= 1 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">변동 이력 ({hist.length})</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">시점</th>
                  <th className="text-right px-3 py-2 font-medium">시장가치</th>
                  <th className="text-right px-3 py-2 font-medium">원화</th>
                  <th className="text-right px-3 py-2 font-medium">나이</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {[...hist].reverse().map((h, i) => {
                  const v = Math.round((h.market_value || 0) / 1e6);
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{fmtDate(h.market_time)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-cyan-600 dark:text-cyan-400">€{v}M</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{krw(v)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{h.age ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 이적 기록 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">이적 기록 ({transfers.length})</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-neutral-500">이적 기록이 아직 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className="text-xs text-neutral-400 tabular-nums w-16 shrink-0">{fmtDate(t.transferTime ?? undefined)}</span>
                <span className="truncate text-neutral-500">{t.fromTeamName || "—"}</span>
                <span className="text-neutral-400 shrink-0">→</span>
                <span className="truncate font-semibold">{t.toTeamName || "—"}</span>
                {t.transferFee != null && t.transferFee > 0 && (
                  <span className="ml-auto text-xs font-semibold text-cyan-600 dark:text-cyan-400 shrink-0">€{Math.round(t.transferFee / 1e6)}M</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: TheSports — 시장가치(market value)와 변동 이력. 원화는 €1 = ₩{EUR_KRW.toLocaleString()} 기준 환산.
      </p>
    </article>
  );
}
