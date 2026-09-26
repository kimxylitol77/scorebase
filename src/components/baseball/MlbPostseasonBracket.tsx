"use client";
// MLB 포스트시즌 대진표 — 월드컵 녹아웃 브래킷(WcBracket) 문법: 데스크탑 좌우 미러 트리(왼쪽 AL·오른쪽 NL, 가운데 월드시리즈)
// + 모바일 라운드 탭. 시리즈 카드(시드·로고·승수 또는 AI 시리즈 승리 확률), 팀 hover·한국 선수 팀 경로 하이라이트.
import { useState } from "react";
import Link from "next/link";
import { Sparkles, Trophy } from "lucide-react";
import TeamLogoImg from "@/components/TeamLogoImg";
import { ROUND_LABEL, type MlbRound, type PsSeries, type PsTeam } from "@/lib/sports/mlb-postseason-build";

const ROUNDS: MlbRound[] = ["wc", "ds", "lcs", "ws"];
/** 모바일 탭 — 네 개가 한 줄에 들어가게 짧게 */
const TAB_LABEL: Record<MlbRound, string> = { wc: "와일드카드", ds: "디비전", lcs: "챔피언십", ws: "월드시리즈" };
/** 다크 모드에서 남색·갈색 로고(양키스·파드리스)가 배경에 묻혀 밝은 원 위에 올린다 */
const LOGO_CHIP = "dark:rounded-full dark:bg-white/90 dark:p-[2px]";
const CARD_W = "w-[168px]";

interface Ctx {
  active: Set<number>;
  setHot: (id: number | null) => void;
  logoById: Record<number, string>;
  teamPageById: Record<number, number>;
  gameHrefByPk: Record<number, string>;
}

/** 시간 미정 경기는 statsapi 가 자리표시 시각을 넣어 두므로 현지 날짜(officialDate)로만 적는다 */
function localDay(officialDate: string | null, iso: string): string {
  const d = officialDate ?? iso.slice(0, 10);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${d}T12:00:00Z`).getUTCDay()];
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${wd}) 현지`;
}
function kstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));
}

