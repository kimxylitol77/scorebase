// "오늘의 AI 만장일치" 전환 위젯 (서버) — SEO 관문 페이지(블로그·아티클) 하단에 심어
// 검색 유입을 성적표(/predictions/scorecard)와 매치 상세(픽 남기기)로 흘려보낸다.
// 5개+ AI 가 같은 1X2 픽을 낸 예정 경기 최대 2개 + 만장일치 누적 성적을 보여준다.
// 데이터 없으면 리더보드 티저로 폴백 — 어떤 경우에도 빈 화면은 없다.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

const MIN_MODELS = 5;

function matchHref(league: string, externalId: string): string {
  if (league === "KBO" || league === "NPB" || league === "MLB")
    return `/live/${league.toLowerCase()}/${externalId}`;
  if (league === "LOL") return `/live/lol/${externalId}`;
  return `/live/${league}/${externalId}`;
}

export default async function AiConsensusWidget() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: "1X2", published: true },
    select: {
      model: true, pick: true, prob: true, correct: true,
      match: {
        select: {
          id: true, league: true, status: true, startTime: true, externalId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  interface Cell { model: string; pick: string; prob: number; correct: boolean | null }
  const byMatch = new Map<number, { m: (typeof rows)[number]["match"]; cells: Cell[] }>();
  for (const r of rows) {
    const norm = r.model.startsWith("gpt-") ? "gpt" : r.model;
    let e = byMatch.get(r.match.id);
    if (!e) { e = { m: r.match, cells: [] }; byMatch.set(r.match.id, e); }
    if (!e.cells.some((c) => c.model === norm)) e.cells.push({ model: norm, pick: r.pick, prob: r.prob, correct: r.correct });
  }

  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming: { league: string; externalId: string; startTime: Date; home: string; away: string; avg: number; n: number }[] = [];
  let graded = 0, wins = 0;
  for (const { m, cells } of byMatch.values()) {
    if (cells.length < MIN_MODELS) continue;
    if (new Set(cells.map((c) => c.pick)).size !== 1) continue;
    if (m.status === "SCHEDULED" && m.startTime.getTime() > now) {
      const home = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name;
      const away = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name;
      upcoming.push({
        league: m.league, externalId: m.externalId, startTime: m.startTime,
        home, away,
        avg: cells.reduce((s, c) => s + c.prob, 0) / cells.length,
        n: cells.length,
      });
    } else if (cells.every((c) => c.correct !== null)) {
      graded++;
      if (cells[0].correct) wins++;
    }
  }
  upcoming.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const top = upcoming.slice(0, 2);

  const fmt = (d: Date) =>
    d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <aside className="my-10 rounded-2xl bg-gradient-to-br from-rose-500/[0.06] to-amber-500/[0.06] p-5 ring-1 ring-rose-500/15 dark:from-rose-500/10 dark:to-amber-500/10">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400">
          AI 원탁 — 오늘의 만장일치
        </div>
        {graded > 0 && (
          <span className="text-[12px] tabular-nums text-zinc-500 dark:text-white/50">
            만장일치 성적 {wins}승 {graded - wins}패 ({((wins / graded) * 100).toFixed(0)}%)
          </span>
        )}
      </div>

      {top.length > 0 ? (
        <div className="mt-3 space-y-2">
          {top.map((u) => (
            <Link
              key={`${u.league}-${u.externalId}`}
              href="/predictions/scorecard"
              className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2.5 text-[14px] ring-1 ring-zinc-200/60 transition-colors hover:bg-white dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.07]"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-zinc-800 dark:text-white/85">{u.home}</span>
                <span className="mx-1 text-zinc-400 dark:text-white/30">vs</span>
                <span className="font-semibold text-zinc-800 dark:text-white/85">{u.away}</span>
                <span className="ml-2 text-[12px] text-zinc-400 dark:text-white/35">{fmt(u.startTime)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                AI {u.n}개 만장일치 · 평균 {(u.avg * 100).toFixed(0)}%
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-zinc-600 dark:text-white/55">
          지금은 만장일치 예정 경기가 없습니다. 통계모델과 GPT·Grok·Gemini·Claude·Qwen이
          같은 경기를 예측하고 전패까지 공개 채점되는 리더보드를 확인해 보세요.
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <Link
          href="/predictions/scorecard"
          className="rounded-xl bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-85 dark:bg-white dark:text-zinc-900"
        >
          6개 AI 픽 전부 보기
        </Link>
        <span className="text-[12px] text-zinc-500 dark:text-white/45">
          어느 팀에 만장일치했는지는 무료 가입 후 공개됩니다 — 내 픽도 AI와 같은 기준으로 채점됩니다.
        </span>
      </div>
    </aside>
  );
}
