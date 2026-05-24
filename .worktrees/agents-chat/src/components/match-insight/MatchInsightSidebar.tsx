/**
 * 매치 인사이트 사이드바 — 메인 컨테이너.
 * 베팅 앱 시각 효과 + 미디어 톤 한국어 카피.
 * 종목별 PitcherMatchup 분기는 sport prop 으로 (현재 baseball 만 구현).
 */

import MatchHeader from "./MatchHeader";
import AiValuePickCard from "./AiValuePickCard";
import ProbBars from "./ProbBars";
import TabSwitcher from "./TabSwitcher";
import PitcherMatchup, { type PitcherStats } from "./PitcherMatchup";
import KpiGrid2 from "./KpiGrid2";
import KeyFactors, { type Factor } from "./KeyFactors";
import ExpandableDetails from "./ExpandableDetails";

export interface MatchInsightProps {
  sport: "baseball" | "soccer" | "basketball" | "esports";
  leagueLabel: string;
  awayTeam: string;
  homeTeam: string;
  meta?: string;
  isLive?: boolean;
  liveText?: string;
  /** "롯데 자이언츠 우세" — AI 가 가리키는 한 쪽 */
  pickLabel: string;
  /** AI 추정 승률 */
  aiProb: number;
  /** 시장 평균 승률 */
  marketProb: number;
  /** 진행률 바 라벨 — 예: "롯데 자이언츠 승" */
  outcomeLabel: string;
  expectedTotal: number;
  ouLine: number;
  aiSide: "OVER" | "UNDER" | "PUSH";
  /** 야구 매치만 — 선발 비교 */
  pitcherAway?: PitcherStats;
  pitcherHome?: PitcherStats;
  factors: Factor[];
  /** 펼침형 분석 요약 (markdown 아닌 plain text 문장들) */
  analysisLines: string[];
}

const TABS = ["분석", "배당", "흐름", "데이터", "이닝별"];

export default function MatchInsightSidebar(props: MatchInsightProps) {
  return (
    <aside
      className="insight-shell space-y-4"
      style={{ maxWidth: 460, width: "100%" }}
    >
      <MatchHeader
        leagueLabel={props.leagueLabel}
        awayTeam={props.awayTeam}
        homeTeam={props.homeTeam}
        meta={props.meta}
        isLive={props.isLive}
        liveText={props.liveText}
      />

      <AiValuePickCard
        pickLabel={props.pickLabel}
        aiProb={props.aiProb}
        marketProb={props.marketProb}
      />

      <ProbBars
        aiProb={props.aiProb}
        marketProb={props.marketProb}
        outcomeLabel={props.outcomeLabel}
      />

      <TabSwitcher tabs={TABS} />

      {props.sport === "baseball" && props.pitcherAway && props.pitcherHome && (
        <PitcherMatchup
          away={props.pitcherAway}
          home={props.pitcherHome}
          awayTeam={props.awayTeam}
          homeTeam={props.homeTeam}
        />
      )}

      <KpiGrid2
        expectedTotal={props.expectedTotal}
        ouLine={props.ouLine}
        aiSide={props.aiSide}
      />

      <KeyFactors factors={props.factors} />

      <ExpandableDetails defaultOpen>
        {props.analysisLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </ExpandableDetails>

      <p className="text-[10px] text-[var(--insight-text-3)] leading-relaxed relative z-10">
        ⓘ Scorebase 의 모든 수치는 통계 모델과 외부 odds 평균을 정보 제공
        목적으로 정리한 추정치입니다. 실제 결과는 다를 수 있으며, 베팅 권유가
        아닙니다.
      </p>
    </aside>
  );
}
