// /en/predictions/scorecard — 멀티 AI 승부예측 리더보드 영어판 (린).
// 데이터·채점은 ko 와 동일(AiPrediction, published 만) + GPT 버전 통합 규칙 공유(isGptScorecardModel).
// ko 의 시장 탭·경기별 히스토리·컨센서스 게이트는 미이식 — 리더보드·시장별 성적·다가오는 원탁만.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { isGptScorecardModel } from "@/lib/predict/gpt-scorecard-model";
import { toEnglishTeamName, enLeagueName } from "@/lib/i18n/en";
import LocalKickoff from "@/components/en/LocalKickoff";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "AI Prediction Scorecard — GPT vs Claude vs Grok vs Gemini Leaderboard",
  description:
    "Multiple AIs — the Scorebase statistical model, GPT, Claude, Grok, Gemini, Qwen and Kimi — predict the same matches before kickoff and get graded on the results. A fully transparent multi-AI leaderboard for 1X2, handicap and over/under picks.",
  alternates: {
    canonical: `${SITE_URL}/en/predictions/scorecard`,
    languages: {
      ko: `${SITE_URL}/predictions/scorecard`,
      en: `${SITE_URL}/en/predictions/scorecard`,
      "x-default": `${SITE_URL}/predictions/scorecard`,
    },
  },
};

type Market = "1X2" | "HANDICAP" | "OU";
const MARKET_EN: Record<Market, string> = { "1X2": "1X2", HANDICAP: "Handicap", OU: "Over/Under" };

const MODEL_META: Record<string, { label: string; order: number }> = {
  scorebase: { label: "Scorebase model", order: 0 },
  gpt: { label: "GPT-5.6 Sol", order: 1 },
  grok: { label: "Grok", order: 2 },
  gemini: { label: "Gemini", order: 3 },
  "qwen2.5-32b": { label: "Qwen", order: 4 },
  claude: { label: "Claude", order: 5 },
  "kimi-k3": { label: "Kimi K3", order: 6 },
};
const normModel = (m: string) => (isGptScorecardModel(m) ? "gpt" : m);
const labelOf = (m: string) => MODEL_META[m]?.label ?? m;

interface Cell {
  pick: string;
  prob: number;
  line: number | null;
  correct: boolean | null;
}
interface DP {
  matchId: number;
  market: Market;
  league: string;
  startTime: Date;
  status: string;
  home: string;
  away: string;
  cells: Map<string, Cell>;
}

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

function pickText(market: Market, pick: string, home: string, away: string, line: number | null): string {
  if (market === "OU") return `${pick === "OVER" ? "Over" : "Under"}${line != null ? ` ${line}` : ""}`;
  if (market === "HANDICAP")
    return `${pick === "HOME" ? home : away}${line != null ? ` ${pick === "HOME" ? "-" : "+"}${Math.abs(line)}` : ""}`;
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "Draw";
}

