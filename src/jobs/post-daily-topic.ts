// 자유게시판 "오늘의 떡밥" — 매니저봇이 오늘의 빅매치 1건을 골라 토론 글 발행.
// 수동 트리거(npm run job:daily-topic)로 시작, 반응 보고 cron 화 예정.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

// manager-bot.ts 는 server-only 체인(auth)이라 CLI 에서 import 불가 —
// 매니저 계정은 봇들이 매일 써서 항상 존재하므로 여기선 조회만 한다.
const MANAGER_EMAIL = "manager@scorebase.internal";
async function getManagerId(): Promise<string> {
  const u = await prisma.user.findUnique({ where: { email: MANAGER_EMAIL }, select: { id: true } });
  if (!u) throw new Error("매니저 계정 없음 — manager-bot(분석 게시판) 이 먼저 1회 실행돼야 합니다.");
  return u.id;
}

// 떡밥 우선순위 — 한국 수요 순. 상위 리그에 오늘 경기가 있으면 그 리그에서 고른다.
const LEAGUE_PRIORITY = ["WORLD_CUP", "KBO", "EPL", "UCL", "CLUB_WORLD_CUP", "LALIGA", "MLB", "NPB", "K_LEAGUE_1"];
const LEAGUE_KO: Record<string, string> = {
  WORLD_CUP: "월드컵", KBO: "KBO", EPL: "EPL", UCL: "UCL", CLUB_WORLD_CUP: "클럽 월드컵",
  LALIGA: "라리가", MLB: "MLB", NPB: "NPB", K_LEAGUE_1: "K리그1",
};
const SOCCER = new Set(["WORLD_CUP", "EPL", "UCL", "CLUB_WORLD_CUP", "LALIGA", "K_LEAGUE_1"]);

function kstClock(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export async function runPostDailyTopic() {
  const managerId = await getManagerId();

  // 하루 1개 가드 — 오늘(KST) 이미 발행했으면 skip
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dayStartUtc = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000);
  const existing = await prisma.post.findFirst({
    where: { authorId: managerId, category: "FREE", title: { startsWith: "[오늘의 떡밥]" }, createdAt: { gte: dayStartUtc } },
    select: { id: true },
  });
  if (existing) {
    console.log(`[daily-topic] 오늘 이미 발행됨 (post ${existing.id}) — skip`);
    return { posted: false, postId: existing.id };
  }

  // 오늘 남은 경기 중 우선순위 리그 → 접전(확률차 최소) 순으로 선택
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      league: { in: LEAGUE_PRIORITY },
      status: "SCHEDULED",
      startTime: { gt: new Date(), lte: dayEndUtc },
      predHome: { not: null },
      predAway: { not: null },
    },
    select: {
      id: true, league: true, startTime: true,
      predHome: true, predDraw: true, predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (matches.length === 0) {
    console.log("[daily-topic] 오늘 남은 대상 경기 없음 — skip");
    return { posted: false };
  }
  const leagueRank = (lg: string | null) => {
    const i = LEAGUE_PRIORITY.indexOf(lg ?? "");
    return i < 0 ? 99 : i;
  };
  matches.sort(
    (a, b) =>
      leagueRank(a.league) - leagueRank(b.league) ||
      Math.abs(a.predHome! - a.predAway!) - Math.abs(b.predHome! - b.predAway!),
  );
  const m = matches[0];
  const lg = m.league ?? "";
  const home = toKoreanTeamName(m.homeTeam.name, lg) || m.homeTeam.name;
  const away = toKoreanTeamName(m.awayTeam.name, lg) || m.awayTeam.name;
  const ph = Math.round(m.predHome! * 100);
  const pa = Math.round(m.predAway! * 100);
  const pd = m.predDraw != null ? Math.round(m.predDraw * 100) : null;
  const aiPickTeam = ph >= pa ? home : away;
  const aiPct = Math.max(ph, pa);
  const margin = Math.abs(ph - pa);
  const tone =
    margin <= 8
      ? "확률이 이 정도로 붙으면 사실상 동전 던지기입니다. 데이터가 못 가르는 경기, 여러분의 감은 어느 쪽인가요?"
      : margin <= 20
        ? `AI 는 ${aiPickTeam} 쪽에 살짝 기울었지만, 뒤집힐 여지가 충분한 승부입니다.`
        : `AI 는 ${aiPickTeam} 우세를 꽤 확신하고 있습니다. 이변에 걸어볼 분 계신가요?`;

  const title = `[오늘의 떡밥] ${home} vs ${away} — AI 픽은 ${aiPickTeam} ${aiPct}%`;
  const probLine = pd != null ? `${home} ${ph}% · 무 ${pd}% · ${away} ${pa}%` : `${home} ${ph}% · ${away} ${pa}%`;
  const content = [
    `오늘 ${kstClock(m.startTime)} **${LEAGUE_KO[lg] ?? lg}** — **${home} vs ${away}**.`,
    ``,
    `우리 AI 모델의 승부 예측은 **${probLine}**.`,
    ``,
    tone,
    ``,
    `여러분의 픽은? [승부예측에서 원클릭 투표](/picks)하고, 댓글로 근거를 남겨주세요. 경기 끝나면 자동 채점됩니다.`,
  ].join("\n");

  const post = await prisma.post.create({
    data: {
      authorId: managerId,
      category: "FREE",
      sport: SOCCER.has(lg) ? "soccer" : "baseball",
      title,
      content,
    },
    select: { id: true },
  });
  console.log(`[daily-topic] 발행: post ${post.id} — ${title}`);
  return { posted: true, postId: post.id };
}

// tsx 직접 실행 (npm run job:daily-topic)
if (import.meta.url === `file://${process.argv[1]}`) {
  runPostDailyTopic()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
