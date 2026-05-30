// 분석 게시판 시각 표시 — 서버 region(sin1=UTC+8) 영향 없이 KST(UTC+9) 고정 포맷.

function kstParts(d: Date) {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: k.getUTCFullYear(),
    mo: k.getUTCMonth() + 1,
    da: k.getUTCDate(),
    h: k.getUTCHours(),
    mi: k.getUTCMinutes(),
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

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
