// 배당 급변 알림 — 최근 윈도우 안에서 배당이 크게 움직인 예정 경기를 텔레그램으로.
// "시장이 방금 움직였다"는 /odds 페이지의 실시간성 레버. 기본 OFF (ODDS_ALERT_ENABLED=1 로 활성).
// 윈도우 내 변화만 보므로 같은 경기가 계속 움직일 때만 반복 알림 — 별도 dedup 저장 불필요.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendTelegram } from "@/lib/notify/telegram";
import { toKoreanTeamName } from "@/lib/team-names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 최근 N분 윈도우 안에서의 변화율 임계 — 프리매치 배당이 짧은 시간에 이만큼 움직이면 유의미.
// 윈도우 150분 = fetch-odds cron(2h 주기) 연속 2회분을 포함 — 60분이면 대부분 경기에
// 스냅샷이 1개뿐이라(first===last) 감지 자체가 안 됐음. 스케줄도 fetch-odds 직후(10 */2).
const WINDOW_MIN = 150;
const ALERT_DELTA_PCT = 8;

// 텔레그램 parse_mode=HTML — 영문 팀명에 & < > 가 있으면 entity 파싱 400 으로
// 메시지 전체가 조용히 유실되므로 escape 필수 (Brighton & Hove Albion 류).
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // 업체별 스냅샷(OddsBookSnapshot) 보존 14일 — 2시간마다 도는 이 cron 이 정리 담당.
  // 테이블 미생성(ODDS_BOOK_HISTORY 미활성) 상태면 조용히 skip.
  try {
    await prisma.oddsBookSnapshot.deleteMany({
      where: { fetchedAt: { lt: new Date(Date.now() - 14 * 86400_000) } },
    });
  } catch {
    // 테이블 없음 — 무시
  }

  if (process.env.ODDS_ALERT_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "ODDS_ALERT_ENABLED off" });
  }

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MIN * 60_000);
  // 아직 시작 안 한 경기의 최근 윈도우 스냅샷만 — 인플레이 변동(스코어 반응)은 제외.
  const snaps = await prisma.oddsSnapshot.findMany({
    where: {
      fetchedAt: { gte: windowStart },
      match: { startTime: { gt: new Date(now) } },
    },
    orderBy: { fetchedAt: "asc" },
    select: {
      matchId: true,
      homeOdds: true,
      drawOdds: true,
      awayOdds: true,
      match: {
        select: {
          league: true,
          startTime: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  type Acc = { first: (typeof snaps)[number]; last: (typeof snaps)[number] };
  const byMatch = new Map<number, Acc>();
  for (const s of snaps) {
    const acc = byMatch.get(s.matchId);
    if (!acc) byMatch.set(s.matchId, { first: s, last: s });
    else acc.last = s;
  }

  const movers: { text: string; delta: number }[] = [];
  for (const [matchId, { first, last }] of byMatch) {
    if (first === last) continue;
    const sides: [string, number | null, number | null][] = [
      ["home", first.homeOdds, last.homeOdds],
      ["draw", first.drawOdds, last.drawOdds],
      ["away", first.awayOdds, last.awayOdds],
    ];
    // 경기당 1건 — 첫 임계 초과가 아니라 |변동| 최대 side (홈 +9%·원정 -25% 면 원정이 스토리).
    let top: { key: string; o: number; c: number; d: number } | null = null;
    for (const [key, o, c] of sides) {
      if (o == null || c == null || o <= 0) continue;
      const d = ((c - o) / o) * 100;
      if (Math.abs(d) < ALERT_DELTA_PCT) continue;
      if (!top || Math.abs(d) > Math.abs(top.d)) top = { key, o, c, d };
    }
    if (top) {
      const m = last.match;
      const home = toKoreanTeamName(m.homeTeam.name, m.league);
      const away = toKoreanTeamName(m.awayTeam.name, m.league);
      const sideLabel = top.key === "home" ? home : top.key === "away" ? away : "무승부";
      movers.push({
        delta: Math.abs(top.d),
        text:
          `${esc(home)} vs ${esc(away)} (${m.league})\n` +
          `  ${esc(sideLabel)} ${top.o.toFixed(2)} → ${top.c.toFixed(2)} (${top.d < 0 ? "▼" : "▲"}${Math.abs(top.d).toFixed(0)}%, ${WINDOW_MIN}분 내)\n` +
          `  https://www.scorebase.kr/odds`,
      });
    }
  }

  if (movers.length) {
    movers.sort((a, b) => b.delta - a.delta);
    const top = movers.slice(0, 5);
    await sendTelegram(
      `📈 배당 급변 ${movers.length}건 (${WINDOW_MIN}분 윈도우)\n\n${top.map((t) => t.text).join("\n\n")}`,
      { disablePreview: true },
    );
  }

  return NextResponse.json({ ok: true, checked: byMatch.size, movers: movers.length });
}
