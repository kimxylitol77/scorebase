// 선수 개인페이지 (TheSports 기반) — 몸값 추이 + 변동 이력 + 이적 기록.
//   id = TheSports player id. PlayerMarketValue / TheSportsPlayer / FootballTransfer 만 사용 (api-football 안 씀).
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import rawOverrides from "../../../../data/player-overrides.json";
import rawSeason from "../../../../data/player-season-stats.json";

interface CareerEntry { club: string; start: number | null; end: number | null; apps: number | null; goals: number | null; loan: boolean; nt: boolean }
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string; career?: CareerEntry[] }>;

interface SeasonStat {
  lg: string; season: string; team: string | null; pos: string | null;
  matches: number | null; starts: number | null; goals: number | null; assists: number | null;
  minutes: number | null; shots: number | null; sot: number | null; keyPasses: number | null;
  passAcc: number | null; tackles: number | null; interceptions: number | null;
  yellow: number | null; red: number | null; saves: number | null;
}
const SEASON = rawSeason as Record<string, SeasonStat>;

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
  const name = OVERRIDES[id]?.nameKo || p.tsp?.nameKo || p.tsp?.name || "선수";
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

function yrRange(s: number | null, e: number | null): string {
  if (s == null && e == null) return "—";
  const ss = s != null ? String(s) : "?";
  if (e == null) return `${ss}–현재`;
  return s === e ? ss : `${ss}–${e}`;
}

