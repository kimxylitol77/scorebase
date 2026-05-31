// 분석 게시판 시각 표시 — 서버 region(sin1=UTC+8) 영향 없이 KST(UTC+9) 고정 포맷.

function kstParts(d: Date) {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: k.getUTCFullYear(),
    mo: k.getUTCMonth() + 1,
    da: k.getUTCDate(),
    h: k.getUTCHours(),
    mi: k.getUTCMinutes(),
    dow: k.getUTCDay(),
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 목록 등록일: 오늘이면 HH:MM, 아니면 MM/DD. */
export function listTime(d: Date): string {
  const a = kstParts(d);
  const b = kstParts(new Date());
  if (a.y === b.y && a.mo === b.mo && a.da === b.da) return `${p2(a.h)}:${p2(a.mi)}`;
  return `${p2(a.mo)}/${p2(a.da)}`;
}

/** 경기 시각: M/D HH:MM. */
export function kickoffLabel(d: Date): string {
  const a = kstParts(d);
  return `${a.mo}/${a.da} ${p2(a.h)}:${p2(a.mi)}`;
}

/** 날짜 그룹 키 (정렬용): YYYY-MM-DD (KST). */
export function kstDateKey(d: Date): string {
  const a = kstParts(d);
  return `${a.y}-${p2(a.mo)}-${p2(a.da)}`;
}

/** 날짜 칩 라벨: "5/30(금)". */
export function kstDateLabel(d: Date): string {
  const a = kstParts(d);
  return `${a.mo}/${a.da}(${WEEK[a.dow]})`;
}

/** 경기 시각만: "18:30". */
export function kstTimeLabel(d: Date): string {
  const a = kstParts(d);
  return `${p2(a.h)}:${p2(a.mi)}`;
}

/** 적중률(%) — 정수 반올림. 예측 0건이면 0. */
export function hitRate(hit: number, total: number): number {
  return total > 0 ? Math.round((hit / total) * 100) : 0;
}
