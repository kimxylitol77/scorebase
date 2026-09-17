// 승부예측 채점 결과 다이제스트 문안 — 순수함수. 발송(dispatch-telegram-alerts)과 분리해 테스트한다.
import { MARKET_LABEL, pickLabel, type VoteMarket } from "@/lib/vote-markets";

export interface DigestVote {
  league: string;
  home: string;
  away: string;
  market: VoteMarket;
  pick: string;
  line: number | null;
  correct: boolean;
}

export interface DigestInput {
  votes: DigestVote[];
  /** 누적(전체 채점) */
  totalAll: number;
  hitAll: number;
  /** 투표 랭킹 순위 — 채점 3표 미만이면 null */
  rankAll: number | null;
  rankedCount: number;
  rankMonth: number | null;
  siteUrl: string;
  leagueLabel: (league: string) => string;
  esc: (s: string) => string;
}

export function buildVoteDigest(d: DigestInput): string {
  const hit = d.votes.filter((v) => v.correct).length;
  const lines = d.votes.slice(0, 8).map((v) => {
    const mine = pickLabel(v.market, v.pick, v.home, v.away, v.line);
    return `${v.correct ? "✅" : "❌"} ${d.esc(d.leagueLabel(v.league))} ${d.esc(v.home)} vs ${d.esc(v.away)} — ${MARKET_LABEL[v.market]} ${d.esc(mine)}`;
  });
  const more = d.votes.length > lines.length ? `\n외 ${d.votes.length - lines.length}표` : "";
  const cum = d.totalAll > 0 ? ` (누적 ${d.hitAll}/${d.totalAll} · ${Math.round((d.hitAll / d.totalAll) * 100)}%)` : "";
  const rank =
    d.rankAll != null
      ? `\n🏆 투표 랭킹 전체 ${d.rankAll}위 / ${d.rankedCount}명${d.rankMonth != null ? ` · 이번 달 ${d.rankMonth}위` : ""}`
      : `\n채점 3표부터 투표 랭킹에 오릅니다.`;
  return (
    `🎯 <b>승부예측 채점 결과</b>\n` +
    `이번 채점 ${d.votes.length}표 중 <b>${hit}표 적중</b>${cum}\n\n` +
    `${lines.join("\n")}${more}` +
    `${rank}\n\n▶ ${d.siteUrl}/experts?tab=votes`
  );
}
