// 부상 사유 영문→한글 번역 + 심각도 분류. /injuries 페이지와 예상 라인업(부상 명단)이 공유.
// api-football / BALLDONTLIE / MLB·NHL status 문자열을 한국어 라벨과 색 구분으로 정규화한다.

// ===== 사유 한글 번역 =====
// 정확 매치 우선 → 부분 매치(긴 키부터) → 한글 포함 시 원본 → "사유 미공개" fallback
export const REASON_KO: Record<string, string> = {
  // 부위 (단어 단위)
  Hamstring: "햄스트링",
  Knee: "무릎",
  Ankle: "발목",
  Foot: "발",
  Calf: "종아리",
  Thigh: "허벅지",
  Groin: "사타구니",
  Back: "허리",
  Shoulder: "어깨",
  Wrist: "손목",
  Hand: "손",
  Hip: "고관절",
  Concussion: "뇌진탕",
  Achilles: "아킬레스",
  Illness: "질병",
  Sick: "질병",
  Muscle: "근육",
  Toe: "발가락",
  // "{부위} Injury" 형식 (api-football 최근 응답)
  "Knee Injury": "무릎",
  "Hamstring Injury": "햄스트링",
  "Ankle Injury": "발목",
  "Ankle/Foot Injury": "발목",
  "Muscle Injury": "근육",
  "Thigh Injury": "허벅지",
  "Calf Injury": "종아리",
  "Groin Injury": "사타구니",
  "Shoulder Injury": "어깨",
  "Hip Injury": "고관절",
  "Back Injury": "허리",
  "Foot Injury": "발",
  "Leg Injury": "다리",
  "Toe Injury": "발가락",
  "Wrist Injury": "손목",
  // 골절·심각한 부상
  "Broken Bone": "골절",
  "Broken Leg": "다리 골절",
  "Broken collarbone": "쇄골 골절",
  Fracture: "골절",
  Hernia: "탈장",
  Wound: "외상",
  Bruise: "타박상",
  Contusion: "타박상",
  Knock: "타박상",
  "Cardiac problems": "심장 문제",
  ACL: "전방 십자인대",
  Ligament: "인대",
  // 결장 사유 (부상 외)
  Suspended: "출장 정지",
  "Yellow Cards": "경고 누적",
  "Red Card": "퇴장 누적",
  "Red Cards": "퇴장 누적",
  Inactive: "미출전 명단 제외",
  "International duty": "국가대표 차출",
  "Loan agreement": "임대 이적",
  "Coach's decision": "감독 결정",
  "Coach Decision": "감독 결정",
  "Coachs decision": "감독 결정",
  "Personal reasons": "개인 사정",
  Personal: "개인 사정",
  Doubtful: "출전 불투명",
  Rest: "휴식",
  Fitness: "컨디션",
  // 일반
  Injury: "부상",
  injured: "부상",
  Injured: "부상",
  // BALLDONTLIE NBA/NHL status
  Out: "결장",
  "Day-To-Day": "당일 결정",
  "Day To Day": "당일 결정",
  "Day-To-Day - Limited": "당일 결정 (제한)",
  "Game Time Decision": "출전 미정",
  Probable: "출전 유력",
  Questionable: "출전 불투명",
  "Out For Season": "시즌 아웃",
  "Out For The Season": "시즌 아웃",
  "Injured Reserve": "부상자 명단",
  IR: "부상자 명단",
  Available: "출전 가능",
  Undisclosed: "사유 미공개",
  // BALLDONTLIE MLB status
  "60-Day-IL": "60일 부상자 명단",
  "15-Day-IL": "15일 부상자 명단",
  "10-Day-IL": "10일 부상자 명단",
  "7-Day-IL": "7일 부상자 명단",
  "Day-to-Day": "당일 결정",
  "Bereavement List": "사망 휴가",
  "Paternity Leave": "출산 휴가",
  "Restricted List": "제한 명단",
  "Suspended List": "출장 정지 명단",
  // MLB type + detail 결합 (side+type+detail = "Right Wrist Fracture")
  Forearm: "팔뚝",
  Elbow: "팔꿈치",
  Biceps: "이두근",
  Triceps: "삼두근",
  Pectoral: "흉근",
  Oblique: "복사근",
  Abdominal: "복부",
  Lat: "광배근",
  Quad: "대퇴사두근",
  Quadriceps: "대퇴사두근",
  Achilles_: "아킬레스",
  Heel: "뒤꿈치",
  Finger: "손가락",
  Lumbar: "요추",
  Cervical: "경추",
  Neck: "목",
  Head: "머리",
  Face: "얼굴",
  // MLB detail (type 뒤)
  Inflammation: "염증",
  Soreness: "통증",
  Tendinitis: "건염",
  Tendinopathy: "건병증",
  Tear: "파열",
  Right: "오른쪽",
  Left: "왼쪽",
  // NHL injury_type
  Upper: "상체",
  Lower: "하체",
  Strain: "근육 파열",
  Sprain: "염좌",
  Cramp: "쥐",
  Surgery: "수술",
  Rehab: "재활",
  other: "사유 미공개",
  Other: "사유 미공개",
};

export function translateReason(en: string): string {
  if (!en) return "사유 미공개";
  const trimmed = en.trim();
  if (!trimmed) return "사유 미공개";
  // 1) 정확 매치
  if (REASON_KO[trimmed]) return REASON_KO[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(REASON_KO)) {
    if (k.toLowerCase() === lower) return v;
  }
  // 2) 부분 매치 (긴 키부터 시도)
  const keys = Object.keys(REASON_KO).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (lower.includes(k.toLowerCase())) return REASON_KO[k];
  }
  // 3) 한글 포함 → 이미 번역됨
  if (/[가-힣]/.test(trimmed)) return trimmed;
  // 4) fallback
  console.warn(`[translateReason] Unknown reason: "${en}"`);
  return "사유 미공개";
}

// ===== 심각도 분류 =====
export type Severity = "long" | "short" | "returning" | "non_injury" | "unknown";

export const SEVERITY_META: Record<
  Severity,
  { label: string; icon: string; color: string; bgClass: string }
> = {
  long: {
    label: "장기 결장",
    icon: "🔴",
    color: "#ef4444",
    bgClass: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  },
  short: {
    label: "단기 결장",
    icon: "🟡",
    color: "#f59e0b",
    bgClass:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  },
  returning: {
    label: "회복 임박",
    icon: "🟢",
    color: "#10b981",
    bgClass:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  non_injury: {
    label: "부상 외",
    icon: "⚠️",
    color: "#6b7280",
    bgClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  unknown: {
    label: "사유 미공개",
    icon: "❓",
    color: "#4b5563",
    bgClass:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

export function classifySeverity(reasonEn: string): Severity {
  const r = (reasonEn ?? "").toLowerCase();
  if (
    /broken leg|broken collarbone|achilles|acl|hernia|fracture|surgery|ligament|십자인대|골절/.test(
      r,
    )
  )
    return "long";
  if (
    /knee|hamstring|muscle|ankle|thigh|calf|groin|knock|back|shoulder|foot|hip|wrist|hand|toe|strain|sprain/.test(
      r,
    )
  )
    return "short";
  if (/fitness|illness|sick|concussion|cramp|rest|rehab/.test(r))
    return "returning";
  if (
    /yellow cards|red card|suspended|international duty|loan agreement|inactive|coach.*decision|personal|doubtful/.test(
      r,
    )
  )
    return "non_injury";
  if (/wound|other|^$/.test(r) || !r) return "unknown";
  // 매핑에 없는 키워드 → 일단 short 로 보수적 분류
  return "short";
}
