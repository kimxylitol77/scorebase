// 텔레그램 경기 알림 디스패처 (docs/telegram-alerts).
// 연결 회원의 즐겨찾기 팀(UserTeamFollow)·경기(UserMatchFollow)를 조회해 KICKOFF(임박·AI픽)·FINAL(결과) 발송.
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

  // 1. 연결 회원 + 팔로우 팀·경기
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } },
    select: {
      id: true,
      telegramChatId: true,
      alertOddsDrop: true,
      alertOddsRise: true,
      teamFollows: { select: { teamId: true } },
      matchFollows: { select: { matchId: true } },
    },
  });
  if (users.length === 0) return { users: 0, sent: 0 };

  // 팀(String id) → 팔로워 [{userId, chatId}]
  const followersByTeam = new Map<string, Array<{ userId: string; chatId: string }>>();
  // 경기(Match.id) → 팔로워 — 팀은 안 팔로우해도 그 경기만 챙기는 회원.
  const followersByMatch = new Map<number, Array<{ userId: string; chatId: string }>>();
  for (const u of users) {
    for (const f of u.teamFollows) {
      const arr = followersByTeam.get(f.teamId) ?? [];
      arr.push({ userId: u.id, chatId: u.telegramChatId! });
      followersByTeam.set(f.teamId, arr);
    }
    for (const f of u.matchFollows) {
      const arr = followersByMatch.get(f.matchId) ?? [];
      arr.push({ userId: u.id, chatId: u.telegramChatId! });
      followersByMatch.set(f.matchId, arr);
    }
  }
  const teamIds = [...followersByTeam.keys()].map(Number).filter((n) => Number.isInteger(n));
  const followedMatchIds = [...followersByMatch.keys()];

  const now = new Date();
  let sent = 0;

  // 팀 즐겨찾기와 무관한 알림은 먼저 처리한다 — 아래 팀 기반 로직에는 early return 이
  // 여러 개 있어서, 뒤에 두면 즐겨찾기가 없거나 대상 경기가 없는 날 통째로 건너뛴다.
  const followPickSent = await dispatchFollowPicks(now, () => sent < MAX_SENDS, (n) => { sent += n; });
  const botDigestSent = await dispatchMyBotPicks(now, () => sent < MAX_SENDS, (n) => { sent += n; });
  const oddsSent = await dispatchOddsMoves(now, users, followersByTeam, followersByMatch, () => sent < MAX_SENDS, (n) => { sent += n; });
  const indep = { followPick: followPickSent, botDigest: botDigestSent, oddsMove: oddsSent };

  if (teamIds.length === 0 && followedMatchIds.length === 0) {
    return { users: users.length, follows: 0, ...indep, sent };
  }

  // 2. 대상 경기 (팔로우 팀이 홈/원정 이거나, 경기 자체를 팔로우)
  const MATCH_SELECT = { id: true, league: true, externalId: true, homeTeamId: true, awayTeamId: true, startTime: true, homeScore: true, awayScore: true } as const;
  const FOLLOWED = [
    { homeTeamId: { in: teamIds } },
    { awayTeamId: { in: teamIds } },
    { id: { in: followedMatchIds } },
  ];
  const [kickoff, finals, live] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "SCHEDULED",
        startTime: { gte: now, lte: new Date(now.getTime() + KICKOFF_WINDOW_MIN * 60000) },
        OR: FOLLOWED,
      },
      select: MATCH_SELECT,
    }),
    prisma.match.findMany({
      where: {
        status: "FINISHED",
        startTime: { gte: new Date(now.getTime() - FINAL_LOOKBACK_H * 3600000) },
        homeScore: { not: null },
        awayScore: { not: null },
        OR: FOLLOWED,
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
        OR: FOLLOWED,
      },
      select: MATCH_SELECT,
    }),
  ]);
  if (kickoff.length === 0 && finals.length === 0 && live.length === 0) {
    return { users: users.length, matches: 0, ...indep, sent };
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

  const recipientsOf = (m: M): Map<string, string> => {
    const r = new Map<string, string>(); // userId → chatId
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      for (const f of followersByTeam.get(String(tid)) ?? []) r.set(f.userId, f.chatId);
    }
    for (const f of followersByMatch.get(m.id) ?? []) r.set(f.userId, f.chatId);
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

  // FOLLOW_PICK·BOT_DIGEST·ODDS_MOVE 는 위 팀 기반 로직의 early return 에 걸리지 않도록 앞부분에서 이미 처리했다.
  return { users: users.length, kickoff: kickoff.length, finals: finals.length, live: live.length, ...indep, sent };
}

