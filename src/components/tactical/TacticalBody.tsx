// 전술 글 본문 — 마크다운 사이의 도식 토큰({{tactical-…}}) 자리에 도식을 그린다. 글 페이지와 관리자 초안 미리보기가 함께 쓴다.
// 도식 데이터는 렌더 시점에 ts 캐시에서 만든다. 데이터가 없는 토큰은 아무것도 그리지 않는다(빈 자리 없이 본문이 이어진다).
import Markdown from "@/components/Markdown";
import { buildTsEnrichment, TACTICAL_TOKEN_RE, type TsEnrichment } from "@/lib/tactical/ts-enrich";
import TacticalShapeFigure from "./TacticalShapeFigure";
import TacticalStyleBars from "./TacticalStyleBars";
import TacticalMomentum from "./TacticalMomentum";
import TacticalGoalFigure from "./TacticalGoalFigure";

interface Props {
  content: string;
  /** 경기가 연결된 축구 전술 글일 때만 넘긴다 — 없으면 토큰을 지우고 본문만 그린다. */
  match: { id: number; home: string; away: string } | null;
}

function figureOf(token: string, key: string, en: TsEnrichment, home: string, away: string) {
  if (token.startsWith("shape:")) {
    const fig = en.shapes.find((f) => f.side === token.slice(6));
    return fig ? <TacticalShapeFigure key={key} fig={fig} /> : null;
  }
  const ins = en.insights;
  if (token === "style") return ins.style ? <TacticalStyleBars key={key} home={home} away={away} style={ins.style} /> : null;
  if (token === "momentum") return ins.momentum ? <TacticalMomentum key={key} home={home} away={away} m={ins.momentum} goals={ins.goals} /> : null;
  if (token.startsWith("goal:")) {
    const g = ins.goals.find((x) => x.number === Number(token.slice(5)));
    return g ? <TacticalGoalFigure key={key} goal={g} team={g.side === "home" ? home : away} names={en.names} /> : null;
  }
  return null;
}

export default async function TacticalBody({ content, match }: Props) {
  const en = match ? await buildTsEnrichment(match.id, match.home, match.away) : null;
  // split 의 캡처 그룹이 "shape:home"·"style"·"goal:3" 같은 문자열로 홀수 번째에 끼어 들어온다.
  const parts = content.split(TACTICAL_TOKEN_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) return en && match ? figureOf(part, `fig-${i}`, en, match.home, match.away) : null;
        return part.trim() ? <Markdown key={`md-${i}`}>{part}</Markdown> : null;
      })}
    </>
  );
}
