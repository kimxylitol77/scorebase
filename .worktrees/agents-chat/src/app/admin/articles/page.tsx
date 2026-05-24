import { prisma } from "@/lib/db";
import Link from "next/link";
import LeagueBadge from "@/components/LeagueBadge";
import ArticleRowActions from "./ArticleRowActions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안",
  PENDING_REVIEW: "검수 대기",
  APPROVED: "승인됨",
  PUBLISHED: "발행됨",
  REJECTED: "거절됨",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  PUBLISHED:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  REJECTED:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  DRAFT:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

const STATUS_FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "PUBLISHED", label: "발행됨" },
  { key: "PENDING_REVIEW", label: "검수 대기" },
  { key: "DRAFT", label: "초안" },
  { key: "REJECTED", label: "거절됨" },
];

interface Props {
  searchParams: Promise<{ status?: string; league?: string; page?: string }>;
}

const PER_PAGE = 50;

export default async function AdminArticles({ searchParams }: Props) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? "ALL";
  const leagueFilter = sp.league ?? "ALL";
  const pageNum = Math.max(1, Number(sp.page ?? "1") || 1);

  const where: Record<string, unknown> = {};
  if (statusFilter !== "ALL") where.status = statusFilter;
  if (leagueFilter !== "ALL") where.league = leagueFilter;

  const [totalCount, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const currentPage = Math.min(pageNum, totalPages);
  const baseQuery: Record<string, string> = {};
  if (statusFilter !== "ALL") baseQuery.status = statusFilter;
  if (leagueFilter !== "ALL") baseQuery.league = leagueFilter;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link
            href="/admin"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            ← 관리자 메인
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">모든 글 관리</h1>
          <p className="text-xs text-neutral-500 mt-1">
            매치 PREVIEW · RECAP · ANALYSIS 글 관리. 공지사항/패치노트는{" "}
            <Link
              href="/admin/notices"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              여기서 관리 →
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/notices"
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 transition"
          >
            📢 공지/패치노트
          </Link>
          <Link
            href="/admin/new"
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition"
          >
            ＋ 새 글 작성
          </Link>
        </div>
      </header>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <FilterGroup
          label="상태"
          current={statusFilter}
          paramKey="status"
          otherParam={leagueFilter !== "ALL" ? `league=${leagueFilter}` : ""}
          options={STATUS_FILTERS}
        />
        <FilterGroup
          label="리그"
          current={leagueFilter}
          paramKey="league"
          otherParam={statusFilter !== "ALL" ? `status=${statusFilter}` : ""}
          options={[
            { key: "ALL", label: "전체" },
            { key: "EPL", label: "EPL" },
            { key: "NBA", label: "NBA" },
            { key: "KBO", label: "KBO" },
          ]}
        />
      </div>

      {/* 글 목록 */}
      {articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500">
          조건에 맞는 글이 없습니다.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium w-14">#</th>
                <th className="text-left px-3 py-2.5 font-medium w-20">리그</th>
                <th className="text-left px-3 py-2.5 font-medium w-20">타입</th>
                <th className="text-left px-3 py-2.5 font-medium">제목</th>
                <th className="text-left px-3 py-2.5 font-medium w-24">상태</th>
                <th className="text-left px-3 py-2.5 font-medium w-32">생성</th>
                <th className="text-right px-3 py-2.5 font-medium w-44">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {articles.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                >
                  <td className="px-3 py-2.5 tabular-nums text-neutral-400">
                    {a.id}
                  </td>
                  <td className="px-3 py-2.5">
                    <LeagueBadge league={a.league} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-500">
                    {a.type}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.status === "PUBLISHED" ? (
                      <Link
                        href={`/articles/${a.slug}`}
                        className="font-medium hover:underline truncate block"
                      >
                        {a.title}
                      </Link>
                    ) : (
                      <span className="font-medium truncate block">
                        {a.title}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[a.status]}`}
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-500 tabular-nums">
                    {new Date(a.createdAt).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ArticleRowActions
                      id={a.id}
                      status={a.status}
                      title={a.title}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-neutral-500">
          총 {totalCount}건 · {currentPage}/{totalPages} 페이지
          {totalCount > 0 && (
            <span className="ml-1 text-neutral-400">
              ({(currentPage - 1) * PER_PAGE + 1}–
              {(currentPage - 1) * PER_PAGE + articles.length})
            </span>
          )}
        </p>
        {totalPages > 1 && (
          <Pagination
            current={currentPage}
            total={totalPages}
            baseQuery={baseQuery}
          />
        )}
      </div>
    </div>
  );
}

function buildHref(baseQuery: Record<string, string>, page: number): string {
  const params = new URLSearchParams(baseQuery);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/articles?${qs}` : "/admin/articles";
}

function getPageRange(current: number, total: number): number[] {
  // 현재 페이지 ±2 윈도우, 양 끝(1, total) 항상 포함.
  // 사이 빈 구간은 호출부에서 "…" 처리.
  const window = new Set<number>([1, total, current]);
  for (let d = 1; d <= 2; d++) {
    window.add(current - d);
    window.add(current + d);
  }
  return Array.from(window)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
}

function Pagination({
  current,
  total,
  baseQuery,
}: {
  current: number;
  total: number;
  baseQuery: Record<string, string>;
}) {
  const pages = getPageRange(current, total);
  return (
    <nav
      className="flex items-center gap-1 text-sm"
      aria-label="페이지 이동"
    >
      <PageLink
        href={current > 1 ? buildHref(baseQuery, current - 1) : null}
        label="← 이전"
      />
      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const gap = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && (
              <span className="px-1.5 text-neutral-400" aria-hidden>
                …
              </span>
            )}
            <PageLink
              href={p === current ? null : buildHref(baseQuery, p)}
              label={String(p)}
              active={p === current}
            />
          </span>
        );
      })}
      <PageLink
        href={current < total ? buildHref(baseQuery, current + 1) : null}
        label="다음 →"
      />
    </nav>
  );
}

function PageLink({
  href,
  label,
  active = false,
}: {
  href: string | null;
  label: string;
  active?: boolean;
}) {
  const base =
    "px-2.5 py-1 rounded-md text-xs font-medium tabular-nums transition";
  if (active) {
    return (
      <span
        className={`${base} bg-neutral-900 text-white dark:bg-white dark:text-neutral-900`}
        aria-current="page"
      >
        {label}
      </span>
    );
  }
  if (!href) {
    return (
      <span
        className={`${base} text-neutral-300 dark:text-neutral-600 cursor-not-allowed select-none`}
        aria-disabled
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700`}
    >
      {label}
    </Link>
  );
}

function FilterGroup({
  label,
  current,
  paramKey,
  otherParam,
  options,
}: {
  label: string;
  current: string;
  paramKey: string;
  otherParam: string;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-neutral-500 mr-1.5">{label}</span>
      {options.map((o) => {
        const params = [
          o.key === "ALL" ? "" : `${paramKey}=${o.key}`,
          otherParam,
        ]
          .filter(Boolean)
          .join("&");
        const href = params ? `/admin/articles?${params}` : "/admin/articles";
        const active = current === o.key;
        return (
          <Link
            key={o.key}
            href={href}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
