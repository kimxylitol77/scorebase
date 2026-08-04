// /picks/strong 화면 조각 — 확신도 막대·승률 분할 바·날짜 네비·픽 카드.
// 전부 서버 컴포넌트. 수치는 _data 가 DB 에서 실측해 넘긴 것만 쓴다(추정 금지).
import Link from "next/link";
import { Check, X } from "lucide-react";
import TeamBadge from "@/components/TeamBadge";
import { MARKET_LABEL, STRONG_THRESHOLD, type StrongMarket } from "@/lib/predict/strong-picks";
import type { DailyStat, MarketAccuracy, StrongPickMatch, TeamForm } from "./_data";

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/** 승·패는 0이어도 적는다 — "3승 2패 · 5패" 처럼 비대칭이면 한눈에 비교가 안 된다 */
const formText = (f: TeamForm) =>
  [`${f.win}승`, f.draw ? `${f.draw}무` : "", `${f.loss}패`].filter(Boolean).join(" ");

/** 확신도 막대 — 채운 길이가 확신도, 세로선이 그 마켓의 임계 */
export function ConfidenceBar({ prob, threshold }: { prob: number; threshold: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${Math.min(100, prob * 100)}%` }}
      />
      {/* 임계선 — "기준을 이만큼 넘었다"가 이 화면의 핵심이라 항상 같이 그린다 */}
      <div
        className="absolute inset-y-0 w-px bg-black/40 dark:bg-white/50"
        style={{ left: `${threshold * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

/** 1X2 확률 분할 바. 무승부가 0 인 종목(야구·농구)은 자동으로 2분할이 된다 */
export function WinProbSplit({
  prob,
  home,
  away,
}: {
  prob: { home: number; draw: number; away: number };
  home: string;
  away: string;
}) {
  const total = prob.home + prob.draw + prob.away || 1;
  const seg = [
    { w: prob.home / total, cls: "bg-emerald-500", label: `${home} ${pct(prob.home)}` },
    { w: prob.draw / total, cls: "bg-zinc-400 dark:bg-zinc-500", label: `무승부 ${pct(prob.draw)}` },
    { w: prob.away / total, cls: "bg-sky-500", label: `${away} ${pct(prob.away)}` },
  ].filter((s) => s.w > 0.001);

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        {seg.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${s.w * 100}%` }} title={s.label} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[10px] tabular-nums text-neutral-500">
        <span>{pct(prob.home)}</span>
        {prob.draw > 0.001 ? <span>무 {pct(prob.draw)}</span> : null}
        <span>{pct(prob.away)}</span>
      </div>
    </div>
  );
}

/** 채점 결과 배지 — 미채점이면 아무것도 안 그린다 */
export function ResultMark({ correct }: { correct: boolean | null }) {
  if (correct == null) return null;
  return correct ? (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" aria-hidden /> 적중
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
      <X className="h-3 w-3" aria-hidden /> 실패
    </span>
  );
}

/**
 * 날짜별 성적 막대 = 그대로 날짜 네비. 막대 높이는 픽 수, 채운 부분이 적중.
 * 오래된 날짜가 왼쪽에 오도록 뒤집어 그린다.
 */
export function DailyNavChart({ days, active }: { days: DailyStat[]; active: string | null }) {
  if (!days.length) return null;
  const max = Math.max(...days.map((d) => d.picks));
  const asc = [...days].reverse();

  return (
    <div className="rounded-2xl border border-black/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          날짜별 성적
          <span className="ml-2 text-[11px] font-normal tabular-nums text-neutral-500">
            {asc[0].date.slice(5).replace("-", "/")}~{asc[asc.length - 1].date.slice(5).replace("-", "/")}
          </span>
        </h2>
        <p className="hidden text-[11px] text-neutral-500 sm:block">
          막대를 누르면 그날 픽과 결과가 보입니다
        </p>
      </div>
      <div className="mt-3 flex items-end gap-1">
        {asc.map((d) => {
          const on = d.date === active;
          const rate = d.picks ? d.hits / d.picks : 0;
          return (
            <Link
              key={d.date}
              href={`/picks/strong?d=${d.date}`}
              scroll={false}
              aria-label={`${d.date} — ${d.picks}픽 중 ${d.hits}적중`}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="text-[9px] tabular-nums text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100">
                {d.hits}/{d.picks}
              </span>
              <span
                className={`flex w-full flex-col justify-end overflow-hidden rounded-md bg-black/[0.06] transition-all dark:bg-white/10 ${
                  on ? "ring-2 ring-emerald-500" : "group-hover:bg-black/10 dark:group-hover:bg-white/15"
                }`}
                style={{ height: `${Math.max(14, (d.picks / max) * 56)}px` }}
              >
                <span
                  className="w-full bg-emerald-500"
                  style={{ height: `${rate * 100}%` }}
                />
              </span>
              {/* 14칸이 좁아 일자만 — 월은 위 제목의 기간 표기가 알려준다 */}
              <span
                className={`text-[10px] tabular-nums ${on ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}
              >
                {Number(d.date.slice(8))}
              </span>
            </Link>
          );
        })}
        <Link
          href="/picks/strong"
          scroll={false}
          aria-label="앞으로 예정된 픽 보기"
          className="ml-1 flex min-w-[40px] flex-col items-center gap-1"
        >
          <span className="text-[9px] text-transparent" aria-hidden>
            ·
          </span>
          <span
            className={`flex w-full items-center justify-center rounded-md px-1 text-[10px] font-semibold transition-colors ${
              active == null
                ? "bg-emerald-500 text-white"
                : "bg-black/[0.06] text-neutral-500 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
            }`}
            style={{ height: "56px" }}
          >
            예정
          </span>
          <span className="text-[10px] text-transparent" aria-hidden>
            ·
          </span>
        </Link>
      </div>
    </div>
  );
}

