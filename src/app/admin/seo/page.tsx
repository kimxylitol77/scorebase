// 블로그 SEO 점수판 — 글마다 온페이지 점수(0~100, 항목별 통과/실패) + 구글 실측(GSC 노출·클릭·순위).
import Link from "next/link";
import { prisma } from "@/lib/db";
import { scoreBlogPost, type SeoScore } from "@/lib/seo-score";
import { getGscOverview, gscPageToPath, type GscRow } from "@/lib/gsc";

export const dynamic = "force-dynamic";

const GRADE_COLOR: Record<SeoScore["grade"], string> = {
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  D: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export default async function AdminSeoPage() {
  const [posts, gsc] = await Promise.all([
    prisma.blog.findMany({
      orderBy: { publishedAt: "desc" },
      select: { id: true, slug: true, title: true, excerpt: true, content: true, tags: true, thumbnailUrl: true, publishedAt: true },
    }),
    getGscOverview(),
  ]);

  // GSC 페이지(28일) → path 매핑
  const gscByPath = new Map<string, GscRow>();
  if (gsc.configured) {
    for (const row of gsc.pages28) {
      const path = gscPageToPath(row.keys[0] ?? "");
      gscByPath.set(path.replace(/\/$/, ""), row);
    }
  }

  const scored = posts.map((p) => {
    const s = scoreBlogPost(p);
    const path = `/blog/${p.slug}`;
    const g = gscByPath.get(path) ?? null;
    return { ...p, seo: s, gsc: g };
  });
  // 점수 낮은 순(고칠 게 많은 글 먼저)
  scored.sort((a, b) => a.seo.score - b.seo.score);

  const avg = scored.length ? Math.round(scored.reduce((s, p) => s + p.seo.score, 0) / scored.length) : 0;
  const gradeCount = { A: 0, B: 0, C: 0, D: 0 } as Record<SeoScore["grade"], number>;
  for (const p of scored) gradeCount[p.seo.grade]++;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEO 점수판</h1>
          <p className="text-sm text-neutral-500 mt-1">
            블로그 글의 온페이지 SEO 점수(체크리스트 기준)와 구글 실측(GSC) 노출·클릭·순위를 함께 봅니다. 점수가 낮은 글부터 정렬됩니다.
          </p>
        </div>
        <Link href="/admin/blog" className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">블로그 관리 →</Link>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="글 수" value={`${scored.length}`} />
        <SummaryCard label="평균 점수" value={`${avg}`} suffix="/100" />
        <SummaryCard label="A·B 등급" value={`${gradeCount.A + gradeCount.B}`} suffix={`/${scored.length}`} />
        <SummaryCard
          label="구글 노출(28일)"
          value={gsc.configured ? (gsc.totals28 ? gsc.totals28.impressions.toLocaleString() : "0") : "미연동"}
        />
      </div>
      {!gsc.configured && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          GSC가 연동되지 않아 구글 실측(노출·클릭·순위)은 표시되지 않습니다. 온페이지 점수는 정상 산출됩니다.
        </p>
      )}

      {/* 목록 */}
      <div className="space-y-3">
        {scored.map((p) => (
          <details key={p.id} className="group rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] overflow-hidden">
            <summary className="flex items-center gap-3 p-4 cursor-pointer list-none hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
              <span className={`shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-lg font-black text-lg tabular-nums ${GRADE_COLOR[p.seo.grade]}`}>
                {p.seo.score}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold truncate">{p.title}</span>
                <span className="block text-xs text-neutral-500 truncate">
                  {p.seo.keyword ? <span className="text-neutral-600 dark:text-neutral-300">#{p.seo.keyword}</span> : "키워드 없음"}
                  {" · "}{p.seo.charCount.toLocaleString()}자
                  {" · "}<span className="text-neutral-400">/blog/{p.slug}</span>
                </span>
              </span>
              {/* GSC 실측 */}
              <span className="shrink-0 hidden sm:flex items-center gap-4 text-xs tabular-nums text-neutral-500">
                {p.gsc ? (
                  <>
                    <Metric label="노출" value={p.gsc.impressions.toLocaleString()} />
                    <Metric label="클릭" value={p.gsc.clicks.toLocaleString()} />
                    <Metric label="순위" value={p.gsc.position.toFixed(1)} />
                  </>
                ) : (
                  <span className="text-neutral-400">{gsc.configured ? "구글 노출 데이터 없음" : "—"}</span>
                )}
              </span>
              <span className="shrink-0 text-neutral-400 group-open:rotate-180 transition-transform">⌄</span>
            </summary>

            <div className="border-t border-neutral-100 dark:border-neutral-800 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {p.seo.checks.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 text-sm">
                    <span className={c.pass ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>
                      {c.pass ? "✓" : "✕"}
                    </span>
                    <span className={c.pass ? "text-neutral-700 dark:text-neutral-300" : "font-medium"}>{c.label}</span>
                    <span className="ml-auto text-xs text-neutral-500 tabular-nums">{c.detail}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-1 text-xs">
                <Link href={`/blog/${p.slug}`} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">글 보기 ↗</Link>
                <Link href={`/admin/blog`} className="text-neutral-500 hover:underline">편집(블로그 관리)</Link>
                {p.gsc && (
                  <span className="ml-auto text-neutral-500">CTR {(p.gsc.ctr * 100).toFixed(1)}%</span>
                )}
              </div>
            </div>
          </details>
        ))}
        {scored.length === 0 && (
          <p className="text-sm text-neutral-500 py-12 text-center">블로그 글이 없습니다.</p>
        )}
      </div>

      <p className="text-[11px] text-neutral-400 leading-relaxed">
        온페이지 점수는 자체 체크리스트(분량·키워드·소제목·내부외부 링크·이미지·FAQ 스키마 등) 가중 합으로, 구글의 실제 순위 알고리즘과는 다릅니다. 구글 실측(노출·클릭·순위)은 Search Console 28일 데이터로, 클릭이 있는 상위 페이지만 매칭됩니다.
      </p>
    </main>
  );
}

function SummaryCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">
        {value}
        {suffix && <span className="text-sm font-medium text-neutral-400">{suffix}</span>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-neutral-400 text-[10px]">{label}</span>
      <span className="text-neutral-700 dark:text-neutral-200 font-semibold">{value}</span>
    </span>
  );
}
