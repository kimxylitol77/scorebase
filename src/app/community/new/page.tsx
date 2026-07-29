// 자유게시판 글쓰기 — 제목·본문 + 선택 첨부(내 드림팀 자랑 / 전술판 공유 링크)
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { TIERS } from "@/lib/dream-team/tiers";
import { clampKnobs, type BotKnobs } from "@/lib/predict/member-bot";
import { KNOB_METAS } from "@/app/lab/knobs-meta";
import SignupGateCard from "@/components/SignupGateCard";
import BoardForm from "./BoardForm";
import { buildStarterShareText, buildPitcherShareText } from "@/lib/predict/starter-card-share";

export const dynamic = "force-dynamic";

/** /lab "게시판에 공유" 프리필 — 봇 이름·손잡이 표·백테스트 성적·참고용 문구·/lab 링크 */
function buildBotShareText(bot: {
  name: string;
  knobs: unknown;
  backtestCache: unknown;
}): { title: string; content: string } {
  const knobs = clampKnobs(bot.knobs as Partial<BotKnobs> | null);
  const bt = (bot.backtestCache ?? null) as {
    n?: number;
    acc?: number;
    vsModel?: number;
  } | null;

  const lines: string[] = [
    `[예측 실험실](/lab)에서 만든 커스텀 예측 봇 **${bot.name}** 의 손잡이 설정을 공유합니다.`,
    "",
    "| 손잡이 | 값 |",
    "| --- | --- |",
    ...KNOB_METAS.map((k) => `| ${k.label} | ${Math.round(knobs[k.key] * 100)}% |`),
  ];
  if (bt?.acc != null && bt?.n != null) {
    lines.push(
      "",
      "**저장 시점 백테스트** (최근 1년, 우리 모델이 채점한 종료 경기 기준)",
      `- 표본 ${bt.n.toLocaleString()}경기 · 적중률 ${(bt.acc * 100).toFixed(1)}%` +
        (bt.vsModel != null
          ? ` · 우리 AI 모델 대비 ${bt.vsModel > 0 ? "+" : ""}${bt.vsModel.toFixed(1)}%p`
          : ""),
    );
  }
  lines.push(
    "",
    "통계 모델 기반 참고용 정보이며, 과거 성적이 미래 적중을 보장하지 않습니다.",
    "",
    "나만의 봇 만들기 → https://www.scorebase.kr/lab",
  );
  return {
    title: `[내 예측봇] ${bot.name} — 손잡이 설정 공유`,
    content: lines.join("\n"),
  };
}

export default async function NewBoardPostPage({ searchParams }: { searchParams: Promise<{ lineup?: string; bot?: string; starter?: string; side?: string; stitle?: string; spath?: string }> }) {
  // 전술판 "게시판에 올리기" 진입 — ?lineup={d코드} 를 폼에 미리 채움 (로그인 리다이렉트에도 보존)
  const { lineup, bot, starter, side, stitle, spath } = await searchParams;
  const lineupCode = lineup && /^[A-Za-z0-9_\-~.%]+$/.test(lineup) && lineup.length <= 4000 ? lineup : null;
  // /lab "게시판에 공유" 진입 — ?bot={id} (cuid) 소유 봇만 프리필
  const botId = bot && /^[A-Za-z0-9]{10,40}$/.test(bot) ? bot : null;
  // 페이지 "공유 → 자유게시판" 진입 (ShareCardButton) — 사이트 내 경로만 허용 (외부 링크 주입 차단)
  const shareTitle = stitle && stitle.trim().length >= 2 ? stitle.trim().slice(0, 90) : null;
  const sharePath =
    spath && /^\/[^\s]*$/.test(spath) && !spath.startsWith("//") && spath.length <= 300 ? spath : null;
  // /predictions/starters "게시판에 올리기" 진입 — ?starter={matchId} (+ 투수 개인 카드는 &side=home|away).
  // 카드 페이지를 범용 공유(spath)로 올려도 같은 리치 프리필이 나오게 경로에서도 뽑는다.
  const pathMatch = sharePath?.match(/^\/predictions\/starters\/(\d{1,10})(?:\/(home|away))?(?:[?#]|$)/);
  const starterId = starter && /^\d{1,10}$/.test(starter)
    ? Number(starter)
    : Number(pathMatch?.[1]) || null;
  const starterSide: "home" | "away" | null =
    starter && (side === "home" || side === "away")
      ? side
      : !starter && (pathMatch?.[2] === "home" || pathMatch?.[2] === "away")
        ? pathMatch[2]
        : null;
  const qs = new URLSearchParams();
  if (lineupCode) qs.set("lineup", lineupCode);
  if (botId) qs.set("bot", botId);
  if (starter && starterId) qs.set("starter", String(starterId));
  if (starter && starterId && starterSide) qs.set("side", starterSide);
  if (shareTitle) qs.set("stitle", shareTitle);
  if (sharePath) qs.set("spath", sharePath);
  const qsStr = qs.toString();
  const backTo = `/community/new${qsStr ? `?${qsStr}` : ""}`;
  const user = await getCurrentUser();

  // 봇 공유 프리필 — 소유 확인 (남의 봇 id 는 무시)
  let botPrefill: { title: string; content: string } | null = null;
  if (user && botId) {
    const myBot = await prisma.memberBot.findFirst({
      where: { id: botId, userId: user.id },
      select: { name: true, knobs: true, backtestCache: true },
    });
    if (myBot) botPrefill = buildBotShareText(myBot);
  }

  // 선발 카드 프리필 — matchId 로 DB 재조회 (수치는 전부 DB 실측). side 가 있으면 투수 개인 카드.
  const starterPrefill = !botPrefill && starterId
    ? starterSide
      ? await buildPitcherShareText(starterId, starterSide)
      : await buildStarterShareText(starterId)
    : null;

  // 페이지 공유 프리필 — 제목 + 본문에 사이트 내 링크 (봇·선발 카드 프리필이 있으면 그쪽 우선)
  const sharePrefill =
    !botPrefill && !starterPrefill && (shareTitle || sharePath)
      ? {
          title: shareTitle ? `[공유] ${shareTitle}` : "",
          content: sharePath ? `https://www.scorebase.kr${sharePath}\n\n` : "",
        }
      : null;

  // 내 드림팀 — 있으면 첨부 체크박스에 팀명 노출
  const team = user
    ? await prisma.dreamTeam.findFirst({
        where: { userId: user.id },
        select: { name: true, tier: true },
      })
    : null;

  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <AmbientGlow />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> 자유게시판
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight break-keep">글쓰기</h1>
        </div>
        <Link
          href="/analysis?board=free"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> 목록
        </Link>
      </div>
      {user ? (
        <BoardForm
          myTeam={team ? { name: team.name, tierName: TIERS[team.tier]?.name ?? team.tier } : null}
          defaultLineup={lineupCode}
          defaultTitle={botPrefill?.title ?? starterPrefill?.title ?? sharePrefill?.title}
          defaultContent={botPrefill?.content ?? starterPrefill?.content ?? sharePrefill?.content}
        />
      ) : (
        <SignupGateCard from={backTo} />
      )}
    </main>
  );
}