// 배당 변동 알림 — 운영 채널용 odds-mover-alert 와 동일 기준(윈도우 150분·임계 8%).
// fetch-odds cron 이 2h 주기라 윈도우가 짧으면 스냅샷이 1개뿐이라 감지가 안 된다.
const ODDS_WINDOW_MIN = 150;
const ODDS_DELTA_PCT = 8;

/**
 * ODDS_MOVE — 즐겨찾기 팀·경기의 프리매치 배당이 크게 움직이면 발송.
 * 방향(하락 ▼ / 상승 ▲)은 회원이 마이페이지에서 각각 옵트인(User.alertOddsDrop/Rise, 기본 OFF).
 * 중복 방지 = TelegramAlertLog(kind="ODDS:{DROP|RISE}:{도달 배당}") — 같은 값까지의 이동은 1회,
 * 계속 움직이면 새 값이라 다시 발송.
 */
async function dispatchOddsMoves(
  now: Date,
  users: Array<{ id: string; telegramChatId: string | null; alertOddsDrop: boolean; alertOddsRise: boolean }>,
  followersByTeam: Map<string, Array<{ userId: string; chatId: string }>>,
  followersByMatch: Map<number, Array<{ userId: string; chatId: string }>>,
  canSend: () => boolean,
  addSent: (n: number) => void,
): Promise<number> {
  const optedIn = users.filter((u) => u.alertOddsDrop || u.alertOddsRise);
  if (optedIn.length === 0) return 0; // 아무도 안 켜면 쿼리조차 하지 않는다
  const prefOf = new Map(optedIn.map((u) => [u.id, u]));

  // 옵트인 회원이 팔로우한 팀·경기만 대상 — 전 경기 스캔은 스팸이자 낭비.
  const teamIds: number[] = [];
  for (const [tid, fs] of followersByTeam) {
    if (fs.some((f) => prefOf.has(f.userId))) {
      const n = Number(tid);
      if (Number.isInteger(n)) teamIds.push(n);
    }
  }
  const matchIds: number[] = [];
  for (const [mid, fs] of followersByMatch) {
    if (fs.some((f) => prefOf.has(f.userId))) matchIds.push(mid);
  }
  if (teamIds.length === 0 && matchIds.length === 0) return 0;

  const snaps = await prisma.oddsSnapshot.findMany({
    where: {
      fetchedAt: { gte: new Date(now.getTime() - ODDS_WINDOW_MIN * 60_000) },
      match: {
        startTime: { gt: now }, // 프리매치만 — 인플레이 변동은 스코어 반응이라 의미가 다르다
        OR: [
          { homeTeamId: { in: teamIds } },
          { awayTeamId: { in: teamIds } },
          { id: { in: matchIds } },
        ],
      },
    },
    orderBy: { fetchedAt: "asc" },
    select: {
      matchId: true,
      homeOdds: true,
      drawOdds: true,
      awayOdds: true,
      match: {
        select: {
          id: true,
          league: true,
          externalId: true,
          startTime: true,
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  if (snaps.length === 0) return 0;

  type Snap = (typeof snaps)[number];
  const byMatch = new Map<number, { first: Snap; last: Snap }>();
  for (const s of snaps) {
    const acc = byMatch.get(s.matchId);
    if (!acc) byMatch.set(s.matchId, { first: s, last: s });
    else acc.last = s;
  }

  let sent = 0;
  for (const [, { first, last }] of byMatch) {
    if (first === last) continue;
    const m = last.match;
    const home = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name;
    const away = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name;

    // 경기당 1건 — |변동| 최대 side 가 그 경기의 스토리.
    const sides: Array<[string, number | null, number | null]> = [
      [home, first.homeOdds, last.homeOdds],
      ["무승부", first.drawOdds, last.drawOdds],
      [away, first.awayOdds, last.awayOdds],
    ];
    let top: { label: string; o: number; c: number; d: number } | null = null;
    for (const [label, o, c] of sides) {
      if (o == null || c == null || o <= 0) continue;
      const d = ((c - o) / o) * 100;
      if (Math.abs(d) < ODDS_DELTA_PCT) continue;
      if (!top || Math.abs(d) > Math.abs(top.d)) top = { label, o, c, d };
    }
    if (!top) continue;

    const dir: "DROP" | "RISE" = top.d < 0 ? "DROP" : "RISE";
    const arrow = dir === "DROP" ? "▼" : "▲";
    const meaning = dir === "DROP" ? "돈이 몰리는 중" : "기대가 낮아지는 중";
    const text =
      `📈 <b>배당 ${dir === "DROP" ? "하락" : "상승"}</b> · ${esc(home)} vs ${esc(away)}\n` +
      `${esc(top.label)} ${top.o.toFixed(2)} → ${top.c.toFixed(2)} (${arrow}${Math.abs(top.d).toFixed(0)}%, ${ODDS_WINDOW_MIN}분 내 · ${meaning})\n` +
      `킥오프 ${kstTime(m.startTime)}\n` +
      `▶ ${matchUrl(m.league, m.externalId)}`;
    const kind = `ODDS:${dir}:${top.c.toFixed(2)}`;

    // 수신자 = 이 경기의 팀·경기 팔로워 중 해당 방향을 켠 회원
    const recips = new Map<string, string>();
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      for (const f of followersByTeam.get(String(tid)) ?? []) recips.set(f.userId, f.chatId);
    }
    for (const f of followersByMatch.get(m.id) ?? []) recips.set(f.userId, f.chatId);

    for (const [userId, chatId] of recips) {
      const pref = prefOf.get(userId);
      if (!pref) continue;
      if (dir === "DROP" ? !pref.alertOddsDrop : !pref.alertOddsRise) continue;
      if (!canSend()) return sent;
      const exists = await prisma.telegramAlertLog.findUnique({
        where: { userId_matchId_kind: { userId, matchId: String(m.id), kind } },
      });
      if (exists) continue;
      if (await sendTelegramTo(chatId, text)) {
        await prisma.telegramAlertLog.create({
          data: { userId, matchId: String(m.id), kind },
        });
        sent++;
        addSent(1);
      }
    }
  }
  return sent;
}

const FOLLOW_PICK_LOOKBACK_MIN = 40; // 크론 */5 대비 넉넉한 스캔 창 (중복은 로그로 차단)

/** 픽 라벨 — 글 상세 페이지와 동일 규칙 (HANDICAP=라인 부호, OU=오버/언더, 1X2=승/무). */
function followPickLabel(
  market: string | null,
  pick: string | null,
  line: number | null,
  home: string,
  away: string,
): string {
  if (!pick) return "";
  const fmtLine = (l: number) => (l > 0 ? `+${l}` : `${l}`);
  if (market === "HANDICAP" && line != null) {
    return pick === "HOME" ? `${home} ${fmtLine(line)}` : `${away} ${fmtLine(-line)}`;
  }
  if (market === "OU" && line != null) {
    return pick === "OVER" ? `오버 ${line}` : `언더 ${line}`;
  }
  return pick === "HOME" ? `${home} 승` : pick === "AWAY" ? `${away} 승` : "무승부";
}

async function dispatchFollowPicks(
  now: Date,
  canSend: () => boolean,
  addSent: (n: number) => void,
): Promise<number> {
  // 팔로워(텔레그램 연결) → 분석가 매핑
  const follows = await prisma.userAnalystFollow.findMany({
    where: { user: { telegramChatId: { not: null } } },
    select: { analystId: true, user: { select: { id: true, telegramChatId: true } } },
  });
  if (follows.length === 0) return 0;
  const followersByAnalyst = new Map<string, Array<{ userId: string; chatId: string }>>();
  for (const f of follows) {
    const arr = followersByAnalyst.get(f.analystId) ?? [];
    arr.push({ userId: f.user.id, chatId: f.user.telegramChatId! });
    followersByAnalyst.set(f.analystId, arr);
  }

  const posts = await prisma.post.findMany({
    where: {
      category: "ANALYSIS",
      pick: { not: null },
      authorId: { in: [...followersByAnalyst.keys()] },
      createdAt: { gte: new Date(now.getTime() - FOLLOW_PICK_LOOKBACK_MIN * 60000) },
    },
    select: {
      id: true,
      title: true,
      market: true,
      pick: true,
      line: true,
      authorId: true,
      author: { select: { nickname: true } },
      match: {
        select: {
          league: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  if (posts.length === 0) return 0;

  let sent = 0;
  for (const p of posts) {
    const home = p.match ? toKoreanTeamName(p.match.homeTeam.name, p.match.league) : "";
    const away = p.match ? toKoreanTeamName(p.match.awayTeam.name, p.match.league) : "";
    const label = followPickLabel(p.market, p.pick, p.line, home, away);
    const text =
      `📌 <b>팔로우한 분석가 새 픽</b> · ${esc(p.author.nickname)}\n` +
      `${esc(p.title)}\n` +
      (label ? `픽: ${esc(label)}\n` : "") +
      `▶ ${SITE_URL}/analysis/${p.id}`;
    const logMatchId = `post:${p.id}`;
    for (const { userId, chatId } of followersByAnalyst.get(p.authorId) ?? []) {
      if (!canSend()) return sent;
      const exists = await prisma.telegramAlertLog.findUnique({
        where: { userId_matchId_kind: { userId, matchId: logMatchId, kind: "FOLLOW_PICK" } },
      });
      if (exists) continue;
      const ok = await sendTelegramTo(chatId, text);
      if (ok) {
        await prisma.telegramAlertLog.create({
          data: { userId, matchId: logMatchId, kind: "FOLLOW_PICK" },
        });
        sent++;
        addSent(1);
      }
    }
  }
  return sent;
}

/**
 * BOT_DIGEST — 회원 커스텀 봇(/lab)이 오늘 낸 픽을 봇당 하루 1건으로 묶어 발송.
 * 픽 하나씩 보내면 봇 한 대가 24h 창 경기 수만큼 통을 쏘게 되어 차단 위험이 크다.
 * 중복 방지 = TelegramAlertLog(matchId="botdigest:{botId}:{YYYY-MM-DD KST}", kind="BOT_DIGEST").
 * 발송 조건 = 봇 notifyTelegram=true + isActive + 소유자 telegramChatId 연결.
 */
async function dispatchMyBotPicks(
  now: Date,
  canSend: () => boolean,
  addSent: (n: number) => void,
): Promise<number> {
  const bots = await prisma.memberBot.findMany({
    where: { notifyTelegram: true, isActive: true },
    select: { id: true, name: true, userId: true },
  });
  if (bots.length === 0) return 0;

  // 소유자 중 텔레그램 연결된 회원만
  const owners = await prisma.user.findMany({
    where: { id: { in: [...new Set(bots.map((b) => b.userId))] }, telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });
  if (owners.length === 0) return 0;
  const chatOf = new Map(owners.map((o) => [o.id, o.telegramChatId!]));

  // KST 날짜 키 — 하루 1건 기준
  const dayKey = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  let sent = 0;

  for (const bot of bots) {
    const chatId = chatOf.get(bot.userId);
    if (!chatId) continue;
    if (!canSend()) return sent;

    const logMatchId = `botdigest:${bot.id}:${dayKey}`;
    const exists = await prisma.telegramAlertLog.findUnique({
      where: { userId_matchId_kind: { userId: bot.userId, matchId: logMatchId, kind: "BOT_DIGEST" } },
    });
    if (exists) continue;

    // MemberBotPick 은 Match 와 FK 관계가 없다(수동 join) — 픽을 먼저 뽑고 matchId 로 배치 조회.
    const rawPicks = await prisma.memberBotPick.findMany({
      where: { botId: bot.id },
      orderBy: [{ prob: "desc" }],
      select: { matchId: true, pick: true, prob: true },
    });
    if (rawPicks.length === 0) continue;

    // 아직 시작 안 한 경기만 — 이미 끝난 경기를 알려도 의미가 없다.
    const matches = await prisma.match.findMany({
      where: { id: { in: rawPicks.map((p) => p.matchId) }, startTime: { gte: now } },
      select: {
        id: true, league: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });
    const matchOf = new Map(matches.map((m) => [m.id, m]));
    const picks = rawPicks.filter((p) => matchOf.has(p.matchId));
    if (picks.length === 0) continue;

    const top = picks.slice(0, 5).map((p) => {
      const m = matchOf.get(p.matchId)!;
      const home = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name;
      const away = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name;
      const label = p.pick === "HOME" ? `${home} 승` : p.pick === "AWAY" ? `${away} 승` : "무승부";
      return `· ${esc(home)} vs ${esc(away)} — ${esc(label)} ${Math.round(p.prob * 100)}%`;
    });

    const text =
      `🤖 <b>내 봇 오늘의 픽</b> · ${esc(bot.name)}\n` +
      `예정 경기 ${picks.length}건에 픽을 냈습니다.\n\n` +
      `${top.join("\n")}\n` +
      (picks.length > top.length ? `\n외 ${picks.length - top.length}건\n` : "") +
      `\n▶ ${SITE_URL}/lab`;

    const ok = await sendTelegramTo(chatId, text);
    if (ok) {
      await prisma.telegramAlertLog.create({
        data: { userId: bot.userId, matchId: logMatchId, kind: "BOT_DIGEST" },
      });
      sent++;
      addSent(1);
    }
  }
  return sent;
}
