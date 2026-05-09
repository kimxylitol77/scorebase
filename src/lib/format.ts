// 한국어 표기에 맞는 시간/날짜 포맷 헬퍼.

/**
 * 상대 시간 ("3시간 전", "어제", "5월 3일")
 */
export function formatRelativeKo(d: Date | string | number): string {
  const date = new Date(d);
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;

  if (diff < 60) return "방금 전";
  if (diff < 60 * 60) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 60 * 60 * 24) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 60 * 60 * 24 * 2) return "어제";
  if (diff < 60 * 60 * 24 * 7) return `${Math.floor(diff / 86400)}일 전`;

  // 7일 이상이면 "월/일"
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
}

/**
 * 풀 날짜 ("2026년 5월 3일")
 */
export function formatDateKo(d: Date | string | number): string {
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * 짧은 날짜 ("5/3")
 */
export function formatShortDate(d: Date | string | number): string {
  const date = new Date(d);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
