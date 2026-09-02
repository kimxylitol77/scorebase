// Instagram Threads caption 빌더 — /api/internal/threads-queue 가 사용.
//
// Threads 텍스트 제한 500자(한글 1자 = 1 char). 링크/해시태그는 항상 보존하고
// 본문(경기 목록 · excerpt)만 남는 예산만큼 절삭한다.

import type { ThreadsFeature } from "./features";

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

// 월드컵 '오늘의 베스트 XI' SNS caption (인스타·스레드 공용).
export function buildTeamOfDayCaption(opts: {
  dateLabel: string;
  url: string;
  mvpName: string;
  mvpCountry: string;
  mvpRating: number;
  results: { homeKo: string; awayKo: string; homeScore: number | null; awayScore: number | null }[];
}): string {
  const header = `⚽️ ${opts.dateLabel} 월드컵 베스트 11`;
  const mvp = `🥇 MVP ${opts.mvpName} (${opts.mvpCountry}) · 평점 ${opts.mvpRating.toFixed(1)}`;
  const hashtags = "#스코어베이스 #월드컵 #베스트11 #2026월드컵 #축구 #국가대표";
  const footer = `\n\n전체 라인업·평점 분석 👉 ${opts.url}\n\n${hashtags}`;
  const fixed = `${header}\n\n${mvp}\n\n📋 결과\n`;
  const budget = THREADS_TEXT_LIMIT - fixed.length - footer.length;
  const body = opts.results
    .map((m) => `· ${m.homeKo} ${m.homeScore ?? "-"}-${m.awayScore ?? "-"} ${m.awayKo}`)
    .join("\n");
  return `${fixed}${truncate(body, budget)}${footer}`;
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

// 경기 프리뷰 수치카드 caption (매일 1건). preview-card.ts 의 PreviewCard 를 그대로 받는다.
// 카드 이미지가 수치를 이미 보여주므로 텍스트는 반복하지 않고 "왜 볼 만한가"만 남긴다.
export function buildPreviewCaption(
  c: {
    leagueLabel: string;
    home: string;
    away: string;
    kickoffKst: string;
    stats: { label: string; value: string; note: string; hot?: boolean }[];
    verdict: string;
  },
  opts: { url: string },
): string {
  // 스레드체 (2026-09-02 리서치 반영): 한 호흡 = 한 줄 세로 나열 + 초간결 숫자 + 질문 마무리.
  // 문어체 광고문·해시태그 다발은 스킵당한다. 인기 게시물(좋아요 5.8천)의 형식을 따른다.
  const hot = c.stats.find((s) => s.hot);
  const head = [`${c.home} vs ${c.away}`, `${c.leagueLabel} 오늘 ${c.kickoffKst}`].join("\n");
  const nums = c.stats
    .slice(0, 3)
    .map((s) => `${s.label} ${s.value}`)
    .join("\n");
  const pick = hot ? `AI 픽은 ${hot.value}` : c.verdict;
  const ask = "여러분 픽은? 댓글로 👇";
  const footer = `\n\n${opts.url}\n#스코어베이스 #AI픽`;
  const fixed = `${head}\n\n`;
  const tail = `\n\n${pick}\n${ask}${footer}`;
  const budget = THREADS_TEXT_LIMIT - fixed.length - tail.length;
  return `${fixed}${truncate(nums, budget)}${tail}`;
}

// scorebase 기능 소개 caption (매일 1개 로테이션). features.ts 데이터 사용.
// 스레드체 (2026-09-02 리서치 반영): ✅ 체크리스트 광고문 폐기 — 훅 + 짧은 줄 나열 + 저자세 CTA.
// 해시태그는 2개로 축소 (인기 게시물은 해시태그가 거의 없다).
export function buildFeatureCaption(f: ThreadsFeature, opts: { url: string }): string {
  const header = f.hook;
  const points = f.points.map((p) => p).join("\n");
  const tag = f.hashtags.split(" ").slice(0, 2).join(" ");
  const footer = `무료입니다. 써보고 별로면 말아요\n${opts.url}\n\n${tag}`;
  const body = `${header}\n\n${points}\n\n${footer}`;
  return truncate(body, THREADS_TEXT_LIMIT);
}
