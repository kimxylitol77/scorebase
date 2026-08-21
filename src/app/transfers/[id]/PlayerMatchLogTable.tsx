"use client";
// 출전기록 표 — 경기별 평점·출전·골·카드·결과 + 세부 스탯 칩 (PlayerMatchLog). 최근 15경기 + 더보기.
// 데이터는 collect-player-match-logs 잡이 API-Football /fixtures/players 에서 적재.
// 국가대표 경기(월드컵·A매치, 우리 DB 캐시)도 page 가 같은 행 형식으로 변환해 날짜순 병합.
// 커버 매치(Match.apiFixtureId 매칭)는 행 전체가 매치 상세로 링크된다.
// 시즌·대회 필터는 클라이언트 상태로만 거른다 — 행 전체가 SSR 로 HTML 에 남아 색인에 영향이 없다
//  (PlayerTabs 가 전 탭 SSR + CSS hidden 으로 SEO 를 지키는 것과 같은 이유).
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, Target, Compass, Shield, Footprints } from "lucide-react";
import { toKoreanTeamName } from "@/lib/team-names";

/** 시즌별 집계 행 — page 가 전체 로그(최대 500경기)에서 클럽 경기 기준으로 계산. */
export interface SeasonAggRow {
  label: string; // "2025-26" | "2026"
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingSum: number;
  ratingN: number;
  yellow: number;
  red: number;
}

export interface MatchLogRow {
  id: string;
  href: string | null; // 우리 매치 상세(/live/...) — 미커버 경기는 null
  date: Date;
  leagueName: string;
  compKo?: string | null; // 국가대표 경기 라벨 (월드컵·A매치) — 국기 대신 텍스트 표시
  compLabel: string; // 대회 필터용 한국어 라벨 (COMP_KO 변환 또는 compKo)
  seasonLabel: string; // 시즌 필터용 라벨 ("2026-27" | "2026")
  leagueFlag: string | null;
  homeName: string;
  homeLogo: string | null;
  awayName: string;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  playerSide: string; // "H" | "A"
  rating: number | null;
  minutes: number | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  started: boolean;
  // 경기별 세부 스탯 — null 이면 그 경기는 세부 스탯 미수집(칩을 아예 안 그린다).
  shots?: number | null;
  shotsOn?: number | null;
  keyPasses?: number | null;
  tackles?: number | null;
  interceptions?: number | null;
  dribbles?: number | null;
  dribblesAtt?: number | null;
}

const RES_META: Record<string, { ko: string; cls: string }> = {
  W: { ko: "승", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  D: { ko: "무", cls: "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300" },
  L: { ko: "패", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};
function ratingCls(r: number): string {
  if (r >= 7.0) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (r >= 6.5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
}
// 세부 스탯 칩 — 시즌 개요 카드와 같은 아이콘·색 어휘(슈팅=Target/cyan, 패스=Compass/blue,
//  수비=Shield/emerald)를 그대로 써서 페이지 안에서 뜻이 한 번만 학습되게 한다.
//  값이 0 인 항목은 그리지 않는다 — 빈 칩이 줄을 채우면 밀도만 올라가고 정보는 안 늘어난다.
function statChips(r: MatchLogRow) {
  const out: Array<{ key: string; icon: React.ReactNode; cls: string; text: string }> = [];
  const shots = r.shots ?? 0;
  if (shots > 0) {
    out.push({
      key: "sh",
      icon: <Target className="w-3 h-3" aria-hidden />,
      cls: "text-cyan-600 dark:text-cyan-400",
      text: (r.shotsOn ?? 0) > 0 ? `슛 ${shots} (유효 ${r.shotsOn})` : `슛 ${shots}`,
    });
  }
  if ((r.keyPasses ?? 0) > 0) {
    out.push({ key: "kp", icon: <Compass className="w-3 h-3" aria-hidden />, cls: "text-blue-600 dark:text-blue-400", text: `키패스 ${r.keyPasses}` });
  }
  const def = [
    (r.tackles ?? 0) > 0 ? `태클 ${r.tackles}` : null,
    (r.interceptions ?? 0) > 0 ? `인터셉트 ${r.interceptions}` : null,
  ].filter(Boolean);
  if (def.length) {
    out.push({ key: "df", icon: <Shield className="w-3 h-3" aria-hidden />, cls: "text-emerald-600 dark:text-emerald-400", text: def.join(" · ") });
  }
  if ((r.dribbles ?? 0) > 0) {
    out.push({
      key: "dr",
      icon: <Footprints className="w-3 h-3" aria-hidden />,
      cls: "text-amber-600 dark:text-amber-400",
      text: (r.dribblesAtt ?? 0) > 0 ? `드리블 ${r.dribbles}/${r.dribblesAtt}` : `드리블 ${r.dribbles}`,
    });
  }
  return out;
}

function resultOf(r: MatchLogRow): "W" | "D" | "L" | null {
  if (r.playerSide !== "H" && r.playerSide !== "A") return null; // 홈/원정 미상 — 승무패 판정 불가
  if (r.homeScore == null || r.awayScore == null) return null;
  const my = r.playerSide === "H" ? r.homeScore : r.awayScore;
  const opp = r.playerSide === "H" ? r.awayScore : r.homeScore;
  return my > opp ? "W" : my < opp ? "L" : "D";
}
function fmtDate(d: Date): string {
  return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

function teamLine(name: string, logo: string | null, score: number | null, bold: boolean) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-4 h-4 object-contain shrink-0" />
      )}
      <span className={`truncate ${bold ? "font-bold" : "text-neutral-500"}`}>{toKoreanTeamName(name) || name}</span>
      <span className={`ml-auto tabular-nums shrink-0 ${bold ? "font-bold" : "text-neutral-500"}`}>{score ?? "-"}</span>
    </div>
  );
}

