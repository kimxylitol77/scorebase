// 텔레그램 경기 알림 디스패처 (docs/telegram-alerts).
// 연결 회원의 즐겨찾기(UserTeamFollow) 팀 경기를 조회해 KICKOFF(임박·AI픽)·FINAL(결과) 발송.
// 중복 방지 = TelegramAlertLog (userId, matchId, kind) 유일. LLM 0 (픽은 결정론 predictionEngine).
import { prisma } from "@/lib/db";
import { sendTelegramTo } from "@/lib/notify/telegram";
import { predictMatchById, type PredictionResult } from "@/lib/predictionEngine";
import { toKoreanTeamName } from "@/lib/team-names";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { SITE_URL } from "@/lib/site-url";

const KICKOFF_WINDOW_MIN = 35; // 킥오프 이 분 이내면 발송 (크론 주기보다 넉넉히)
const FINAL_LOOKBACK_H = 6; // 종료 후 이 시간 이내만 발송 (오래된 경기 재발송 방지)
const MAX_SENDS = 300; // 런당 발송 상한 (폭주 방지)

type Kind = "KICKOFF" | "FINAL";

/** HTML parse_mode 안전 — 동적 문자열의 & < > 이스케이프. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** UTC Date → KST "HH:MM". */
function kstTime(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

function matchUrl(league: string, externalId: string): string {
  return `${SITE_URL}/live/${league}/${externalId}`;
}

/** AI 픽 한 줄. 보류(NO_PICK)면 접전 표기. */
function pickLine(pred: PredictionResult | null, homeName: string, awayName: string): string {
  if (!pred || pred.pick === "NO_PICK") return "AI 픽: 접전 (보류)";
  const label =
    pred.pick === "DRAW" ? "무승부" : `${pred.pick === "HOME" ? homeName : awayName} 승`;
  return `AI 픽: ${esc(label)} ${pred.confidence}%`;
}

export async function dispatchTelegramAlerts() {
  if (!process.env.USER_BOT_TOKEN) return { skipped: "no USER_BOT_TOKEN" };

  // 1. 연결 회원 + 팔로우 팀
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true, teamFollows: { select: { teamId: true } } },
  });
  if (users.length === 0) return { users: 0, sent: 0 };

  // 팀(String id) → 팔로워 [{userId, chatId}]
  const followersByTeam = new Map<string, Array<{ userId: string; chatId: string }>>();
  for (const u of users) {
    for (const f of u.teamFollows) {
      const arr = followersByTeam.get(f.teamId) ?? [];
      arr.push({ userId: u.id, chatId: u.telegramChatId! });
      followersByTeam.set(f.teamId, arr);
    }
  }
  const teamIds = [...followersByTeam.keys()].map(Number).filter((n) => Number.isInteger(n));
  if (teamIds.length === 0) return { users: users.length, follows: 0, sent: 0 };

  const now = new Date();

  // 2. 대상 경기 (팔로우 팀이 홈/원정)
  const MATCH_SELECT = { id: true, league: true, externalId: true, homeTeamId: true, awayTeamId: true, startTime: true, homeScore: true, awayScore: true } as const;
  const [kickoff, finals, live] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "SCHEDULED",
        startTime: { gte: now, lte: new Date(now.getTime() + KICKOFF_WINDOW_MIN * 60000) },
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      select: MATCH_SELECT,
    }),
    prisma.match.findMany({
      where: {
        status: "FINISHED",
        startTime: { gte: new Date(now.getTime() - FINAL_LOOKBACK_H * 3600000) },
        homeScore: { not: null },
        awayScore: { not: null },
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      select: MATCH_SELECT,
    }),
    // 골 실시간은 축구만 (야구·농구는 매 득점=스팸). KICKOFF/FINAL은 전 종목.
    prisma.match.findMany({
      where: {
        status: "LIVE",
        league: { in: [...SOCCER_LEAGUES] },
        homeScore: { not: null },
        awayScore: { not: null },
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      select: MATCH_SELECT,
    }),
  ]);
  if (kickoff.length === 0 && finals.length === 0 && live.length === 0) {
    return { users: users.length, matches: 0, sent: 0 };
  }

  // 팀 이름 배치
  const teamRowIds = new Set<number>();
  [...kickoff, ...finals, ...live].forEach((m) => {
    teamRowIds.add(m.homeTeamId);
    teamRowIds.add(m.awayTeamId);
  });
  const teamRows = await prisma.team.findMany({
    where: { id: { in: [...teamRowIds] } },
    select: { id: true, name: true, nameKo: true },
  });
  const teamMap = new Map(teamRows.map((t) => [t.id, t]));
  const nameOf = (id: number, league: string): string => {
    const t = teamMap.get(id);
    if (!t) return "?";
    return toKoreanTeamName(t.name, league) || t.nameKo || t.name;
  };

  type M = (typeof kickoff)[number];
  let sent = 0;

  const recipientsOf = (m: M): Map<string, string> => {
    const r = new Map<string, string>(); // userId → chatId
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      for (const f of followersByTeam.get(String(tid)) ?? []) r.set(f.userId, f.chatId);
    }
    return r;
  };

  const fanOut = async (m: M, kind: Kind, text: string) => {
    const recips = recipientsOf(m);
    for (const [userId, chatId] of recips) {
      if (sent >= MAX_SENDS) return;
      const exists = await prisma.telegramAlertLog.findUnique({
        where: { userId_matchId_kind: { userId, matchId: String(m.id), kind } },
      });
      if (exists) continue;
      const ok = await sendTelegramTo(chatId, text);
      if (ok) {
        await prisma.telegramAlertLog.create({
          data: { userId, matchId: String(m.id), kind },
        });
        sent++;
      }
    }
  };

  // 3-a. KICKOFF (AI 픽 포함)
  for (const m of kickoff) {
    const home = nameOf(m.homeTeamId, m.league);
    const away = nameOf(m.awayTeamId, m.league);
    let pred: PredictionResult | null = null;
    try {
      pred = await predictMatchById(m.id);
    } catch {
      pred = null;
    }
    const text =
      `⚽ <b>곧 시작</b> (${kstTime(m.startTime)}) · ${esc(home)} vs ${esc(away)}\n` +
      `${pickLine(pred, home, away)}\n` +
      `▶ ${matchUrl(m.league, m.externalId)}`;
    await fanOut(m, "KICKOFF", text);
  }

  // 3-b. FINAL (결과)
  for (const m of finals) {
    const home = nameOf(m.homeTeamId, m.league);
    const away = nameOf(m.awayTeamId, m.league);
    const text =
      `⏱ <b>종료</b> · ${esc(home)} ${m.homeScore} - ${m.awayScore} ${esc(away)}\n` +
      `▶ ${matchUrl(m.league, m.externalId)}`;
    await fanOut(m, "FINAL", text);
  }

  // 3-c. GOAL (라이브 득점 실시간). 상태 추적 = TelegramAlertLog kind "GOAL:h-a".
  // 최초 관측은 베이스라인(무발송) → 중간 참여자 catch-up 스팸 방지. 총득점 증가 시에만 발송.
  if (live.length) {
    const liveIds = live.map((m) => String(m.id));
    const userIds = users.map((u) => u.id);
    const goalLogs = await prisma.telegramAlertLog.findMany({
      where: { kind: { startsWith: "GOAL:" }, matchId: { in: liveIds }, userId: { in: userIds } },
      select: { userId: true, matchId: true, kind: true },
    });
    // (userId|matchId) → { maxTotal, kinds }
    const state = new Map<string, { maxTotal: number; kinds: Set<string> }>();
    for (const g of goalLogs) {
      const k = `${g.userId}|${g.matchId}`;
      const s = state.get(k) ?? { maxTotal: -1, kinds: new Set<string>() };
      s.kinds.add(g.kind);
      const t = g.kind.slice(5).split("-").reduce((acc, n) => acc + (parseInt(n, 10) || 0), 0);
      if (t > s.maxTotal) s.maxTotal = t;
      state.set(k, s);
    }
    const record = (userId: string, matchId: string, kind: string) =>
      prisma.telegramAlertLog.create({ data: { userId, matchId, kind } }).catch(() => {});

    for (const m of live) {
      const h = m.homeScore!;
      const a = m.awayScore!;
      const total = h + a;
      const kind = `GOAL:${h}-${a}`;
      const mid = String(m.id);
      const home = nameOf(m.homeTeamId, m.league);
      const away = nameOf(m.awayTeamId, m.league);
      const text =
        `⚽ <b>골!</b> ${esc(home)} ${h} - ${a} ${esc(away)}\n▶ ${matchUrl(m.league, m.externalId)}`;
      for (const [userId, chatId] of recipientsOf(m)) {
        if (sent >= MAX_SENDS) break;
        const s = state.get(`${userId}|${mid}`);
        if (!s) {
          await record(userId, mid, kind); // 베이스라인
          continue;
        }
        if (s.kinds.has(kind)) continue; // 이미 처리한 스코어
        if (total > s.maxTotal) {
          if (await sendTelegramTo(chatId, text)) {
            await record(userId, mid, kind);
            sent++;
          }
        } else {
          await record(userId, mid, kind); // 정정/감소 → 상태만 갱신
        }
      }
    }
  }

  return { users: users.length, kickoff: kickoff.length, finals: finals.length, live: live.length, sent };
}
