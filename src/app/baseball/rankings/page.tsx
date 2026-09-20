// 야구 선수 랭킹 — KBO·MLB·NPB 타자/투수 종합 지수·가성비(연봉 대비)·폼(최근 경기), 순위 변동 화살표(일별 스냅샷).
// 계산: src/lib/sports/baseball/player-rankings.ts · 스냅샷: src/lib/transfers/rank-snapshots.ts (list = bb:{리그}:{뷰}:{역할})
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import AmbientGlow from "@/components/AmbientGlow";
import { RankDelta } from "@/app/transfers/PlayerRankingTable";
import { npbPlayerPhoto } from "@/lib/sports/npb-player-ko";
import {
  BB_LEAGUES, getBbLeagueData, computeBatPower, computePitPower, computeBbBargain, computeBbForm,
  POWER_MIN_GAMES_RATIO, POWER_MIN_IP, FORM_BAT_GAMES, FORM_BAT_MIN_AB, FORM_PIT_GAMES, FORM_PIT_MIN_IP,
  type BbLeague, type BbRole, type BbPlayerRow, type BbForm,
} from "@/lib/sports/baseball/player-rankings";
import { kstToday, writeRankSnapshot, getRankBaseline, baselineRankMap, prevRankOf } from "@/lib/transfers/rank-snapshots";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";

const PER = 25;
const LEAGUE_KO: Record<BbLeague, string> = { KBO: "KBO", MLB: "MLB", NPB: "NPB" };
const VIEWS = ["power", "bargain", "form"] as const;
type View = (typeof VIEWS)[number];
const VIEW_KO: Record<View, string> = { power: "종합", bargain: "가성비", form: "폼" };
const ROLE_KO: Record<BbRole, string> = { bat: "타자", pit: "투수" };
type SP = { league?: string; view?: string; role?: string; page?: string };

function parse(sp: SP) {
  const league = (BB_LEAGUES as string[]).includes(sp.league ?? "") ? (sp.league as BbLeague) : "KBO";
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "power";
  const role: BbRole = sp.role === "pit" ? "pit" : "bat";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  return { league, view, role, page };
}
const url = (o: { league: BbLeague; view: View; role: BbRole; page?: number }) => {
  const q = new URLSearchParams();
  if (o.league !== "KBO") q.set("league", o.league);
  if (o.view !== "power") q.set("view", o.view);
  if (o.role !== "bat") q.set("role", o.role);
  if (o.page && o.page > 1) q.set("page", String(o.page));
  const s = q.toString();
  return `/baseball/rankings${s ? `?${s}` : ""}`;
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { league, view, role } = parse(await searchParams);
  const lg = LEAGUE_KO[league];
  const title = view === "power" ? `${lg} ${ROLE_KO[role]} 종합 랭킹 · 시즌 성적 합성 지수`
    : view === "bargain" ? `${lg} 가성비 ${ROLE_KO[role]} 랭킹 · 연봉 대비 성적`
      : `${lg} ${ROLE_KO[role]} 폼 랭킹 · 최근 경기 ${role === "bat" ? "OPS" : "ERA"}`;
  const description = view === "power"
    ? `${lg} ${ROLE_KO[role]}를 ${role === "bat" ? "OPS·홈런·타점·타율·안타" : "ERA·WHIP·탈삼진·이닝·승과 세이브"} 리그 백분위로 합성한 100점 종합 지수 랭킹 — 스코어베이스 야구.`
    : view === "bargain" ? `${lg} ${ROLE_KO[role]} 종합 지수에서 연봉 백분위를 뺀 가성비 랭킹. 몸값 대비 성과가 높은 선수 — 스코어베이스 야구.`
      : `${lg} ${ROLE_KO[role]}의 최근 ${role === "bat" ? `${FORM_BAT_GAMES}경기 OPS` : `${FORM_PIT_GAMES}등판 ERA`} 랭킹과 시즌 대비 변화 — 스코어베이스 야구.`;
  return { title, description, alternates: { canonical: url({ league, view, role }) }, openGraph: { title, description } };
}

