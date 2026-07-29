// 선발 매치업 카드 → 게시판 글 프리필 본문 조립 (/community/new?starter={matchId}).
// 수치는 클라이언트가 보낸 값이 아니라 matchId 로 DB 재조회한 실측만 쓴다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { parseStarter, fmtStat } from "@/lib/predict/starter-card";

/** /predictions/starters "게시판에 올리기" 프리필 — 카드 이미지 + 지표 표 + AI 승률 + 카드 링크. */
export async function buildStarterShareText(
  matchId: number,
): Promise<{ title: string; content: string } | null> {
  const m = await prisma.match
    .findUnique({
      where: { id: matchId },
      select: {
        id: true,
        league: true,
        startTime: true,
        predHome: true,
        predAway: true,
        homeStarter: true,
        awayStarter: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    })
    .catch(() => null);
  if (!m) return null;

  const hs = parseStarter(m.homeStarter);
  const as = parseStarter(m.awayStarter);
  const homeTeam = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name;
  const awayTeam = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name;
  const hName = hs?.name || homeTeam;
  const aName = as?.name || awayTeam;

  const k = new Date(m.startTime.getTime() + 9 * 3600_000);
  const when = `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;

  const rows: Array<[string, number | undefined, number | undefined, number]> = [
    ["ERA", hs?.era, as?.era, 2],
    ["WHIP", hs?.whip, as?.whip, 2],
    ["K/9", hs?.k9, as?.k9, 1],
    ["최근 3등판 ERA", hs?.recentEra, as?.recentEra, 2],
  ];
  const statRows = rows
    .filter(([, h, a]) => h != null || a != null)
    .map(([label, h, a, d]) => `| ${label} | ${fmtStat(h, d)} | ${fmtStat(a, d)} |`);

  const lines: string[] = [
    `![선발 매치업 카드](/api/og/starter-card?m=${m.id})`,
    "",
    `**${m.league} · ${when} KST** — ${homeTeam} vs ${awayTeam}`,
    "",
  ];
  if (statRows.length > 0) {
    lines.push(`| 지표 | ${hName} | ${aName} |`, "| --- | --- | --- |", ...statRows, "");
  }
  if (m.predHome != null && m.predAway != null) {
    lines.push(
      `AI 승률 — ${homeTeam} ${Math.round(m.predHome * 100)}% : ${awayTeam} ${Math.round(m.predAway * 100)}%`,
      "",
    );
  }
  lines.push(
    "통계 모델 기반 참고용 정보이며, 과거 성적이 미래 결과를 보장하지 않습니다.",
    "",
    `카드 원본 → https://www.scorebase.kr/predictions/starters/${m.id}`,
  );

  return { title: `[선발 매치업] ${hName} vs ${aName}`, content: lines.join("\n") };
}
