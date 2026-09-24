// api-football 순위표의 조 이름을 화면용 한글 라벨로 바꾼다.
//
// af 는 조 이름에 대회명을 접두로 붙이고 쉼표로 이어 붙인다. 쉼표 앞에 공백이 오기도 한다.
//   "UEFA Nations League , League A, Group 1"  → "리그 A · 1조"
//   "Group A"                                   → "A조"
//   "Regular Season - 1"                        → "Regular Season - 1" (그대로)
//
// 대회명 접두는 사전 없이 뗀다 — "해석되는 조각이 하나라도 있으면 그것만 남긴다".
// 리그별 영문명 사전을 받아오면 사전이 비어 있는 대회에서 접두가 그대로 남는데,
// 이 방식은 사전 없이도 League/Group 조각만 골라내므로 새 대회에 그대로 쓸 수 있다.
// 하나도 해석이 안 되면 원문을 그대로 돌려준다 — 모르는 형식을 억지로 깎으면
// 서로 다른 조가 같은 라벨로 합쳐져 표가 통째로 섞인다.

/** "League A" → "리그 A" · "Group 1" → "1조" · "Group A" → "A조". 못 알아보면 null. */
function segmentToKo(seg: string): string | null {
  const league = seg.match(/^League\s+([A-Za-z])$/);
  if (league) return `리그 ${league[1].toUpperCase()}`;
  const groupNum = seg.match(/^Group\s+(\d+)$/i);
  if (groupNum) return `${groupNum[1]}조`;
  const groupLetter = seg.match(/^Group\s+([A-Za-z])$/);
  if (groupLetter) return `${groupLetter[1].toUpperCase()}조`;
  return null;
}

/** af group 문자열 → 화면 라벨. */
export function afGroupLabel(group: string): string {
  const raw = (group ?? "").trim();
  if (!raw) return "";
  const segs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed = segs.map((s) => ({ seg: s, ko: segmentToKo(s) }));
  const known = parsed.filter((p) => p.ko !== null);
  // 해석되는 조각이 있으면 그것만 — 대회명 접두가 이렇게 떨어져 나간다.
  if (known.length > 0) return known.map((p) => p.ko!).join(" · ");
  return segs.join(" · ");
}
