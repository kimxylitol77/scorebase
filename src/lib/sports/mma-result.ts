// UFC 승리 방법 라벨 — 카드(MatchCard)와 스코어보드 표(서버 렌더)가 함께 쓰는 순수 함수.
// MatchCard 는 클라이언트 경계 안이라 서버 컴포넌트에서 그 파일의 함수를 부를 수 없어 여기로 뺐다.

export interface MmaResult {
  method: string | null;
  round: number | null;
  clock: string | null;
}

// UFC 승리 방법 한글 (ESPN result.displayName → 한글).
const MMA_METHOD_KO: Record<string, string> = {
  "KO/TKO": "KO/TKO",
  Submission: "서브미션",
  "Decision - Unanimous": "판정 (만장)",
  "Decision - Split": "판정 (분할)",
  "Decision - Majority": "판정 (다수)",
  Decision: "판정",
};

// "1R · KO/TKO" (피니시) / "판정 (만장)" (판정엔 라운드 생략 — 풀라운드).
// "Submission (Rear Naked Choke)" 처럼 세부가 붙어 오는 값은 앞부분으로 한글화한다.
export function mmaResultLabel(r: MmaResult): string | null {
  if (!r.method) return null;
  const base = r.method.replace(/\s*\(.*\)$/, "");
  const ko = MMA_METHOD_KO[r.method] ?? MMA_METHOD_KO[base] ?? r.method;
  return r.method.startsWith("Decision") ? ko : r.round ? `${r.round}R · ${ko}` : ko;
}
