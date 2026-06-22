// 드림팀 경기 중계 — 결과 기반 한 줄 멘트 (규칙 템플릿, AI 호출 없이 즉시 생성)
import type { MatchSimResult } from "./simulate";

export function matchCommentary(r: MatchSimResult, myName: string, oppName: string): string {
  const diff = r.myScore - r.oppScore;
  const total = r.myScore + r.oppScore;

  if (r.outcome === "win") {
    if (diff >= 3) return `${myName}의 완승. ${r.myScore}-${r.oppScore}로 ${oppName}을(를) 압도했다.`;
    if (diff === 1) return `${myName}, 접전 끝에 ${oppName}을(를) ${r.myScore}-${r.oppScore}로 눌렀다.`;
    return `${myName}이(가) ${oppName}을(를) ${r.myScore}-${r.oppScore}로 잡았다.`;
  }
  if (r.outcome === "loss") {
    if (diff <= -3) return `${oppName}에 ${r.myScore}-${r.oppScore} 대패. 전력 차를 절감한 경기.`;
    return `${myName}, ${oppName}에 ${r.myScore}-${r.oppScore}로 아쉽게 무너졌다.`;
  }
  if (total === 0) return `${myName}과(와) ${oppName}, 득점 없이 0-0 무승부.`;
  return `${myName}과(와) ${oppName}, ${r.myScore}-${r.oppScore} 난타전 끝에 무승부.`;
}
