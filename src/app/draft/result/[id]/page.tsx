// 드래프트 결과·공유 페이지 — 다섯 명과 점수 내역, 백분위·반지, 오늘 순위. 조합이 무한해 색인은 막는다.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import LineupPanel from "@/components/draft/LineupPanel";
import ResultActions from "@/components/draft/ResultActions";
import Rings from "@/components/draft/Rings";
import { getCurrentUserId } from "@/lib/current-user";
import { RING_TITLE, rankLabel, signed } from "@/lib/draft/labels";
import { MODES, playPath, resultPath } from "@/lib/draft/modes";
import { getPool } from "@/lib/draft/pool";
import { recordLabel } from "@/lib/draft/season";
import { getDraftResult } from "@/lib/draft/service";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await getDraftResult(id).catch(() => null);
  if (!r) return { title: "드래프트 결과", robots: { index: false, follow: false } };
  const title = `${MODES[r.mode].label} 블라인드 드래프트 ${recordLabel(r.season, MODES[r.mode].draws)} · ${RING_TITLE[r.rings]}`;
  const description = `${r.snapshot.picks.map((p) => p.name).join(", ")} — ${rankLabel(r.percentile)}`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, images: [{ url: `/api/og/draft?id=${id}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DraftResultPage({ params }: Props) {
  const { id } = await params;
  const r = await getDraftResult(id);
  if (!r) notFound();
  const [jar, userId] = await Promise.all([cookies(), getCurrentUserId()]);
  const mine = jar.get("draft_sid")?.value === r.sessionId;
  const playHref = playPath(r.mode);
  const cfg = MODES[r.mode];
  const record = recordLabel(r.season, cfg.draws);
  const headline = r.season.perfect ? `${cfg.games}전 전승` : cfg.draws && r.season.unbeaten ? "무패 우승" : record;

  return (
    <main className="relative mx-auto max-w-3xl px-4 py-8">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
          {MODES[r.mode].label} 블라인드 드래프트
        </span>

        <div className="mt-4 rounded-[2rem] bg-neutral-900 p-6 text-center text-white dark:bg-white/[0.06] dark:ring-1 dark:ring-white/10">
          <p className="text-xs text-white/60">{r.nickname ? `${r.nickname} 님의 팀` : mine ? "내가 만든 팀" : "누군가 만든 팀"}</p>
          <h1 className="mt-1 text-3xl font-bold tabular-nums text-amber-400">{headline}</h1>
          <p className="mt-1 text-xs text-white/60">{cfg.games}경기 시즌 시뮬 · {RING_TITLE[r.rings]}</p>
          <div className="mt-2 flex justify-center">
            <Rings count={r.rings} size={26} />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/[0.06] py-3">
              <dt className="text-[11px] text-white/60">점수</dt>
              <dd className="text-xl font-bold tabular-nums">{signed(r.total)}</dd>
            </div>
            <div className="rounded-2xl bg-white/[0.06] py-3">
              <dt className="text-[11px] text-white/60">백분위</dt>
              <dd className="text-xl font-bold tabular-nums">{rankLabel(r.percentile)}</dd>
            </div>
            <div className="rounded-2xl bg-white/[0.06] py-3">
              <dt className="text-[11px] text-white/60">오늘 순위</dt>
              <dd className="text-xl font-bold tabular-nums">{r.rankToday ? `${r.rankToday}위` : "-"}</dd>
              {r.rankToday > 0 && <dd className="text-[10px] text-white/50">{r.countToday}판 중</dd>}
            </div>
          </dl>
        </div>

        <div className="mt-3">
          <LineupPanel mode={r.mode} picks={r.snapshot.picks} score={r.snapshot.score} lockdownAt={getPool(r.mode).meta.lockdown} />
        </div>

        <div className="mt-3">
          <ResultActions
            gameId={r.id}
            url={`${SITE}${resultPath(r.id)}`}
            text={`${MODES[r.mode].label} 블라인드 드래프트 ${record}, ${signed(r.total)}점. 이길 수 있나요?`}
            mine={mine}
            registered={r.registered}
            loggedIn={!!userId}
          />
          <Link
            href={playHref}
            className="mt-2 block rounded-2xl bg-neutral-900 px-4 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {mine ? "한 판 더" : "나도 해보기"}
          </Link>
          <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">회원가입 없이 바로 시작합니다.</p>
        </div>
      </div>
    </main>
  );
}