export default async function EnScorecardPage() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: { in: ["1X2", "HANDICAP", "OU"] }, published: true },
    orderBy: { match: { startTime: "asc" } },
    select: {
      model: true,
      market: true,
      pick: true,
      prob: true,
      line: true,
      correct: true,
      match: {
        select: {
          id: true,
          league: true,
          startTime: true,
          status: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  // (matchId, market) 단위 데이터포인트 — ko 와 동일한 묶음 규칙 (gpt 는 채점된 행 우선 보존)
  const byKey = new Map<string, DP>();
  for (const r of rows) {
    const m = r.match;
    const mk = r.market as Market;
    const key = `${m.id}:${mk}`;
    let dp = byKey.get(key);
    if (!dp) {
      dp = {
        matchId: m.id,
        market: mk,
        league: m.league,
        startTime: m.startTime,
        status: m.status,
        home: toEnglishTeamName(m.homeTeam.name),
        away: toEnglishTeamName(m.awayTeam.name),
        cells: new Map(),
      };
      byKey.set(key, dp);
    }
    const nm = normModel(r.model);
    const existing = dp.cells.get(nm);
    if (!existing || (existing.correct === null && r.correct !== null)) {
      dp.cells.set(nm, { pick: r.pick, prob: r.prob, line: r.line, correct: r.correct });
    }
  }
  const datapoints = [...byKey.values()];
  const present = [...new Set(rows.map((r) => normModel(r.model)))].sort(
    (a, b) => (MODEL_META[a]?.order ?? 9) - (MODEL_META[b]?.order ?? 9),
  );

  const tallyOf = (model: string, market?: Market) => {
    let graded = 0,
      correct = 0;
    for (const d of datapoints) {
      if (market && d.market !== market) continue;
      const c = d.cells.get(model);
      if (!c || c.correct === null) continue;
      graded++;
      if (c.correct) correct++;
    }
    return { graded, correct, rate: graded > 0 ? correct / graded : 0 };
  };
  const RECENT = 100;
  const recentOf = (model: string) => {
    let graded = 0,
      correct = 0;
    for (let i = datapoints.length - 1; i >= 0 && graded < RECENT; i--) {
      const c = datapoints[i].cells.get(model);
      if (!c || c.correct === null) continue;
      graded++;
      if (c.correct) correct++;
    }
    return { graded, correct, rate: graded > 0 ? correct / graded : 0 };
  };

  const board = present
    .map((m) => ({ model: m, total: tallyOf(m), recent: recentOf(m) }))
    .filter((b) => b.total.graded > 0)
    .sort((a, b) => b.recent.rate - a.recent.rate);

  // 다가오는 AI 원탁 — 예정 1X2 경기 중 2개 모델 이상 픽이 모인 다음 6경기
  const now = new Date();
  const upcoming = datapoints
    .filter((d) => d.market === "1X2" && d.status === "SCHEDULED" && d.startTime > now && d.cells.size >= 2)
    .slice(0, 6);

  return (
    <main className="relative mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <nav className="text-xs text-neutral-400">
          <Link href="/en/predictions" className="hover:underline">
            Predictions
          </Link>{" "}
          / Scorecard
        </nav>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          AI prediction scorecard
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
          Several AIs — our statistical model plus GPT, Claude, Grok, Gemini, Qwen and Kimi — call
          the same matches before kickoff. Every pick is graded on the final result, wins and losses
          alike.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Leaderboard</h2>
          <span className="text-xs text-neutral-500">ranked by last {RECENT} graded picks</span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
                <th className="px-3 py-2.5 w-10 text-center">#</th>
                <th className="px-3 py-2.5">Model</th>
                <th className="px-2 py-2.5 text-center">Recent {RECENT}</th>
                <th className="px-2 py-2.5 text-center">All-time</th>
                <th className="px-2 py-2.5 text-center">1X2</th>
                <th className="px-2 py-2.5 text-center">Handicap</th>
                <th className="px-2 py-2.5 text-center">O/U</th>
              </tr>
            </thead>
            <tbody>
              {board.map((b, i) => (
                <tr key={b.model} className="border-b border-neutral-100 last:border-0 dark:border-white/5">
                  <td className="px-3 py-2 text-center font-bold tabular-nums text-neutral-400">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold">
                    {labelOf(b.model)}
                    {b.model === "scorebase" && (
                      <span className="ml-2 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
                        House
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    <span className="font-bold">{pct(b.recent.rate)}</span>
                    <span className="block text-[10px] text-neutral-400">
                      {b.recent.correct}/{b.recent.graded}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-neutral-500">
                    {pct(b.total.rate)}
                    <span className="block text-[10px] text-neutral-400">
                      {b.total.correct}/{b.total.graded}
                    </span>
                  </td>
                  {(["1X2", "HANDICAP", "OU"] as Market[]).map((mk) => {
                    const t = tallyOf(b.model, mk);
                    return (
                      <td key={mk} className="px-2 py-2 text-center tabular-nums text-neutral-500">
                        {t.graded > 0 ? pct(t.rate) : "—"}
                        {t.graded > 0 && (
                          <span className="block text-[10px] text-neutral-400">{t.correct}/{t.graded}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Next round table</h2>
          <p className="text-xs text-neutral-500">
            Upcoming matches where the panel has already locked in picks — graded after full time.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((d) => (
              <div key={`${d.matchId}:${d.market}`} className="rounded-2xl border border-neutral-200 p-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                  <span className="font-semibold uppercase tracking-wide">{enLeagueName(d.league)}</span>
                  <LocalKickoff iso={d.startTime.toISOString()} />
                </div>
                <div className="mt-1.5 text-sm font-semibold">
                  {d.home} <span className="text-xs font-normal text-neutral-400">vs</span> {d.away}
                </div>
                <div className="mt-2 space-y-1">
                  {present
                    .filter((m) => d.cells.has(m))
                    .map((m) => {
                      const c = d.cells.get(m)!;
                      return (
                        <div key={m} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-neutral-500">{labelOf(m)}</span>
                          <span className="font-medium">
                            {pickText(d.market, c.pick, d.home, d.away, c.line)}{" "}
                            <span className="tabular-nums text-neutral-400">{Math.round(c.prob * 100)}%</span>
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3 border-t border-neutral-200 pt-6 dark:border-white/10">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">How grading works</h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          All models receive the same pre-match context and pick the same markets — 1X2, handicap
          and over/under on identical lines — before kickoff. Picks are locked, then graded
          automatically against the final score. The recent-{RECENT} column compares models on an
          equal sample regardless of how long they have been on the panel. Our own statistical
          model (&ldquo;House&rdquo;) sits on the same leaderboard with no special treatment — see
          its long-run rates on the{" "}
          <Link href="/en/predictions/accuracy" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            accuracy page
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