interface Row {
  rank: number; prevRank: number | null | undefined; key: string; name: string; nameEn: string | null; team: string; href: string | null; photo: string | null;
  stat: string; score?: number; parts?: { label: string; pct: number }[]; power?: number; salary?: number | null; form?: BbForm; season?: number | null; delta?: number | null;
}

/** 이닝 실수(72.667) → 야구 표기(72.2). */
const fmtIp = (ip: number | null | undefined) => (ip == null ? "-" : `${Math.floor(ip)}.${Math.round((ip - Math.floor(ip)) * 3)}`);
function statLine(r: BbPlayerRow, role: BbRole): string {
  if (role === "bat") return `${r.games}경기 · ${r.avg?.toFixed(3) ?? "-"} · ${r.hr ?? 0}홈런 ${r.rbi ?? 0}타점 · OPS ${r.ops?.toFixed(3) ?? "-"}`;
  return `${r.games}경기 ${fmtIp(r.ip)}이닝 · ERA ${r.era?.toFixed(2) ?? "-"} · WHIP ${r.whip?.toFixed(2) ?? "-"} · ${r.so ?? 0}K · ${r.w ?? 0}승${r.sv ? ` ${r.sv}세` : ""}`;
}
const salaryLabel = (league: BbLeague, v: number | null | undefined) =>
  v == null ? "-" : league === "MLB" ? `$${(v / 1e6).toFixed(1)}M` : `${(v / 1e4).toLocaleString()}만원`;