// 이번 시즌 성적 (TheSports season/recent/player/stat) — 포지션별 핵심 스탯 타일
function SeasonSection({ s }: { s: SeasonStat }) {
  const isGK = s.pos === "G";
  const tiles: { label: string; val: string; hi?: boolean }[] = [];
  const add = (label: string, v: number | null, hi = false, suffix = "") => {
    if (v != null) tiles.push({ label, val: `${v}${suffix}`, hi });
  };
  add("경기", s.matches);
  if (isGK) {
    add("선방", s.saves, true);
  } else {
    add("골", s.goals, true);
    add("도움", s.assists, true);
  }
  add("선발", s.starts);
  add("출전", s.minutes, false, "분");
  if (!isGK) {
    add("슈팅", s.shots);
    add("유효슈팅", s.sot);
    add("키패스", s.keyPasses);
    add("패스성공", s.passAcc, false, "%");
    add("태클", s.tackles);
    add("가로채기", s.interceptions);
  }
  add("경고", s.yellow);
  add("퇴장", s.red);
  if (!tiles.length) return null;
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{s.season} 시즌 성적</h2>
        {s.team && <span className="text-xs text-neutral-400">{toKoreanTeamName(s.team) || s.team}</span>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-neutral-50 dark:bg-neutral-900/60 px-3 py-2.5 text-center">
            <div className={`text-xl font-black tabular-nums ${t.hi ? "text-cyan-600 dark:text-cyan-400" : ""}`}>{t.val}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface ValuePoint { time: number; v: number; age?: number | null; chg: number | null }

// 커리어 + 몸값 변동 병합 타임라인 (Wikidata P54 클럽 이력 × TheSports 몸값 history).
//  클럽 시기별로 그 기간의 시장가치 변동을 묶어 한 타임라인에 표시. 시니어 국가대표는 상단 요약.
function CareerTimeline({ entries, hist }: { entries: CareerEntry[]; hist: ValuePoint[] }) {
  // 현 소속(end=null) 우선 → 그다음 최근 시작순. (Wikidata 등록일 기준이라 임대가 본클럽보다
  //  start 가 늦는 경우가 있어 단순 역순으로는 현 소속이 묻힘 → 진행중 먼저)
  const clubs = [...entries.filter((e) => !e.nt)].sort((a, b) => {
    const ao = a.end == null ? 1 : 0, bo = b.end == null ? 1 : 0;
    return ao !== bo ? bo - ao : (b.start ?? 0) - (a.start ?? 0);
  });
  const nts = [...entries.filter((e) => e.nt)].sort((a, b) => (b.apps ?? 0) - (a.apps ?? 0));
  if (!clubs.length && !nts.length) return null;

  // 몸값 변동을 클럽 시기에 배정 — 연도 기준, 겹치면 시작 늦은(최근)·기간 짧은(임대) 우선.
  //  (예: 잘츠부르크 2019-20 ↔ 도르트문트 2020-22 의 2020 → 도르트문트 / 본클럽 ↔ 임대 → 임대)
  const bestIdx = (year: number): number => {
    let best = -1, bestStart = -Infinity, bestSpan = Infinity;
    clubs.forEach((c, i) => {
      const st = c.start ?? -Infinity, en = c.end ?? 9999;
      if (year >= st && year <= en) {
        const span = en - st;
        if (st > bestStart || (st === bestStart && span < bestSpan)) { bestStart = st; bestSpan = span; best = i; }
      }
    });
    if (best === -1) { let nd = Infinity; clubs.forEach((c, i) => { const d = Math.abs((c.start ?? 9999) - year); if (d < nd) { nd = d; best = i; } }); }
    return best;
  };
  const byClub: ValuePoint[][] = clubs.map(() => []);
  if (clubs.length) for (const vp of hist) { const idx = bestIdx(new Date(vp.time * 1000).getUTCFullYear()); if (idx >= 0) byClub[idx].push(vp); }
  byClub.forEach((arr) => arr.sort((a, b) => b.time - a.time));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">커리어 & 몸값 변동</h2>
      <p className="text-xs text-neutral-500 mb-3">클럽별 이력과 그 시기의 시장가치 변동.</p>
      {nts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {nts.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-xs">
              <span className="text-neutral-500">🏳️ {n.club}</span>
              {n.apps != null && <span className="font-semibold tabular-nums">{n.apps}경기</span>}
              {n.goals != null && <span className="text-cyan-600 dark:text-cyan-400 font-semibold tabular-nums">{n.goals}골</span>}
            </span>
          ))}
        </div>
      )}
      {clubs.length > 0 && (
        <div className="relative border-l border-neutral-200 dark:border-neutral-800 ml-1.5">
          {clubs.map((c, i) => (
            <div key={i} className="relative pl-5 py-2.5">
              <span className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950 ${c.end == null ? "bg-cyan-500" : "bg-neutral-300 dark:bg-neutral-600"}`} />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-400 tabular-nums w-[68px] shrink-0">{yrRange(c.start, c.end)}</span>
                <span className="font-semibold">{c.club}</span>
                {c.loan && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">임대</span>}
                {(c.apps != null || c.goals != null) && (
                  <span className="ml-auto text-xs text-neutral-500 tabular-nums shrink-0">
                    {c.apps != null ? `${c.apps}경기` : ""}{c.goals != null ? ` · ${c.goals}골` : ""}
                  </span>
                )}
              </div>
              {byClub[i].length > 0 && (
                <div className="mt-2 ml-1 pl-3 border-l border-dashed border-neutral-200 dark:border-neutral-800 space-y-1">
                  {byClub[i].map((vp, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-400 tabular-nums w-12 shrink-0">{fmtDate(vp.time)}</span>
                      <span className="font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums">€{vp.v}M</span>
                      {vp.chg != null && vp.chg !== 0 && (
                        <span className={`tabular-nums ${vp.chg > 0 ? "text-emerald-500" : "text-rose-500"}`}>{vp.chg > 0 ? "▲" : "▼"}{Math.abs(vp.chg)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function PlayerTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await loadPlayer(id);
  if (!p) notFound();
  const { mv, tsp } = p;

  const name = OVERRIDES[id]?.nameKo || tsp?.nameKo || tsp?.name || "선수";
  const ov = OVERRIDES[id];
  const career = ov?.career || [];
  const season = SEASON[id];
  const value = mv.currentValue ? Math.round(mv.currentValue / 1e6) : null;
  const league = mv.league && LEAGUE_LABEL[mv.league] ? mv.league : null;

  // 팀 resolve (ts → 우리 Team). 한 ts 가 여러 Team 에 매핑되면 해당 리그 Team 우선(동명 클럽 방지).
  let teamName = "—", teamLogo: string | null = null, ourTeamId: number | null = null;
  if (mv.teamId) {
    const tss = await prisma.teamSourceId.findMany({
      where: { source: "thesports", externalId: mv.teamId },
      select: { teamId: true },
    });
    if (tss.length) {
      const teams = await prisma.team.findMany({
        where: { id: { in: tss.map((t) => t.teamId) } },
        select: { id: true, name: true, logoUrl: true, league: true },
      });
      const team = teams.find((t) => t.league === mv.league) || teams[0];
      if (team) { teamName = toKoreanTeamName(team.name) || team.name; teamLogo = team.logoUrl; ourTeamId = team.id; }
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

  // 몸값 변동 포인트 (연대순 + 직전 대비 변동%) — 커리어 타임라인에 클럽별로 병합 표시
  const histAsc = [...hist].sort((a, b) => (a.market_time || 0) - (b.market_time || 0));
  const valuePoints = histAsc.map((h, i) => {
    const v = Math.round((h.market_value || 0) / 1e6);
    const pv = i > 0 ? Math.round((histAsc[i - 1].market_value || 0) / 1e6) : 0;
    return { time: h.market_time!, v, age: h.age, chg: pv > 0 ? Math.round(((v - pv) / pv) * 100) : null };
  });

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
            {ov?.country && (
              <span className="flex items-center gap-1 text-sm text-neutral-500">
                {ov.flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ov.flag} alt="" className="w-4 h-3 object-cover rounded-[1px]" />
                )}
                {ov.country}
              </span>
            )}
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

      {/* 이번 시즌 성적 */}
      {season && <SeasonSection s={season} />}

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

      {/* 커리어 & 몸값 변동 — 커리어 데이터 있으면 병합 타임라인, 없으면 단순 변동이력 테이블 */}
      {career.length > 0 ? (
        <CareerTimeline entries={career} hist={valuePoints} />
      ) : hist.length >= 1 ? (
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
      ) : null}

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
        ⓘ 데이터 출처: 시장가치·이적·시즌 성적 = TheSports · 국적·커리어 이력 = Wikidata. 원화는 €1 = ₩{EUR_KRW.toLocaleString()} 기준 환산.
      </p>
    </article>
  );
}
