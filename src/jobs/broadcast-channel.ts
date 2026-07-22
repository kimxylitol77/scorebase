// 공개 텔레그램 채널 방송 잡 — 아침 데일리 카드 + 킥오프 전 Strong Pick 요약. TELEGRAM_CHANNEL_ID 미설정 시 완전 no-op.
//
// 1:1 회원 알림(dispatch-telegram-alerts)과 별개의 "방송" 채널. 같은 사용자 봇
// (USER_BOT_TOKEN)이 관리자로 있는 공개 채널에 게시한다 — 신규 봇 불필요.
// dedup = TelegramAlertLog 재사용, userId 에 채널 마커(회원 cuid 와 충돌 없음).
// 픽·확률은 Match.pred*(사이트 accuracy 와 동일 단일 소스) — 하드코딩 금지.
import { prisma } from "@/lib/db";
import { sendTelegramTo, sendTelegramPhotoTo } from "@/lib/notify/telegram";
import { toKoreanTeamName } from "@/lib/team-names";
import { leaguesForSport, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { kstDayWindow, kstHHmm } from "@/lib/threads/kst";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { SITE_URL } from "@/lib/site-url";

const CHANNEL_LOG_USER = "channel"; // TelegramAlertLog.userId 채널 마커
const UTM = "utm_source=telegram&utm_medium=channel";
const DAILY_CARD_MAX_LINES = 8; // og/daily 카드·SNS 캡션과 동일 노출 수
const KICKOFF_WINDOW_MIN = 75; // 매시 cron 겹침 여유 (중복은 로그로 차단)
const MAX_PICKS_PER_MSG = 3;
const DAILY_PICK_CAP = 3; // KST 하루 픽 상한 — 채널 소음 방지 (v1 하루 2~3건 정책)
const SLATE_LEAGUES = ["KBO", "NPB"] as const; // 하루 전 경기 픽을 한 통으로 묶는 리그(국야·일야)

/** HTML parse_mode 안전 — dispatch-telegram-alerts.ts 와 동일 패턴. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function channelId(): string | null {
  return process.env.TELEGRAM_CHANNEL_ID || null;
}

/** 아침 데일리 카드 — 오늘의 주요 경기 og 카드 + 캡션을 채널에 게시. */
export async function broadcastDailyCard() {
  const chat = channelId();
  if (!chat) {
    console.log("[broadcast-channel] TELEGRAM_CHANNEL_ID 미설정 — 데일리 카드 skip");
    return { skipped: "no TELEGRAM_CHANNEL_ID" };
  }

  const { start, end, dateKey, label } = kstDayWindow();
  const logKey = { userId: CHANNEL_LOG_USER, matchId: `daily:${dateKey}`, kind: "CH_DAILY" };
  const exists = await prisma.telegramAlertLog.findUnique({
    where: { userId_matchId_kind: logKey },
  });
  if (exists) return { skipped: "already sent", dateKey };

  const allLeagues = leaguesForSport("all");
  const priority = new Map(allLeagues.map((lg, i) => [lg, i]));
  const matches = await prisma.match.findMany({
    where: { league: { in: allLeagues }, startTime: { gte: start, lt: end } },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 200,
  });
  if (matches.length === 0) return { skipped: "no matches", dateKey };

  // 정렬: 리그 우선순위 → 이른 시간 (og/daily 카드와 동일 기준)
  const sorted = [...matches].sort((a, b) => {
    const ap = priority.get(a.league) ?? 999;
    const bp = priority.get(b.league) ?? 999;
    if (ap !== bp) return ap - bp;
    return a.startTime.getTime() - b.startTime.getTime();
  });
  const lines = sorted.slice(0, DAILY_CARD_MAX_LINES).map((m) => {
    const home = toKoreanTeamName(m.homeTeam.name, m.league);
    const away = toKoreanTeamName(m.awayTeam.name, m.league);
    return `[${LEAGUE_DISPLAY[m.league] ?? m.league}] ${home} vs ${away} · ${kstHHmm(m.startTime)}`;
  });
  const more = matches.length > lines.length ? `\n외 ${matches.length - lines.length}경기 더` : "";
  // sendPhoto caption 은 parse_mode 없는 평문 — esc 불필요
  const caption =
    `오늘의 주요 경기 (${label})\n\n${lines.join("\n")}${more}\n\n` +
    `전체 일정·AI 예측 ▶ ${SITE_URL}/board?${UTM}`;
  const imageUrl = `${SITE_URL}/api/og/daily?d=${dateKey}&size=square`;

  const ok = await sendTelegramPhotoTo(chat, imageUrl, caption);
  if (ok) await prisma.telegramAlertLog.create({ data: logKey });
  return { sent: ok ? 1 : 0, dateKey, matches: matches.length };
}

/**
 * 야구 하루 픽 슬레이트 — KBO/NPB 오늘 경기의 AI 픽이 "전부" 채워지면 리그당 1통.
 * 하나라도 pred 가 비면 발송하지 않고 다음 cron 을 기다린다(부분 슬레이트 금지).
 * 첫 경기 시작 후에는 선행 정보 가치가 없어 skip. dedup = slate:{league}:{dateKey}.
 */
export async function broadcastBaseballSlates() {
  const chat = channelId();
  if (!chat) {
    console.log("[broadcast-channel] TELEGRAM_CHANNEL_ID 미설정 — 야구 슬레이트 skip");
    return { skipped: "no TELEGRAM_CHANNEL_ID" };
  }
  const results: Record<string, unknown>[] = [];
  for (const league of SLATE_LEAGUES) {
    results.push({ league, ...(await broadcastLeagueSlate(chat, league)) });
  }
  return { results };
}

async function broadcastLeagueSlate(chat: string, league: string) {
  const { start, end, dateKey, label } = kstDayWindow();
  const logKey = { userId: CHANNEL_LOG_USER, matchId: `slate:${league}:${dateKey}`, kind: "CH_SLATE" };
  const exists = await prisma.telegramAlertLog.findUnique({
    where: { userId_matchId_kind: logKey },
  });
  if (exists) return { skipped: "already sent" };

  const matches = await prisma.match.findMany({
    where: { league, status: "SCHEDULED", startTime: { gte: start, lt: end } },
    select: {
      startTime: true,
      predHome: true,
      predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });
  if (matches.length === 0) return { skipped: "no matches" };

  const pending = matches.filter((m) => m.predHome == null || m.predAway == null).length;
  if (pending > 0) return { skipped: "picks pending", pending, total: matches.length };
  if (matches[0].startTime.getTime() <= Date.now()) return { skipped: "first pitch passed" };

  const lines = matches.map((m) => {
    const home = toKoreanTeamName(m.homeTeam.name, league);
    const away = toKoreanTeamName(m.awayTeam.name, league);
    const homeWin = m.predHome! >= m.predAway!;
    const pick = homeWin ? home : away;
    const prob = Math.round((homeWin ? m.predHome! : m.predAway!) * 100);
    return `${kstHHmm(m.startTime)} ${esc(home)} vs ${esc(away)} → <b>${esc(pick)}</b> ${prob}%`;
  });
  const text =
    `<b>${LEAGUE_DISPLAY[league] ?? league} AI 픽 · ${label}</b>\n\n${lines.join("\n")}\n\n` +
    `경기별 상세 ▶ ${SITE_URL}/leagues/${league}?${UTM}\n` +
    `통계 모델 기반 참고용 정보입니다.`;

  const ok = await sendTelegramTo(chat, text);
  if (ok) await prisma.telegramAlertLog.create({ data: logKey });
  return { sent: ok ? 1 : 0, matches: matches.length };
}

/** 킥오프 전 Strong Pick 요약 — 임박 경기 중 리그별 임계 통과 상위 1~3경기를 1개 메시지로. */
export async function broadcastKickoffPicks() {
  const chat = channelId();
  if (!chat) {
    console.log("[broadcast-channel] TELEGRAM_CHANNEL_ID 미설정 — 킥오프 픽 skip");
    return { skipped: "no TELEGRAM_CHANNEL_ID" };
  }

  const now = new Date();
  const { start: kstDayStart } = kstDayWindow();
  const sentToday = await prisma.telegramAlertLog.count({
    where: { userId: CHANNEL_LOG_USER, kind: "CH_KICKOFF", sentAt: { gte: kstDayStart } },
  });
  if (sentToday >= DAILY_PICK_CAP) return { skipped: "daily cap", sentToday };

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + KICKOFF_WINDOW_MIN * 60000) },
      predHome: { not: null },
      predDraw: { not: null },
      predAway: { not: null },
    },
    select: {
      id: true,
      league: true,
      externalId: true,
      startTime: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (matches.length === 0) return { skipped: "no upcoming matches", sentToday };

  // Strong Pick 게이트 — 홈·accuracy 페이지와 동일 (Match.pred* 최고 확률 vs 리그별 임계)
  const candidates = matches
    .map((m) => {
      const top = Math.max(m.predHome!, m.predDraw!, m.predAway!);
      const pick: "HOME" | "DRAW" | "AWAY" =
        top === m.predHome! ? "HOME" : top === m.predAway! ? "AWAY" : "DRAW";
      return { m, top, pick };
    })
    .filter((c) => c.top >= strongPickThreshold(c.m.league));
  if (candidates.length === 0) return { skipped: "no strong picks", sentToday };

  // 이미 발송한 경기 제외 (매시 cron 겹침 dedup)
  const logged = await prisma.telegramAlertLog.findMany({
    where: {
      userId: CHANNEL_LOG_USER,
      kind: "CH_KICKOFF",
      matchId: { in: candidates.map((c) => String(c.m.id)) },
    },
    select: { matchId: true },
  });
  const loggedIds = new Set(logged.map((l) => l.matchId));
  const fresh = candidates
    .filter((c) => !loggedIds.has(String(c.m.id)))
    .sort((a, b) => b.top - a.top)
    .slice(0, Math.min(MAX_PICKS_PER_MSG, DAILY_PICK_CAP - sentToday));
  if (fresh.length === 0) return { skipped: "all already sent", sentToday };

  const blocks = fresh.map((c) => {
    const home = toKoreanTeamName(c.m.homeTeam.name, c.m.league);
    const away = toKoreanTeamName(c.m.awayTeam.name, c.m.league);
    const label = c.pick === "DRAW" ? "무승부" : `${c.pick === "HOME" ? home : away} 승`;
    return (
      `[${LEAGUE_DISPLAY[c.m.league] ?? c.m.league}] ${esc(home)} vs ${esc(away)} (${kstHHmm(c.m.startTime)})\n` +
      `AI 픽: ${esc(label)} ${Math.round(c.top * 100)}%\n` +
      `▶ ${SITE_URL}/live/${c.m.league}/${c.m.externalId}?${UTM}`
    );
  });
  const text =
    `<b>곧 시작 · AI Strong Pick</b>\n\n${blocks.join("\n\n")}\n\n` +
    `통계 모델 기반 참고용 정보입니다.`;

  const ok = await sendTelegramTo(chat, text);
  if (ok) {
    for (const c of fresh) {
      await prisma.telegramAlertLog
        .create({
          data: { userId: CHANNEL_LOG_USER, matchId: String(c.m.id), kind: "CH_KICKOFF" },
        })
        .catch(() => {});
    }
  }
  return { sent: ok ? fresh.length : 0, candidates: candidates.length, sentToday };
}
