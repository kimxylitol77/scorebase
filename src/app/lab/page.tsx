// /lab — 회원 커스텀 예측 봇 만들기: 손잡이 5개로 우리 모델을 조립하고 즉석 백테스트·경기 시뮬·봇 저장.
// 비회원은 기능 소개 + 비활성 미리보기 + 가입 CTA. 손잡이 조작·백테스트·저장은 회원 전용.
import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, SlidersHorizontal, LineChart, Bot, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { toKoreanTeamName } from "@/lib/team-names";
import { simSupportedLeague } from "@/lib/predict/match-sim";
import { clampKnobs, type BotKnobs } from "@/lib/predict/member-bot";
import AmbientGlow from "@/components/AmbientGlow";
import { KNOB_METAS } from "./knobs-meta";
import LabClient, { type LabBot, type LabBotPick, type LabMatch } from "./LabClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "커스텀 예측 봇 만들기 — 내 손잡이로 백테스트",
  description:
    "팀 체급·최근 기세·홈 이점·대중 시선·언더독 성향 5개 손잡이로 나만의 예측 봇을 만들고, 최근 1년 실제 경기로 즉석 백테스트해 우리 AI 모델과 적중률을 비교해 보세요.",
  alternates: { canonical: "https://www.scorebase.kr/lab" },
};

/** 시뮬 대상 예정 경기 — 예측 저장 + 시뮬 지원 리그만 */
async function loadUpcoming(preselectId: number | null): Promise<LabMatch[]> {
  const now = new Date();
  const rows = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
      predHome: { not: null },
      predDraw: { not: null },
      predAway: { not: null },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 200,
  });
  const list = rows.filter((m) => simSupportedLeague(m.league)).slice(0, 80);

  // ?match= 프리셀렉트 경기가 7일 창 밖이어도 조건만 맞으면 목록에 포함
  if (preselectId != null && !list.some((m) => m.id === preselectId)) {
    const m = await prisma.match.findUnique({
      where: { id: preselectId },
      select: {
        id: true,
        league: true,
        status: true,
        startTime: true,
        predHome: true,
        predDraw: true,
        predAway: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });
    if (
      m &&
      m.status === "SCHEDULED" &&
      m.predHome != null &&
      m.predDraw != null &&
      m.predAway != null &&
      simSupportedLeague(m.league)
    ) {
      list.unshift(m);
    }
  }

  return list.map((m) => ({
    id: m.id,
    league: m.league,
    home: toKoreanTeamName(m.homeTeam.name),
    away: toKoreanTeamName(m.awayTeam.name),
    startKst: kstLabel(m.startTime),
  }));
}

function kstLabel(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const day = ["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${day}) ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const { match } = await searchParams;
  const preselectId =
    match && /^\d+$/.test(match) ? Number(match) : null;

  const userId = await getCurrentUserId();

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <AmbientGlow />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
          <FlaskConical className="h-3 w-3" aria-hidden /> 예측 실험실
        </span>
        <h1 className="text-3xl font-bold tracking-tight break-keep sm:text-4xl">
          커스텀 예측 봇 만들기
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500 break-keep">
          우리 AI 모델의 신호 5개를 손잡이로 열었습니다. 팀 체급·최근 기세·홈 이점·대중 시선·언더독
          성향을 직접 조절해 나만의 봇을 만들고, 최근 1년 실제 경기로 즉석 백테스트해 우리 모델과
          적중률을 비교해 보세요.
        </p>
      </header>

      <div className="mt-6">
        {userId ? (
          <LabMember userId={userId} preselectId={preselectId} />
        ) : (
          <LabGuest />
        )}
      </div>

      <footer className="mt-10 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
          통계 모델 기반 참고용 정보이며 도박·베팅과 무관합니다. 우리 모델의 실제 성적은{" "}
          <Link
            href="/predictions/accuracy"
            className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-white/70"
          >
            적중률 보드
          </Link>
          에서 리그별로 공개합니다.
        </p>
      </footer>
    </main>
  );
}