/** 팀 한 줄 — 로고 + 이름 (+ 종료 경기는 점수) */
function TeamLine({
  name,
  logo,
  score,
  won,
}: {
  name: string;
  logo: string | null;
  score: number | null;
  won: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TeamBadge logoUrl={logo} size={18} />
      <span className={`truncate text-sm break-keep ${won ? "font-bold" : "font-medium"}`}>{name}</span>
      {score != null ? (
        <span className={`ml-auto shrink-0 text-sm tabular-nums ${won ? "font-bold" : "text-neutral-500"}`}>
          {score}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 픽을 뒷받침하는 신호들. 있는 것만 배지로 — 없는 항목을 채워 넣지 않는다.
 * 여기 있는 값은 전부 모델이 실제로 입력으로 쓰는 것(선발·시장)이거나 DB 실측(폼)이다.
 */
function Evidence({ m }: { m: StrongPickMatch }) {
  const { form, starter, market } = m.evidence;
  const chips: { k: string; label: string; body: string }[] = [];

  if (form) {
    chips.push({
      k: "form",
      label: "최근 5경기",
      body: `${formText(form.home)} · ${formText(form.away)}`,
    });
  }
  if (starter) {
    const era = (s: { era: number | null }) => (s.era != null ? ` ${s.era.toFixed(2)}` : "");
    chips.push({
      k: "starter",
      label: starter.home.era != null ? "선발 ERA" : "선발",
      body: `${starter.home.name}${era(starter.home)} · ${starter.away.name}${era(starter.away)}`,
    });
  }
  if (market) {
    // 무승부가 없는 종목은 0% 로 저장돼 있다 — 그대로 쓰면 야구에 "무 0%" 가 붙는다
    const drawPart = market.draw != null && market.draw > 0.001 ? ` · 무 ${pct(market.draw)}` : "";
    chips.push({
      k: "market",
      label: "베팅시장",
      body: `${m.home} ${pct(market.home)}${drawPart} · ${m.away} ${pct(market.away)}`,
    });
  }
  if (!chips.length) return null;

  return (
    <dl className="mt-3 grid gap-1.5 sm:grid-cols-3">
      {chips.map((c) => (
        <div key={c.k} className="rounded-lg bg-black/[0.03] px-2.5 py-1.5 dark:bg-white/[0.04]">
          <dt className="text-[10px] font-medium text-neutral-500">{c.label}</dt>
          <dd className="truncate text-[11px] tabular-nums" title={c.body}>
            {c.body}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const kst = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(d);

/** 픽 카드 — 경기 하나와 그 경기에서 기준을 넘은 픽들 */
export function PickCard({
  m,
  byMarket,
}: {
  m: StrongPickMatch;
  byMarket: Record<StrongMarket, MarketAccuracy>;
}) {
  const homeWon = m.finished && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
  const awayWon = m.finished && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;

  return (
    <li className="rounded-2xl border border-black/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
        <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5 font-medium dark:bg-white/10">
          {m.league}
        </span>
        <span className="tabular-nums">{kst(m.startTime)}</span>
        {m.finished ? <span className="text-[11px]">종료</span> : null}
      </div>

      <div className="mt-2 space-y-1">
        <TeamLine name={m.home} logo={m.homeLogo} score={m.homeScore} won={homeWon} />
        <TeamLine name={m.away} logo={m.awayLogo} score={m.awayScore} won={awayWon} />
      </div>

      {m.winProb ? (
        <div className="mt-3">
          <WinProbSplit prob={m.winProb} home={m.home} away={m.away} />
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {m.picks.map((p) => {
          const th = STRONG_THRESHOLD[p.market];
          const over = (p.prob - th) * 100;
          const past = byMarket[p.market];
          return (
            <li key={p.market} className="rounded-xl bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm break-keep">
                  <span className="mr-2 text-[11px] font-medium text-neutral-500">
                    {MARKET_LABEL[p.market]}
                  </span>
                  <span className="font-semibold">{p.pick}</span>
                  {p.detail ? (
                    <span className="ml-1.5 text-[11px] text-neutral-500">{p.detail}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <ResultMark correct={p.correct} />
                  <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {pct(p.prob)}
                  </span>
                </span>
              </div>

              <div className="mt-2">
                <ConfidenceBar prob={p.prob} threshold={th} />
              </div>

              {/* 왜 이게 고확신인가 — 기준을 얼마나 넘었고, 그 기준이 과거에 얼마나 맞았는지 */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500 break-keep">
                {MARKET_LABEL[p.market]} 기준 {pct(th)}
                {over >= 0.5 ? ` 를 ${over.toFixed(0)}%p 넘었습니다` : " 선입니다"}.
                {past.total > 0
                  ? ` 이 기준으로 낸 ${past.total.toLocaleString()}픽의 실측 적중률은 ${past.rate.toFixed(1)}% 입니다.`
                  : ""}
              </p>
            </li>
          );
        })}
      </ul>

      <Evidence m={m} />
    </li>
  );
}
