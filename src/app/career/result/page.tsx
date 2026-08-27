// 커리어 결과 공유 페이지 — 공유 링크를 받은 사람이 도착하는 곳. 결과는 URL 쿼리에 들어 있다.
// 조합이 무한하므로 색인은 막고(noindex), 대신 "나도 해보기" 로 게임으로 보낸다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { NATION_BY_CODE } from "@/lib/career/nations";
import { parseShareParams, positionLabel, shareHeadline } from "@/lib/career/share";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out.set(k, v);
    else if (Array.isArray(v) && v[0]) out.set(k, v[0]);
  }
  return out;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = toParams(await searchParams);
  const d = parseShareParams(params);
  if (!d) return { title: "커리어 결과", robots: { index: false, follow: false } };

  const title = `${d.topClub || "무소속"} · 최고 능력치 ${d.peakOvr}`;
  const description = shareHeadline(d);
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      images: [{ url: `/api/og/career?${params.toString()}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CareerResultPage({ searchParams }: Props) {
  const d = parseShareParams(toParams(await searchParams));
  if (!d) notFound();

  const nat = NATION_BY_CODE[d.nation];
  const stats: [string, string][] = [
    ["통산 경기", String(d.apps)],
    ["골", String(d.goals)],
    ["도움", String(d.assists)],
    ["우승", String(d.titles)],
    ["최고 능력치", String(d.peakOvr)],
    ["최고 몸값", d.peakValue >= 1 ? `€${d.peakValue}M` : "€1M 미만"],
    ["거쳐간 구단", `${d.clubs}팀`],
    ["대표팀", `${d.caps}경기`],
  ];

  return (
    <main className="relative mx-auto max-w-2xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          커리어 기록
        </span>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          <span aria-hidden>{nat?.flag}</span>
          <span>{nat?.label ?? d.nation}</span>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <span>{positionLabel(d.position)}</span>
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-neutral-900 dark:text-white">
          {d.topClub || "무소속"}
        </h1>

        <dl className="mt-7 grid grid-cols-4 gap-y-5 rounded-2xl bg-neutral-100 p-5 dark:bg-neutral-800/60">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-neutral-500 dark:text-neutral-400">{k}</dt>
              <dd className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">{v}</dd>
            </div>
          ))}
        </dl>

        <Link
          href="/career"
          className="mt-7 block rounded-xl bg-neutral-900 px-4 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          나도 해보기
        </Link>
        <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
          회원가입 없이 바로 시작합니다.
        </p>
      </div>
    </main>
  );
}