// ── 회원 — 봇 목록·예정 경기 로드 후 클라이언트 위임 ──
async function LabMember({
  userId,
  preselectId,
}: {
  userId: string;
  preselectId: number | null;
}) {
  const [botRows, matches] = await Promise.all([
    prisma.memberBot.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        league: true,
        knobs: true,
        backtestCache: true,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    loadUpcoming(preselectId),
  ]);

  const bots: LabBot[] = botRows.map((b) => ({
    id: b.id,
    name: b.name,
    league: b.league,
    knobs: clampKnobs(b.knobs as Partial<BotKnobs> | null),
    backtestCache: (b.backtestCache as LabBot["backtestCache"]) ?? null,
    isActive: b.isActive,
  }));

  // 오늘 내 봇 픽 — cron 이 생성한 미시작 경기 픽 (매치는 manual join)
  let todayPicks: LabBotPick[] = [];
  if (botRows.length > 0) {
    const pickRows = await prisma.memberBotPick.findMany({
      where: { botId: { in: botRows.map((b) => b.id) }, market: "1X2" },
      select: { botId: true, matchId: true, pick: true, prob: true },
      orderBy: { id: "desc" },
      take: 120,
    });
    const matchIds = [...new Set(pickRows.map((p) => p.matchId))];
    if (matchIds.length > 0) {
      const ms = await prisma.match.findMany({
        where: { id: { in: matchIds }, startTime: { gte: new Date() } },
        select: {
          id: true,
          league: true,
          startTime: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      });
      const mMap = new Map(ms.map((m) => [m.id, m]));
      todayPicks = pickRows
        .filter((p) => mMap.has(p.matchId))
        .map((p) => {
          const m = mMap.get(p.matchId)!;
          return {
            botId: p.botId,
            matchId: p.matchId,
            pick: p.pick,
            prob: p.prob,
            league: m.league,
            home: toKoreanTeamName(m.homeTeam.name),
            away: toKoreanTeamName(m.awayTeam.name),
            startMs: m.startTime.getTime(),
            startKst: kstLabel(m.startTime),
          };
        })
        .sort((a, b) => a.startMs - b.startMs)
        .slice(0, 30);
    }
  }

  return (
    <LabClient
      matches={matches}
      initialBots={bots}
      todayPicks={todayPicks}
      preselectMatchId={preselectId}
    />
  );
}

// ── 비회원 — 소개 + 비활성 손잡이 미리보기 + 가입 CTA ──
function LabGuest() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            Icon: SlidersHorizontal,
            title: "손잡이 5개",
            desc: "팀 체급·최근 기세·홈 이점·대중 시선·언더독 성향을 0~200%로 조절",
          },
          {
            Icon: LineChart,
            title: "즉석 백테스트",
            desc: "최근 1년 실제 경기로 슬라이더를 움직일 때마다 적중률 즉시 재계산",
          },
          {
            Icon: Bot,
            title: "봇 저장",
            desc: "마음에 드는 조합을 봇으로 저장하고 예정 경기를 5,000회 시뮬",
          },
        ].map(({ Icon, title, desc }) => (
          <section
            key={title}
            className="rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
          >
            <Icon className="h-5 w-5 text-violet-500" aria-hidden />
            <h2 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 break-keep dark:text-white/50">
              {desc}
            </p>
          </section>
        ))}
      </div>

      {/* 손잡이 미리보기 — 비활성 */}
      <section className="relative overflow-hidden rounded-[1.5rem] bg-white p-6 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] sm:rounded-[2rem] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div aria-hidden className="pointer-events-none select-none space-y-4 opacity-50">
          {KNOB_METAS.map((k) => (
            <div key={k.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-zinc-800 dark:text-white/85">
                  {k.label}
                </span>
                <span className="text-xs font-bold tabular-nums text-zinc-400 dark:text-white/35">
                  100%
                </span>
              </div>
              <input type="range" min={0} max={200} defaultValue={100} disabled className="mt-1 w-full accent-violet-500" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-white via-white/70 to-transparent dark:from-zinc-950 dark:via-zinc-950/70">
          <div className="mx-4 max-w-sm rounded-2xl bg-white/95 p-5 text-center shadow-xl ring-1 ring-zinc-200 backdrop-blur dark:bg-zinc-900/95 dark:ring-white/15">
            <Lock className="mx-auto h-5 w-5 text-zinc-400 dark:text-white/40" aria-hidden />
            <p className="mt-2 text-[15px] font-bold text-zinc-900 dark:text-white">
              손잡이는 회원 전용입니다
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 break-keep dark:text-white/60">
              가입하면 손잡이 조작·백테스트·봇 저장(최대 3개)을 전부 쓸 수 있습니다.
            </p>
            <a
              href="/signup?from=%2Flab"
              className="mt-3 inline-block rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-85"
            >
              3초 구글 가입
            </a>
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-white/35">
              이미 회원이라면{" "}
              <a href="/login?from=%2Flab" className="underline underline-offset-2">
                로그인
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
