// LoL RECAP 본문 + 카드 통합 렌더.
// 본문(Markdown)을 H2 단위로 split → 카드와 카드 사이에 단락 끼움.
// 사용자 사양 순서:
//   ## 종합           → QuoteOfMatch 카드 다음
//   ## 게임 1 분석     → GameCard(1) 다음
//   ## 게임 2 분석     → GameCard(2) 다음
//   ## 시즌 함의       → SeasonContextCard 다음
//   ## 관전 포인트     → NextMatchTeaser 직전

import Markdown from "@/components/Markdown";
import QuoteOfMatch from "./QuoteOfMatch";
import GameCard from "./GameCard";
import SeasonContextCard from "./SeasonContextCard";
import NextMatchTeaser from "./NextMatchTeaser";
import type { LolRecapContext } from "@/lib/sports/lol-recap-context";

interface Props {
  content: string;
  ctx: LolRecapContext;
}

interface ParagraphMap {
  intro?: string;
  game1?: string;
  game2?: string;
  season?: string;
  outlook?: string;
}

/** Markdown 본문을 H2 단위로 split. 헤더는 키로 매핑, 내용만 추출. */
function splitByHeading(md: string): ParagraphMap {
  const lines = md.split("\n");
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  const out: ParagraphMap = {};
  for (const s of sections) {
    const body = s.body.join("\n").trim();
    if (!body) continue;
    if (/종합|개요|총평/.test(s.heading)) out.intro = body;
    else if (/게임\s*1/.test(s.heading)) out.game1 = body;
    else if (/게임\s*2/.test(s.heading)) out.game2 = body;
    else if (/시즌\s*함의|시즌\s*위치/.test(s.heading)) out.season = body;
    else if (/관전|다음/.test(s.heading)) out.outlook = body;
  }
  return out;
}

function ParaSection({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  if (!body) return null;
  return (
    <section className="my-5">
      <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-2.5">
        {title}
      </h2>
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <Markdown>{body}</Markdown>
      </div>
    </section>
  );
}

export default function LolRecapBody({ content, ctx }: Props) {
  const p = splitByHeading(content);
  const game1 = ctx.games[0];
  const game2 = ctx.games[1];

  return (
    <div>
      <QuoteOfMatch emoji={ctx.quote.emoji} body={ctx.quote.body} />
      <ParaSection title="종합" body={p.intro} />

      {game1 && (
        <>
          <GameCard
            game={game1}
            team1NameKo={ctx.match.team1NameKo}
            team2NameKo={ctx.match.team2NameKo}
          />
          <ParaSection title="게임 1 분석" body={p.game1} />
        </>
      )}

      {game2 && (
        <>
          <GameCard
            game={game2}
            team1NameKo={ctx.match.team1NameKo}
            team2NameKo={ctx.match.team2NameKo}
          />
          <ParaSection title="게임 2 분석" body={p.game2} />
        </>
      )}

      <SeasonContextCard
        team1NameKo={ctx.match.team1NameKo}
        team2NameKo={ctx.match.team2NameKo}
        team1={ctx.seasonContext.team1}
        team2={ctx.seasonContext.team2}
        starPlayersInMatch={ctx.starPlayersInMatch}
      />
      <ParaSection title="시즌 함의" body={p.season} />

      <ParaSection title="관전 포인트" body={p.outlook} />
      <NextMatchTeaser
        team1NameKo={ctx.match.team1NameKo}
        team2NameKo={ctx.match.team2NameKo}
        team1Next={ctx.nextMatch.team1}
        team2Next={ctx.nextMatch.team2}
      />
    </div>
  );
}