function Row({ r }: { r: MatchLogRow }) {
  const played = (r.minutes ?? 0) > 0 || r.rating != null;
  const res = resultOf(r);
  const inner = (
    <>
      <div className="flex flex-col items-center gap-0.5 w-12 shrink-0">
        <span className="text-[11px] text-neutral-400 tabular-nums">{fmtDate(r.date)}</span>
        {r.leagueFlag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.leagueFlag} alt="" className="w-4 h-3 object-cover rounded-sm" />
        ) : r.compKo ? (
          <span className={`text-[9px] font-bold ${r.compKo === "월드컵" ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}`}>{r.compKo}</span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 max-w-[220px]">
        {teamLine(r.homeName, r.homeLogo, r.homeScore, r.playerSide === "H")}
        {teamLine(r.awayName, r.awayLogo, r.awayScore, r.playerSide === "A")}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {played ? (
          <>
            {r.rating != null && <span className={`px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${ratingCls(r.rating)}`}>{r.rating.toFixed(1)}</span>}
            <span className="text-[11px] text-neutral-400 tabular-nums w-8 text-right">{r.minutes ?? 0}&apos;</span>
            <span className="text-xs tabular-nums w-10 text-right">
              {r.goals > 0 && <span className="font-bold">⚽{r.goals}</span>}
              {r.assists > 0 && <span className="text-neutral-500"> {r.goals > 0 ? "" : ""}🅰{r.assists}</span>}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-neutral-400">벤치</span>
        )}
        {res && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${RES_META[res].cls}`}>{RES_META[res].ko}</span>}
        <ExternalLink className={`w-3.5 h-3.5 shrink-0 ${r.href ? "text-neutral-400" : "text-transparent"}`} aria-hidden />
      </div>
    </>
  );
  // 칩은 행 아래 한 줄로 — 가운데 팀 블록에 끼우면 모바일 폭에서 팀명이 먼저 뭉개진다.
  //  날짜 칼럼(w-12) + gap-3 만큼 들여써서 팀명 왼쪽 선에 맞춘다.
  const chips = played ? statChips(r) : [];
  const body = (
    <>
      <div className="flex items-center gap-3">{inner}</div>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[3.75rem] text-[10px]">
          {chips.map((c) => (
            <span key={c.key} className={`inline-flex items-center gap-1 tabular-nums ${c.cls}`}>
              {c.icon}
              {c.text}
            </span>
          ))}
        </div>
      )}
    </>
  );
  const cls = "block px-3 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0";
  return r.href ? (
    <Link href={r.href} className={`${cls} transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const ALL = "전체";

// 필터 pill 한 줄 — 우리 표준(rose 액센트 + 스프링 이징). 옵션이 많으면 가로 스크롤로 흘린다.
function FilterRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</span>
      <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              aria-pressed={on}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                on
                  ? "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400"
                  : "text-neutral-500 hover:-translate-y-0.5 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlayerMatchLogTable({ rows, seasonAgg }: { rows: MatchLogRow[]; seasonAgg?: SeasonAggRow[] }) {
  const [season, setSeason] = useState(ALL);
  const [comp, setComp] = useState(ALL);

  // 선택지는 이 선수가 실제로 뛴 시즌·대회만 — 빈 결과로 이어지는 pill 을 만들지 않는다.
  const seasons = useMemo(() => [ALL, ...[...new Set(rows.map((r) => r.seasonLabel))].sort((a, b) => b.localeCompare(a))], [rows]);
  const comps = useMemo(() => {
    const counted = new Map<string, number>();
    for (const r of rows) counted.set(r.compLabel, (counted.get(r.compLabel) ?? 0) + 1);
    return [ALL, ...[...counted.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)];
  }, [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => (season === ALL || r.seasonLabel === season) && (comp === ALL || r.compLabel === comp)),
    [rows, season, comp],
  );

  if (!rows.length) return null;
  const head = filtered.slice(0, 15);
  const rest = filtered.slice(15);
  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      {/* 시즌별 기록 — 축적된 경기 로그의 시즌 집계 (위키형 커리어 표) */}
      {seasonAgg && seasonAgg.length > 0 && (
        <div className="border-b border-black/5 dark:border-white/5">
          <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">시즌별 기록</h2>
            <span className="text-[11px] text-neutral-500">클럽 경기 기준</span>
          </div>
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-neutral-400">
                  <th className="px-2 py-1.5 text-left font-medium">시즌</th>
                  <th className="px-2 py-1.5 text-right font-medium">경기</th>
                  <th className="px-2 py-1.5 text-right font-medium hidden sm:table-cell">선발</th>
                  <th className="px-2 py-1.5 text-right font-medium">골</th>
                  <th className="px-2 py-1.5 text-right font-medium">도움</th>
                  <th className="px-2 py-1.5 text-right font-medium">평점</th>
                  <th className="px-2 py-1.5 text-right font-medium hidden sm:table-cell">경고·퇴장</th>
                </tr>
              </thead>
              <tbody>
                {seasonAgg.map((a) => {
                  const avg = a.ratingN > 0 ? a.ratingSum / a.ratingN : null;
                  return (
                    <tr key={a.label} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1.5 font-semibold tabular-nums">{a.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.apps}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500 hidden sm:table-cell">{a.starts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold">{a.goals}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.assists}</td>
                      <td className="px-2 py-1.5 text-right">
                        {avg != null ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${ratingCls(avg)}`}>{avg.toFixed(2)}</span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500 hidden sm:table-cell">
                        {a.yellow}·{a.red}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">출전기록</h2>
        <span className="text-[11px] text-neutral-500">
          {filtered.length === rows.length ? `최근 ${rows.length}경기` : `${filtered.length}경기 · 전체 ${rows.length}`}
        </span>
      </div>
      {(seasons.length > 1 || comps.length > 1) && (
        <div className="space-y-1.5 px-4 pb-3">
          {seasons.length > 1 && <FilterRow label="시즌" options={seasons} value={season} onChange={setSeason} />}
          {comps.length > 1 && <FilterRow label="대회" options={comps} value={comp} onChange={setComp} />}
        </div>
      )}
      <div>
        {head.map((r) => <Row key={r.id} r={r} />)}
        {rest.length > 0 && (
          <details className="group">
            <summary className="px-4 py-2.5 text-xs text-rose-600 dark:text-rose-400 cursor-pointer select-none list-none marker:hidden hover:underline text-center">
              이전 {rest.length}경기 더보기
            </summary>
            {rest.map((r) => <Row key={r.id} r={r} />)}
          </details>
        )}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-neutral-500">해당 조건의 경기가 없습니다.</p>
        )}
      </div>
    </section>
  );
}