export default async function BaseballRankingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { league, view, role, page } = parse(await searchParams);
  const data = await getBbLeagueData(league);
  const rowsByKey = new Map(data.rows.map((r) => [r.key, r]));
  const power = role === "bat" ? computeBatPower(data.rows) : computePitPower(data.rows);
  const ranked: Array<{ key: string; score?: number; parts?: { label: string; pct: number }[]; power?: number; salaryPct?: number; form?: BbForm; season?: number | null; delta?: number | null }> =
    view === "power" ? power
      : view === "bargain" ? computeBbBargain(power, data.rows)
        : computeBbForm(data.rows, data.form, role);
  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / PER));
  const safePage = Math.min(page, totalPages);

  // 순위 변동 — 리그·뷰·역할별 목록, 1페이지 렌더 시 오늘자 저장
  const list = `bb:${league}:${view}:${role}`;
  const today = kstToday();
  if (safePage === 1 && total > 0) {
    after(async () => {
      try {
        await writeRankSnapshot(list, ranked.map((r, i) => ({ playerId: r.key, rank: i + 1, league, posCode: role, score: r.score ?? r.form?.ops ?? r.form?.era ?? null })), today);
      } catch { /* 스냅샷 실패는 화면과 무관 */ }
    });
  }
  const baseline = await getRankBaseline(list, today.toISOString());
  const prevMap = baselineRankMap(baseline, {});

  const photoOf = (r: BbPlayerRow) =>
    league === "MLB" && r.externalId ? `https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/120`
      : league === "NPB" && r.logId ? npbPlayerPhoto(r.logId) ?? null
        : null;
  const hrefOf = (r: BbPlayerRow) =>
    league === "KBO" && r.externalId ? `/players/${r.externalId}?league=KBO`
      : league === "MLB" && r.externalId ? `/players/${r.externalId}`
        : league === "NPB" && role === "pit" && r.logId ? `/players/${r.logId}?league=NPB`
          : null;
  const rows: Row[] = ranked.slice((safePage - 1) * PER, safePage * PER).flatMap((x, i) => {
    const r = rowsByKey.get(x.key);
    if (!r) return [];
    return [{
      rank: (safePage - 1) * PER + i + 1, prevRank: prevRankOf(prevMap, x.key), key: x.key, name: r.name, nameEn: r.nameEn, team: r.team,
      href: hrefOf(r), photo: photoOf(r), stat: statLine(r, role),
      score: x.score, parts: x.parts, power: x.power, salary: r.salary, form: x.form, season: x.season, delta: x.delta,
    }];
  });

  const unavailable =
    view === "bargain" && league === "NPB" ? "NPB 는 연봉 데이터가 없어 가성비 랭킹을 만들 수 없습니다."
      : view === "form" && league === "MLB" ? "MLB 는 경기별 기록을 수집하지 않아 폼 랭킹이 없습니다."
        : view === "power" && role === "pit" && league === "MLB" ? "MLB 투수 시즌 성적이 아직 적재되지 않았습니다(수집 잡 보완 예정)."
          : null;
  const subtitle = view === "power"
    ? role === "bat" ? `OPS·홈런·타점·타율·안타 리그 백분위 합성 100점 · 최다 출장의 ${POWER_MIN_GAMES_RATIO * 100}% 이상 출장 · ${total}명`
      : `ERA·WHIP·탈삼진·이닝·승+세이브 백분위 합성 100점 · ${POWER_MIN_IP}이닝 이상 · ${total}명`
    : view === "bargain" ? `종합 지수 − 연봉 백분위 · 값이 클수록 연봉 대비 성과가 높음 · 연봉 매칭 ${data.salaryCoverage}명 중 자격 ${total}명`
      : role === "bat" ? `최근 ${FORM_BAT_GAMES}경기 OPS 높은 순 · ${FORM_BAT_MIN_AB}타수 이상 · 시즌 OPS 대비 변화 병기 · ${total}명`
        : `최근 ${FORM_PIT_GAMES}등판 ERA 낮은 순 · ${FORM_PIT_MIN_IP}이닝 이상 · 시즌 ERA 대비 변화 병기 · ${total}명`;
  const chip = (on: boolean) => `px-3.5 py-1.5 rounded-full text-sm font-bold border transition ${on ? "bg-cyan-600 text-white border-cyan-600" : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`;
  const sub = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-semibold border transition ${on ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`;

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-5">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd([{ name: "홈", path: "/" }, { name: "야구", path: "/baseball" }, { name: "선수 랭킹", path: "/baseball/rankings" }])) }} />
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400">Baseball · Player rankings</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">{LEAGUE_KO[league]} {ROLE_KO[role]} {VIEW_KO[view]} 랭킹</h1>
        <p className="text-sm text-neutral-500 break-keep">
          {data.season} 시즌 · {subtitle}.
          {baseline && <span className="ml-1 text-xs text-neutral-400">순위 변동은 {baseline.day} 스냅샷 대비.</span>}
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link href="/baseball" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">야구 허브</Link>
          <Link href="/transfers?view=power" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">축구 선수 랭킹</Link>
          <Link href={league === "NPB" ? "/salaries/mlb" : `/salaries/${league.toLowerCase()}`} className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">연봉 랭킹</Link>
        </div>
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] font-bold uppercase tracking-wider text-neutral-400">리그</span>
          {BB_LEAGUES.map((l) => <Link key={l} href={url({ league: l, view, role })} className={chip(l === league)}>{LEAGUE_KO[l]}</Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] font-bold uppercase tracking-wider text-neutral-400">랭킹</span>
          {VIEWS.map((v) => <Link key={v} href={url({ league, view: v, role })} className={chip(v === view)}>{VIEW_KO[v]}</Link>)}
          <span className="hidden sm:block w-px h-5 bg-neutral-200 dark:bg-neutral-800" aria-hidden />
          {(["bat", "pit"] as BbRole[]).map((r) => <Link key={r} href={url({ league, view, role: r })} className={sub(r === role)}>{ROLE_KO[r]}</Link>)}
        </div>
      </div>

      {unavailable ? (
        <p className="text-sm text-neutral-500 py-16 text-center">{unavailable}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500 py-16 text-center">조건에 맞는 선수가 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] divide-y divide-neutral-100 dark:divide-white/5">
          <div className="hidden sm:flex items-center gap-3 px-5 py-2.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
            <div className="w-12 text-center shrink-0">순위</div>
            <div className="flex-1 min-w-0">선수</div>
            <div className="w-72 shrink-0">이번 시즌</div>
            <div className="w-44 shrink-0 text-right">{view === "power" ? "종합 지수" : view === "bargain" ? "가성비 · 연봉" : role === "bat" ? `최근 ${FORM_BAT_GAMES}경기 OPS` : `최근 ${FORM_PIT_GAMES}등판 ERA`}</div>
          </div>
          {rows.map((p) => (
            <div key={p.key} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">
              <div className={`w-8 sm:w-12 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>
                {p.rank}
                <RankDelta rank={p.rank} prev={p.prevRank} />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="w-full h-full object-cover object-top" loading="lazy" />
                  ) : (
                    <span className="text-sm font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate">{p.href ? <Link href={p.href} className="hover:underline underline-offset-4">{p.name}</Link> : p.name}</div>
                  <div className="text-[11px] text-neutral-500 truncate">{p.team}{p.nameEn && league !== "KBO" ? ` · ${p.nameEn.replace(/^\*/, "")}` : ""}</div>
                  <div className="sm:hidden text-[11px] text-neutral-500 truncate tabular-nums">{p.stat}</div>
                </div>
              </div>
              <div className="hidden sm:block w-72 shrink-0 text-xs text-neutral-500 tabular-nums truncate">{p.stat}</div>
              <div className="w-28 sm:w-44 shrink-0 text-right leading-tight">
                {view === "power" ? (
                  <>
                    <div className="font-bold tabular-nums text-cyan-600 dark:text-cyan-400 text-base">{p.score?.toFixed(1)}</div>
                    <div className="hidden sm:flex flex-wrap justify-end gap-x-1.5 text-[10px] text-neutral-500 tabular-nums" title="항목별 리그 백분위">
                      {p.parts?.map((x) => <span key={x.label}>{x.label} <b className="text-neutral-700 dark:text-neutral-300">{Math.round(x.pct)}</b></span>)}
                    </div>
                  </>
                ) : view === "bargain" ? (
                  <>
                    <div className={`font-bold tabular-nums text-base ${(p.score ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{(p.score ?? 0) >= 0 ? "+" : "−"}{Math.abs(p.score ?? 0).toFixed(1)}</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">종합 {p.power?.toFixed(1)} · {salaryLabel(league, p.salary)}</div>
                  </>
                ) : (
                  <>
                    <div className="font-bold tabular-nums text-cyan-600 dark:text-cyan-400 text-base">{role === "bat" ? p.form?.ops?.toFixed(3) : p.form?.era?.toFixed(2)}</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">
                      {role === "bat" ? `${p.form?.n}경기 ${p.form?.ab}타수` : `${p.form?.n}등판 ${fmtIp(p.form?.ip)}이닝`} · 시즌 {role === "bat" ? p.season?.toFixed(3) : p.season?.toFixed(2)}
                      {p.delta != null && (
                        <span className={`ml-1 font-semibold ${(role === "bat" ? p.delta >= 0 : p.delta <= 0) ? "text-emerald-500" : "text-rose-500"}`}>
                          {p.delta >= 0 ? "+" : "−"}{Math.abs(p.delta).toFixed(role === "bat" ? 3 : 2)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={url({ league, view, role, page: n })} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold ring-1 ${n === safePage ? "bg-cyan-600 text-white ring-cyan-600" : "ring-black/10 dark:ring-white/15 text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-white/10"}`}>{n}</Link>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        시즌 성적은 리그 공식 기록(KBO·MLB Stats API·NPB)을 매일 적재한 값, 연봉은 공시 자료 기준입니다. 종합 지수는 리그 안 백분위라 리그 간 비교는 하지 않습니다.
      </p>
    </main>
  );
}