export default function MlbPostseasonBracket({
  series,
  logoById,
  teamPageById,
  gameHrefByPk,
}: {
  series: PsSeries[];
  logoById: Record<number, string>;
  teamPageById: Record<number, number>;
  gameHrefByPk: Record<number, string>;
}) {
  const [hot, setHot] = useState<number | null>(null);
  const [koreaOn, setKoreaOn] = useState(false);
  const [tab, setTab] = useState<MlbRound>(() => series.find((s) => s.state !== "FINAL")?.round ?? "wc");

  const koreaIds = new Set<number>();
  for (const s of series) for (const t of [s.top, s.bottom]) if (t.id != null && t.korea.length > 0) koreaIds.add(t.id);
  const active = koreaOn ? koreaIds : new Set(hot != null ? [hot] : []);
  const ctx: Ctx = { active, setHot, logoById, teamPageById, gameHrefByPk };

  // 열 순서 — WC 는 받는 DS 와 같은 줄(4v5 → 1번 시드 DS, 3v6 → 2번 시드 DS)
  const byLeague = (lg: "AL" | "NL", round: MlbRound) => series.filter((s) => s.league === lg && s.round === round);
  const dsOrder = (lg: "AL" | "NL") =>
    byLeague(lg, "ds").sort((a, b) => (a.top.seed ?? 9) - (b.top.seed ?? 9) || a.id.localeCompare(b.id));
  const wcOrder = (lg: "AL" | "NL") =>
    byLeague(lg, "wc").sort((a, b) => wcRank(a) - wcRank(b) || a.id.localeCompare(b.id));
  const ws = series.find((s) => s.round === "ws") ?? null;

  const champion = ws?.winnerId != null ? (ws.top.id === ws.winnerId ? ws.top : ws.bottom) : null;

  return (
    <div className="space-y-4">
      {champion && ws && (
        <div className="relative overflow-hidden rounded-[1.5rem] shadow-sm sm:rounded-[2rem]">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-rose-500 to-fuchsia-600" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_60%)]" />
          <div className="relative flex items-center gap-4 px-5 py-5 text-white">
            <Trophy className="h-9 w-9 shrink-0 drop-shadow" aria-hidden />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-85">World Series Champion</div>
              <div className="text-xl font-bold tracking-tight sm:text-2xl">{champion.name} 우승</div>
              <div className="mt-0.5 text-xs opacity-90 sm:text-sm tabular-nums">
                월드시리즈 {ws.top.name} {ws.winsTop} - {ws.winsBottom} {ws.bottom.name}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 범례 + 한국 선수 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          <Legend dot="bg-emerald-500" label="진출" />
          <Legend dot="bg-rose-500" label="LIVE" />
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500/15 text-[9px] font-bold text-amber-700 dark:text-amber-300">4</span>
            노란 시드 = 현재 순위 기준 예상
          </span>
          <span>시간 미정 경기는 현지 날짜</span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-500" aria-hidden /> AI 시리즈 승리 확률
          </span>
        </div>
        {koreaIds.size > 0 && (
          <button
            type="button"
            onClick={() => setKoreaOn((v) => !v)}
            aria-pressed={koreaOn}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              koreaOn
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20 hover:bg-rose-500/15 dark:text-rose-300"
            }`}
          >
            <span aria-hidden>🇰🇷</span> 한국 선수 팀 경로 {koreaOn ? "끄기" : "보기"}
          </button>
        )}
      </div>

      {/* ── 데스크탑: 좌우 미러 트리 ── */}
      <div className="hidden overflow-x-auto xl:block">
        <div className="flex min-w-max items-stretch justify-center gap-2 py-2">
          <HalfTree
            leagueLabel="아메리칸리그"
            mirror={false}
            columns={[
              { round: "wc", list: wcOrder("AL") },
              { round: "ds", list: dsOrder("AL") },
              { round: "lcs", list: byLeague("AL", "lcs") },
            ]}
            ctx={ctx}
          />
          <div className="flex flex-col">
            <div className="pb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">월드시리즈</div>
            <div className="flex min-h-[520px] w-[200px] flex-1 flex-col items-center justify-center gap-4">
              <Trophy className="h-7 w-7 text-amber-400" aria-hidden />
              {ws && (
                <div className="w-full">
                  <SeriesCard s={ws} ctx={ctx} isFinal />
                </div>
              )}
            </div>
          </div>
          <HalfTree
            leagueLabel="내셔널리그"
            mirror
            columns={[
              { round: "lcs", list: byLeague("NL", "lcs") },
              { round: "ds", list: dsOrder("NL") },
              { round: "wc", list: wcOrder("NL") },
            ]}
            ctx={ctx}
          />
        </div>
      </div>

      {/* ── 모바일·태블릿: 라운드 탭 ── */}
      <div className="space-y-3 xl:hidden">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-neutral-100 p-1 dark:bg-white/[0.06]" role="tablist">
          {ROUNDS.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={tab === r}
              onClick={() => setTab(r)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                tab === r ? "bg-white text-neutral-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {TAB_LABEL[r]}
            </button>
          ))}
        </div>
        {(tab === "ws" ? [null] : (["AL", "NL"] as const)).map((lg) => {
          const list = lg == null ? (ws ? [ws] : []) : tab === "wc" ? wcOrder(lg) : tab === "ds" ? dsOrder(lg) : byLeague(lg, tab);
          if (list.length === 0) return null;
          return (
            <div key={lg ?? "ws"} className="space-y-2">
              {lg && <div className="text-[11px] font-bold tracking-[0.12em] text-neutral-400">{lg === "AL" ? "아메리칸리그" : "내셔널리그"}</div>}
              {list.map((s) => (
                <SeriesCard key={s.id} s={s} ctx={ctx} wide isFinal={s.round === "ws"} />
              ))}
            </div>
          );
        })}
        {tab === "wc" && (
          <p className="text-[11px] text-neutral-500 break-keep dark:text-neutral-400">
            리그별 1·2번 시드는 와일드카드 시리즈 없이 디비전 시리즈로 바로 올라갑니다.
          </p>
        )}
      </div>
    </div>
  );
}

/** WC 정렬 키 — 4v5(1번 시드 DS 로 가는 쪽) 먼저 */
function wcRank(s: PsSeries): number {
  const seeds = [s.top.seed, s.bottom.seed].filter((x): x is number => x != null);
  if (seeds.includes(4) || seeds.includes(5)) return 0;
  if (seeds.includes(3) || seeds.includes(6)) return 1;
  return 2;
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

interface ColDef {
  round: MlbRound;
  list: PsSeries[];
}

function HalfTree({ columns, mirror, ctx, leagueLabel }: { columns: ColDef[]; mirror: boolean; ctx: Ctx; leagueLabel: string }) {
  return (
    <div className="flex flex-col">
      <div className={`mb-1 text-[11px] font-bold tracking-[0.12em] text-neutral-500 dark:text-neutral-400 ${mirror ? "text-right" : ""}`}>
        {leagueLabel}
      </div>
      <div className="flex">
        {columns.map((c, i) => (
          <div key={c.round} className="contents">
            <div className={`${CARD_W} pb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400`}>
              {ROUND_LABEL[c.round]}
            </div>
            {i < columns.length - 1 && <div className="w-[18px] shrink-0" />}
          </div>
        ))}
      </div>
      <div className="flex min-h-[520px] flex-1">
        {columns.map((c, i) => {
          const next = columns[i + 1];
          // WC→DS 는 1:1(가로선), DS→LCS 는 2:1(엘보). 미러 쪽은 열 순서가 뒤집혀 있으니 개수로 판단.
          const merge = next ? Math.max(c.list.length, next.list.length) > Math.min(c.list.length, next.list.length) : false;
          return (
            <div key={c.round} className="contents">
              <div className={`${CARD_W} flex flex-col`}>
                {c.list.map((s) => (
                  <div key={s.id} className="flex flex-1 flex-col justify-center py-2">
                    <SeriesCard s={s} ctx={ctx} />
                  </div>
                ))}
              </div>
              {next && (
                <Connector
                  count={Math.min(c.list.length, next.list.length) || 1}
                  merge={merge}
                  stubsLeft={c.list.length > next.list.length}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 커넥터 — 1:1 은 가로선, 2:1 은 "}" 엘보. 카드 두 장이 있는 쪽(stubsLeft)에서 두 가닥이 나와 가운데서 합쳐진다. */
function Connector({ count, merge, stubsLeft }: { count: number; merge: boolean; stubsLeft: boolean }) {
  const line = "border-neutral-300 dark:border-white/15";
  if (!merge) {
    return (
      <div className="flex w-[18px] shrink-0 flex-col" aria-hidden>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="relative flex-1">
            <span className={`absolute top-1/2 w-full border-t ${line}`} />
          </div>
        ))}
      </div>
    );
  }
  // 2 → 1: 두 카드 중심(25%·75%)에서 가운데까지 가로 두 가닥 + 가운데 세로선 + 받는 카드(50%)로 가로선
  const from = stubsLeft ? "left-0" : "right-0";
  const to = stubsLeft ? "right-0" : "left-0";
  return (
    <div className="flex w-[18px] shrink-0 flex-col" aria-hidden>
      <div className="relative flex-1">
        <span className={`absolute left-1/2 top-1/4 h-1/2 border-l ${line}`} />
        <span className={`absolute top-1/4 w-1/2 border-t ${from} ${line}`} />
        <span className={`absolute top-3/4 w-1/2 border-t ${from} ${line}`} />
        <span className={`absolute top-1/2 w-1/2 border-t ${to} ${line}`} />
      </div>
    </div>
  );
}

function SeriesCard({ s, ctx, isFinal, wide }: { s: PsSeries; ctx: Ctx; isFinal?: boolean; wide?: boolean }) {
  const live = s.state === "LIVE";
  const onActive = [s.top.id, s.bottom.id].some((id) => id != null && ctx.active.has(id));
  const dim = ctx.active.size > 0 && !onActive;
  const nextGame = s.games.find((g) => g.state !== "FINAL" && !g.ifNecessary) ?? s.games.find((g) => g.state !== "FINAL") ?? null;
  const liveGame = s.games.find((g) => g.state === "LIVE") ?? null;
  const linkGame = liveGame ?? nextGame ?? [...s.games].reverse().find((g) => g.state === "FINAL") ?? null;
  const href = linkGame ? ctx.gameHrefByPk[linkGame.pk] : undefined;
  const need = Math.ceil(s.bestOf / 2);

  const status = live ? (
    <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden /> LIVE
    </span>
  ) : s.state === "FINAL" ? (
    "시리즈 종료"
  ) : nextGame ? (
    nextGame.tbd ? localDay(nextGame.officialDate, nextGame.date) : `${kstTime(nextGame.date)} 한국`
  ) : (
    ""
  );

  return (
    <div
      className={`overflow-hidden rounded-xl bg-white ring-1 transition-all duration-300 dark:bg-white/[0.04] ${
        isFinal
          ? "shadow-[0_10px_30px_-12px_rgba(217,119,6,0.45)] ring-amber-300 dark:ring-amber-500/40"
          : live
            ? "ring-rose-300 dark:ring-rose-500/40"
            : onActive
              ? "ring-2 ring-rose-400 dark:ring-rose-400/60"
              : "ring-black/[0.07] dark:ring-white/10"
      } ${dim ? "opacity-40" : ""}`}
    >
      <TeamRow t={s.top} wins={s.winsTop} prob={s.probTop} s={s} ctx={ctx} wide={wide} />
      <div className="border-t border-neutral-100 dark:border-white/[0.06]" />
      <TeamRow t={s.bottom} wins={s.winsBottom} prob={s.probTop == null ? null : 1 - s.probTop} s={s} ctx={ctx} wide={wide} />
      {(() => {
        const inner = (
          <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/70 px-2.5 py-1 text-[10px] text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-neutral-400">
            <span className="tabular-nums">{status}</span>
            <span className="tabular-nums text-neutral-400 dark:text-neutral-500">
              {s.bestOf}전 {need}선승
            </span>
          </div>
        );
        return href ? (
          <Link href={href} prefetch={false} className="block transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
            {inner}
          </Link>
        ) : (
          inner
        );
      })()}
    </div>
  );
}

function TeamRow({ t, wins, prob, s, ctx, wide }: { t: PsTeam; wins: number; prob: number | null; s: PsSeries; ctx: Ctx; wide?: boolean }) {
  const won = s.winnerId != null && t.id === s.winnerId;
  const out = s.winnerId != null && t.id !== s.winnerId && !t.placeholder;
  const started = s.state !== "SCHEDULED";
  const logo = t.id != null ? ctx.logoById[t.id] : undefined;
  const page = t.id != null && !t.projected ? ctx.teamPageById[t.id] : undefined;

  const nameEl = (
    <span
      className={`truncate ${wide ? "text-[14px]" : "text-[13px]"} ${
        t.placeholder
          ? "italic text-neutral-400 dark:text-neutral-500"
          : won
            ? "font-bold text-emerald-700 dark:text-emerald-300"
            : out
              ? "text-neutral-400 line-through decoration-neutral-300 dark:decoration-neutral-600"
              : "font-semibold text-neutral-900 dark:text-white"
      }`}
      title={t.slotNote ?? t.name}
    >
      {t.name}
    </span>
  );

  return (
    <div
      onMouseEnter={t.id != null ? () => ctx.setHot(t.id) : undefined}
      onMouseLeave={t.id != null ? () => ctx.setHot(null) : undefined}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 ${won ? "bg-emerald-50 dark:bg-emerald-500/10" : ""}`}
    >
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums ${
          t.projected ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "text-neutral-400"
        }`}
        title={t.projected ? `확정 전 예상 — ${t.slotNote ?? ""}` : undefined}
      >
        {t.seed ?? ""}
      </span>
      {logo ? (
        <TeamLogoImg url={logo} name={t.name} size={18} className={`h-[18px] w-[18px] shrink-0 object-contain ${LOGO_CHIP}`} fallbackClassName="h-[18px] w-[18px] shrink-0 rounded-full bg-neutral-200 text-[8px] dark:bg-white/10" />
      ) : (
        <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-neutral-300 dark:border-white/15" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1">
        {page ? (
          <Link href={`/teams/${page}`} prefetch={false} className="min-w-0 truncate hover:underline">
            {nameEl}
          </Link>
        ) : (
          nameEl
        )}
        </span>
        {t.korea.length > 0 && (
          <span className="truncate text-[10px] font-semibold leading-tight text-rose-600 dark:text-rose-400">
            <span aria-hidden>🇰🇷</span> {t.korea.join("·")}
          </span>
        )}
      </span>
      <span className="w-8 shrink-0 text-right">
        {started ? (
          <span className={`text-[14px] font-bold tabular-nums ${won ? "text-emerald-700 dark:text-emerald-300" : "text-neutral-700 dark:text-neutral-200"}`}>{wins}</span>
        ) : prob != null ? (
          <span className="text-[10px] font-semibold tabular-nums text-violet-600 dark:text-violet-400">{Math.round(prob * 100)}%</span>
        ) : null}
      </span>
    </div>
  );
}
