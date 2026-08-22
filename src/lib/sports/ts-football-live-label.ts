// TheSports 축구 detailLive.score → "전반 38'" 류 진행분 라벨. /scores 행·방송 오버레이 API 공용.
// status_id: 2=전반 3=HT 4=후반 5/6=연장 7=승부차기 (football-collector mapFootballStatus 와 동일 코드표).
// phaseStartTs 는 현재 페이즈 시작 시각(초)이라 후반이면 45 + 경과분으로 합산 표기가 된다.
export function tsFootballLiveLabel(
  statusId: number,
  phaseStartTs: number,
  nowMs: number,
): string | null {
  // HT(3)·승부차기(7)는 경과분이 필요 없는 정적 라벨 — 이때 ts 는 phase ts 를 0 으로 준다
  // (맨유-PSG HT 실측). 시각 검사를 여기서 하지 않으면 하프타임 내내 라벨이 사라진다.
  if (statusId === 3) return "HT";
  if (statusId === 7) return "승부차기";
  if (!(phaseStartTs > 0)) return null;
  const elapsed = Math.max(0, Math.floor((nowMs / 1000 - phaseStartTs) / 60)) + 1;
  switch (statusId) {
    case 2:
      return `전반 ${Math.min(elapsed, 45)}${elapsed > 45 ? "+" : ""}'`;
    case 4: {
      const total = 45 + elapsed;
      return `후반 ${Math.min(total, 90)}${total > 90 ? "+" : ""}'`;
    }
    case 5:
    case 6: {
      const total = 90 + elapsed;
      return `연장 ${Math.min(total, 120)}${total > 120 ? "+" : ""}'`;
    }
    default:
      return null;
  }
}

/** detailLive.score 배열에서 (status_id, 페이즈 시작 ts) 추출. 없으면 null */
export function tsFootballLiveState(detailLive: unknown): { sid: number; pts: number } | null {
  const dl = detailLive as { score?: unknown[] } | null;
  const sc = dl?.score;
  if (!Array.isArray(sc)) return null;
  const sid = Number(sc[1]);
  const pts = Number(sc[4]);
  return Number.isFinite(sid) ? { sid, pts: Number.isFinite(pts) ? pts : 0 } : null;
}
