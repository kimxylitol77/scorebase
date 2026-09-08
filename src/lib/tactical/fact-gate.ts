// 전술 리뷰 자동 발행 전 결정적 숫자 대조 — 본문의 시간(분)·퍼센트·스코어·제목 표기가 데이터 텍스트 안의 값인지 확인한다.
// LLM 이 홈/원정을 뒤바꾸거나 없는 시간·퍼센트를 지어내는 사고(2026-09-05 #4600 실측)를 자동 발행에서 걸러내기 위한 것.
// 통과 = null, 탈락 = 사유 문자열. 탈락 글은 버리지 않고 DRAFT 로 남긴다.

export interface FactGateInput {
  /** 후처리(링크·토큰) 전후 무관 — 숫자만 본다. */
  content: string;
  /** buildTacticalContext 가 프롬프트에 넣은 데이터 텍스트. */
  dataText: string;
  homeScore: number;
  awayScore: number;
}

/** 데이터 텍스트의 타임라인 "83'"·"90+1'" 과 출전시간 "(14분)" 에서 허용 분 집합을 만든다. */
function allowedMinutes(dataText: string): Set<number> {
  const set = new Set<number>([45, 90]);
  const add = (m: number) => {
    set.add(m);
    if (m > 45) set.add(m - 45); // "후반 38분" 식 환산 표기 허용
  };
  for (const m of dataText.matchAll(/(\d{1,3})(?:\+(\d{1,2}))?'/g)) {
    add(Number(m[1]));
    if (m[2]) {
      set.add(Number(m[2])); // 추가시간 자체("추가시간 1분")
      add(Number(m[1]) + Number(m[2]));
    }
  }
  for (const m of dataText.matchAll(/\((\d{1,3})분\)/g)) set.add(Number(m[1]));
  return set;
}

export function tacticalFactGateReason(i: FactGateInput): string | null {
  const title = i.content.split("\n").find((l) => l.startsWith("# ")) ?? "";
  // 제목 영문 — "Arsenal" 류 누출. FC·HD·VAR·PK 같은 3자 이하 약어는 허용.
  const en = title.match(/[A-Za-z]{4,}/);
  if (en) return `제목에 영문 표기 "${en[0]}"`;

  // 스코어 — 실제 결과가 본문에 한 번은 있어야 한다("1-0"·"1:0"·"1대0"). 순서는 양쪽 허용 —
  // 원정 승을 "3-0 승리"로 쓰는 게 자연스러워 홈 기준만 받으면 정상 글이 탈락한다(2026-09-09 강원 원정 0-3 실측).
  const sc = (a: number, b: number) => new RegExp(`(^|[^\\d-])${a}\\s*[-:대]\\s*${b}(?![\\d-])`, "m");
  if (!sc(i.homeScore, i.awayScore).test(i.content) && !sc(i.awayScore, i.homeScore).test(i.content))
    return `본문에 실제 스코어 ${i.homeScore}-${i.awayScore} 없음`;

  // 시간 — 본문의 "N분"·"N'"·"전반/후반 N분" 은 타임라인·출전시간 집합 안이어야 한다. 기간 표현(N분간·N분 동안)은 제외.
  const allowed = allowedMinutes(i.dataText);
  const body = i.content.replace(/^#.*$/m, "");
  for (const m of body.matchAll(/(전반|후반)?\s*(\d{1,3})(?:\+(\d{1,2}))?\s*(분|')(?!간|\s*동안|\s*가량|\s*이상|\s*이내|\s*넘)/g)) {
    const half = m[1];
    const base = Number(m[2]);
    const abs = half === "후반" && base <= 45 ? base + 45 : base;
    const ok = allowed.has(abs) || allowed.has(base) || (m[3] != null && allowed.has(abs + Number(m[3])));
    if (!ok) return `데이터에 없는 시간 "${m[0].trim()}"`;
  }

  // 퍼센트 — 본문의 N% 는 데이터 텍스트에 그대로 있어야 한다(점유율 스왑·창작 차단).
  for (const m of body.matchAll(/(\d{1,3})\s*%/g)) {
    if (!i.dataText.includes(`${m[1]}%`)) return `데이터에 없는 퍼센트 "${m[0]}"`;
  }
  return null;
}
