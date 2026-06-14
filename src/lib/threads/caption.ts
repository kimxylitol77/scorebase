// Instagram Threads caption 빌더 — /api/internal/threads-queue 가 사용.
//
// Threads 텍스트 제한 500자(한글 1자 = 1 char). 링크/해시태그는 항상 보존하고
// 본문(경기 목록 · excerpt)만 남는 예산만큼 절삭한다.

export const THREADS_TEXT_LIMIT = 500;

export interface DailyMatchLine {
  leagueLabel: string;
  home: string;
  away: string;
  time: string; // "HH:mm" (KST) — live 면 사용 안 함
  live?: boolean;
}

const HASHTAGS_DAILY = "#스코어베이스 #오늘의경기 #스포츠 #해외축구 #야구 #농구";
const HASHTAGS_BLOG = "#스코어베이스 #스포츠 #스포츠분석";

function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// 오늘의 주요 경기 종합 caption.
export function buildDailyCaption(
  lines: DailyMatchLine[],
  opts: { dateLabel: string; url: string; totalCount: number; title?: string; hashtags?: string },
): string {
  const header = `${opts.title ?? "⚽️ 오늘의 주요 경기"} (${opts.dateLabel})`;
  const body = lines
    .map(
      (l) =>
        `${l.live ? "🔴 " : ""}[${l.leagueLabel}] ${l.home} vs ${l.away} · ${l.live ? "LIVE" : l.time}`,
    )
    .join("\n");
  const more =
    opts.totalCount > lines.length
      ? `\n…외 ${opts.totalCount - lines.length}경기`
      : "";
  const footer = `\n\n전체 일정·스코어 👉 ${opts.url}\n\n${opts.hashtags ?? HASHTAGS_DAILY}`;

  const fixed = `${header}\n\n`;
  const tail = `${more}${footer}`;
  const budget = THREADS_TEXT_LIMIT - fixed.length - tail.length;
  return `${fixed}${truncate(body, budget)}${tail}`;
}

// 신규 블로그 글 공유 caption.
export function buildBlogCaption(opts: {
  title: string;
  excerpt?: string | null;
  url: string;
}): string {
  const header = `📝 ${opts.title}`;
  const footer = `\n\n자세히 보기 👉 ${opts.url}\n\n${HASHTAGS_BLOG}`;
  const budget = THREADS_TEXT_LIMIT - header.length - footer.length;
  const excerpt = opts.excerpt?.trim()
    ? `\n\n${truncate(opts.excerpt.trim(), budget)}`
    : "";
  return `${header}${excerpt}${footer}`;
}
