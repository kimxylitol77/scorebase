// 가짜 일반 회원 픽 봇 — 평범한 회원 40명이 짧은 픽을 분단위 cron 에서 낮은 확률로 발행.
// 한 번에 몰아쓰지 않고 하루 5~10글이 시간에 분산. 야구 시즌 가중(야구 7 : 축구 3).
// 일반 등급(badge 없음) → 적중 쌓이면 등급 상승.
//
// 자연스러움 장치 (템플릿 티 제거):
//   ① 닉네임별 고정 페르소나(말투·픽 성향·길이) — 40명이 다 다른 사람처럼
//   ② 마켓은 코드에서 성향 가중 랜덤 확정 — AI 에 맡기면 1X2 로 수렴하던 문제 해결
//   ③ 최근 발행 글을 프롬프트에 주입해 표현·구조 중복 회피
//   ④ createdAt 1~24분 과거 지터(cron 정각 :00/:30 티 제거) + 시간대별 발행 확률

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { sportForLeague, parsePickJson, botTeamName } from "@/lib/analysis/manager-bot";

// 가짜 회원 닉네임 풀 — 기존 15명(인덱스 0~14, 그대로 유지) + 신규 25명(평범·한/영 혼합, 배팅 용어 배제).
export const FAKE_NICKNAMES = [
  // 기존 15 (건드리지 않음 — fake0~14@ 계정 닉네임 보존)
  "오늘은간다", "느낌충만", "직관러", "역배장인", "안전제일",
  "고배당헌터", "묻고더블로", "스포츠불패", "찍신강림", "꾸준왕",
  "한방인생", "관전모드", "야구는역시", "축덕광", "초보픽쟁이",
  // 신규 25 (평범한 스포츠팬 톤)
  "슬로우커브", "HomeRun_K", "9회말", "외야석직관", "불펜대기",
  "끝내기", "ParkJS", "mike_b", "동네야구단", "풀카운트",
  "치맥과야구", "야구는진리", "베이스볼킴", "7번타자", "leadoff",
  "새벽직관", "코너킥러", "midfielder", "손케이팬", "축구보는밤",
  "GoalKeeper", "잔디사랑", "striker9", "soccer_kim", "응원단장",
  // 신규 4 (2026-06 게시판 종목 확장 — 롤 2 + UFC 2. 배구는 V리그 수집 합류 시 추가)
  "미드차이", "한타각", "옥타곤직관", "테이크다운",
  // 신규 8 (2026-06 월드컵 — persona.sport="soccer" 고정 → WORLD_CUP 경기 우선)
  "국대분석관", "원정응원단", "조별리그덕후", "킥오프24",
  "톱시드", "언더독코리아", "월드컵사관", "그라운드K",
];

type Sport = "soccer" | "baseball" | "basketball" | "hockey" | "esports" | "mma" | "volleyball";
type Bias = "underdog" | "safe" | "over" | "under" | "handicap" | "balanced";

export interface Persona {
  tone: string; // 말투·캐릭터 (시스템 프롬프트 주입)
  bias: Bias; // 픽 성향 — 마켓 가중 + 프롬프트 힌트
  len: "short" | "mid"; // 글 길이 힌트
  sport?: Sport; // 지정 시 종목 고정(월드컵 페르소나 = soccer). 없으면 가중 랜덤
}

// 닉네임 인덱스와 1:1 — FAKE_NICKNAMES 순서 동기. 닉네임이 풍기는 캐릭터와 일치시킴.
// export — 자유게시판 봇(free-board-bot.ts)이 같은 페르소나 풀을 공유.
export const PERSONAS: Persona[] = [
  { tone: "텐션 높은 반말. 시원시원하게 지르는 스타일, 가끔 ㅋㅋ", bias: "balanced", len: "mid" }, // 오늘은간다
  { tone: "직감 위주. '느낌이 온다'는 식의 감 표현을 즐김, 근거는 대충", bias: "balanced", len: "short" }, // 느낌충만
  { tone: "직관 다니는 팬. 현장에서 본 경험을 슬쩍 끼워 말함", bias: "balanced", len: "mid" }, // 직관러
  { tone: "역배 전문을 자처. 약팀이 잡는 그림과 배당 가치 얘기를 좋아함", bias: "underdog", len: "mid" }, // 역배장인
  { tone: "신중하고 차분한 존댓말. 무리수 안 두는 성격", bias: "safe", len: "mid" }, // 안전제일
  { tone: "남들이 안 가는 쪽에서 가치를 찾는 사냥꾼 톤. 짧고 자신감", bias: "underdog", len: "short" }, // 고배당헌터
  { tone: "과감하고 흥 많음. 느낌표 자주, 약간 허세 섞인 반말", bias: "handicap", len: "short" }, // 묻고더블로
  { tone: "자신만만 단정형. 짧고 굵게 끊어 말함", bias: "balanced", len: "short" }, // 스포츠불패
  { tone: "찍기 자랑하는 가벼운 톤. 오늘의 촉을 믿는 스타일", bias: "balanced", len: "short" }, // 찍신강림
  { tone: "담백하고 건조. 군더더기 없이 요점만", bias: "safe", len: "short" }, // 꾸준왕
  { tone: "화끈한 경기 좋아함. 큰 거 한 방을 노리는 톤", bias: "over", len: "mid" }, // 한방인생
  { tone: "관조적이고 차분한 존댓말. 한 발 떨어져서 보는 톤", bias: "safe", len: "mid" }, // 관전모드
  { tone: "야구에 진심. 선발투수·타순 같은 디테일을 가볍게 언급", bias: "balanced", len: "mid" }, // 야구는역시
  { tone: "축구 전술 얘기 좋아함. 라인업·압박 같은 단어를 가볍게 씀", bias: "balanced", len: "mid" }, // 축덕광
  { tone: "초보 티 나는 겸손 톤. 자신 없어하면서도 픽은 함, 물음표 가끔", bias: "balanced", len: "short" }, // 초보픽쟁이
  { tone: "투수전 감상파. 점수 안 나는 팽팽한 경기를 좋아함", bias: "under", len: "mid" }, // 슬로우커브
  { tone: "타격전 환영. 홈런·빅이닝 얘기, 영어 단어 한두 개 섞기도", bias: "over", len: "short" }, // HomeRun_K
  { tone: "드라마틱한 전개 좋아함. 살짝 감성적인 표현", bias: "balanced", len: "mid" }, // 9회말
  { tone: "직관파. 야구장 분위기·현장 얘기를 곁들임", bias: "balanced", len: "mid" }, // 외야석직관
  { tone: "불펜 소모·연투 같은 운영 디테일에 밝은 톤", bias: "under", len: "mid" }, // 불펜대기
  { tone: "짧고 강하게 단정. 한 방에 끝내는 말투", bias: "balanced", len: "short" }, // 끝내기
  { tone: "건조한 한두 줄. 영어 약어 가끔(W, ez 정도)", bias: "safe", len: "short" }, // ParkJS
  { tone: "영어 살짝 섞인 짧은 톤. 가볍고 외국인 교포 느낌 한 스푼", bias: "balanced", len: "short" }, // mike_b
  { tone: "동네 형 정감 톤. 푸근하고 사람 냄새 나게", bias: "safe", len: "mid" }, // 동네야구단
  { tone: "끝까지 지켜보는 신중파. 변수 얘기를 한 번씩 함", bias: "safe", len: "mid" }, // 풀카운트
  { tone: "치맥에 야구 보는 즐김파. 승패보다 재미를 먼저 말하고 픽은 덤", bias: "over", len: "mid" }, // 치맥과야구
  { tone: "야구 진심 단정형. 줄임말 가끔", bias: "balanced", len: "short" }, // 야구는진리
  { tone: "평범하고 무난한 동호인 톤", bias: "balanced", len: "mid" }, // 베이스볼킴
  { tone: "겸손한 톤. 자기 픽을 소소하게 낮추는 유머", bias: "safe", len: "short" }, // 7번타자
  { tone: "속도감 있게 치고 나가는 짧은 말투", bias: "handicap", len: "short" }, // leadoff
  { tone: "새벽에 MLB 보는 올빼미. 피곤함이 살짝 묻어나는 톤", bias: "balanced", len: "mid" }, // 새벽직관
  { tone: "세트피스·코너킥 같은 축구 디테일을 가볍게 언급", bias: "balanced", len: "mid" }, // 코너킥러
  { tone: "중원 싸움 관점으로 경기를 보는 축구팬", bias: "under", len: "mid" }, // midfielder
  { tone: "EPL 애정 가득. 응원하는 마음이 픽에 묻어나는 톤", bias: "balanced", len: "mid" }, // 손케이팬
  { tone: "밤에 축구 보는 감성. 차분하고 약간 서정적", bias: "balanced", len: "mid" }, // 축구보는밤
  { tone: "수비·클린시트 관점. 골키퍼 시점에서 말하는 게 습관", bias: "under", len: "mid" }, // GoalKeeper
  { tone: "여유롭고 느긋하게 즐기는 스타일", bias: "safe", len: "mid" }, // 잔디사랑
  { tone: "공격 본능. 골 많이 나는 그림을 좋아하고 직설적", bias: "over", len: "short" }, // striker9
  { tone: "무난한 축구팬. 가끔 존댓말이 섞임", bias: "balanced", len: "mid" }, // soccer_kim
  { tone: "응원 텐션 높음. 느낌표 많고 흥겨운 톤", bias: "balanced", len: "mid" }, // 응원단장
  { tone: "롤 챔프 폼·밴픽 얘기를 가볍게 섞는 반말. ㅋㅋ 가끔", bias: "balanced", len: "short" }, // 미드차이
  { tone: "한타·오브젝트 위주로 경기를 보는 담백한 톤", bias: "safe", len: "short" }, // 한타각
  { tone: "UFC 체급·리치 같은 디테일을 슬쩍 언급하는 존댓말", bias: "balanced", len: "mid" }, // 옥타곤직관
  { tone: "그래플링 우위를 따지는 자신감 있는 반말", bias: "underdog", len: "short" }, // 테이크다운
  // 월드컵 페르소나 8 — sport:"soccer" 고정 → randomMatch 가 WORLD_CUP 경기 우선 선택
  { tone: "국가대표 전력·FIFA 랭킹·최근 A매치를 근거로 분석하는 차분한 존댓말", bias: "balanced", len: "mid", sport: "soccer" }, // 국대분석관
  { tone: "원정 직관 응원파. 현장 분위기·골 세리머니 얘기 곁들이고 텐션 높음", bias: "balanced", len: "mid", sport: "soccer" }, // 원정응원단
  { tone: "조 순위·경우의 수를 즐겨 따짐. 골득실·승점 시나리오를 가볍게", bias: "balanced", len: "mid", sport: "soccer" }, // 조별리그덕후
  { tone: "새벽 킥오프 챙겨보는 올빼미. 짧고 담백, 피곤함이 살짝 묻어남", bias: "balanced", len: "short", sport: "soccer" }, // 킥오프24
  { tone: "우승후보·강팀 위주로 안정적으로 보는 신중파 존댓말", bias: "safe", len: "mid", sport: "soccer" }, // 톱시드
  { tone: "약체국 돌풍에 거는 역배 헌터. 짧고 자신감 있게", bias: "underdog", len: "short", sport: "soccer" }, // 언더독코리아
  { tone: "역대 월드컵 기록·명승부를 슬쩍 인용하는 감성 톤", bias: "balanced", len: "mid", sport: "soccer" }, // 월드컵사관
  { tone: "전술·세트피스 관점으로 경기를 보는 축구 디테일파", bias: "under", len: "mid", sport: "soccer" }, // 그라운드K
];

// 성향별 픽 힌트 — 프롬프트에 주입(강제 아님, 캐릭터 부여용)
const BIAS_DESC: Record<Bias, string> = {
  underdog: "약팀이 잡는 그림(역배)에 끌리는 편. 다만 매번 역배는 아니고 끌리는 경기에서만.",
  safe: "무리한 픽보다 확실해 보이는 쪽을 고르는 편.",
  over: "점수가 많이 나는 화끈한 경기를 기대하는 편 — 오버 쪽에 마음이 기울지만 강제는 아님.",
  under: "투수전·수비전 같은 낮은 점수 경기를 좋아하는 편 — 언더 쪽에 마음이 기울지만 강제는 아님.",
  handicap: "핸디캡 라인 보는 재미로 픽하는 편.",
  balanced: "특별한 고집 없이 그날 끌리는 대로 고르는 편.",
};

// 성향별 마켓 가중 — 코드에서 확정해 1X2 쏠림 방지 (AI 에 맡기면 1X2 만 고름)
const MARKET_W: Record<Bias, [string, number][]> = {
  underdog: [["1X2", 0.5], ["HANDICAP", 0.35], ["OU", 0.15]],
  safe: [["1X2", 0.7], ["HANDICAP", 0.15], ["OU", 0.15]],
  over: [["OU", 0.65], ["1X2", 0.25], ["HANDICAP", 0.1]],
  under: [["OU", 0.65], ["1X2", 0.25], ["HANDICAP", 0.1]],
  handicap: [["HANDICAP", 0.55], ["1X2", 0.3], ["OU", 0.15]],
  balanced: [["1X2", 0.45], ["OU", 0.3], ["HANDICAP", 0.25]],
};

interface FakeCand {
  id: number;
  league: string;
  sport: Sport;
  startTime: Date;
  home: string;
  away: string;
  hcLine: number | null;
  ouLine: number | null;
  /** MLB 선발 매치업 — 있으면 프롬프트에 주입 (커뮤니티 문법: 선수 실명 재료) */
  starters: string | null;
}

interface ShortPick {
  market: string;
  pick: string;
  line: number | null;
  title: string;
  analysis: string;
}

/** 가짜 회원 계정 보장 (i = 닉네임 인덱스). export — 자유게시판 봇 공용. */
export async function ensureFakeMember(i: number): Promise<string> {
  const email = `fake${i}@scorebase.internal`;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id; // 기존 봇은 그대로(닉네임 변경 X)
  const pw = await hashPassword(`fake-${i}-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email, passwordHash: pw, nickname: FAKE_NICKNAMES[i] },
    select: { id: true },
  });
  return u.id;
}

/** 이 회원이 아직 안 쓴 예정 경기 중 랜덤 1개. preferSport 종목 우선(없으면 전체). */
async function randomMatch(userId: string, preferSport?: Sport): Promise<FakeCand | null> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  // LOL 포함 + UFC 추가 (UFC 는 ARTICLE_LEAGUES 밖 — 글 자동발행 없이 게시판 픽만)
  const leagues = [...ARTICLE_LEAGUES, "UFC"] as string[];

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      league: { in: leagues },
      posts: { none: { authorId: userId } },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      oddsHome: true, // 배당 유무 판단용 (배당 있는 경기 우선 선택)
      oddsHcLine: true,
      oddsTotalLine: true,
      homeStarter: true, // MLB 선발 — 제목·본문에 선수 실명 재료
      awayStarter: true,
    },
    take: 50,
  });

  let valid = matches
    .map((m) => ({ m, sport: sportForLeague(m.league) }))
    .filter((x): x is { m: (typeof matches)[number]; sport: Sport } => x.sport != null);
  if (valid.length === 0) return null;

  // 종목 가중 — preferSport 경기가 있으면 그쪽만(없으면 전체 fallback)
  if (preferSport) {
    const pref = valid.filter((x) => x.sport === preferSport);
    if (pref.length > 0) valid = pref;
  }
  // 월드컵 시즌 — soccer 픽은 WORLD_CUP 경기 우선(있을 때만 좁힘, 본선 끝나면 자동 클럽 fallback)
  if (preferSport === "soccer") {
    const wc = valid.filter((x) => x.m.league === "WORLD_CUP");
    if (wc.length > 0) valid = wc;
  }
  // 배당 있는 경기 우선 — 게시판 목록에 '배당 –' 글이 쌓이는 것 방지.
  // 단 배당 있는 경기가 하나도 없으면(야구 odds stale·군소리그 등) 전체 fallback —
  // 종목가중(야구55%)이 배당 누락만으로 깨지지 않게 한다.
  const withOdds = valid.filter((x) => x.m.oddsHome != null);
  if (withOdds.length > 0) valid = withOdds;

  const { m, sport } = valid[Math.floor(Math.random() * valid.length)];
  // MLB 선발 이름·ERA — 커뮤니티 문법(선수 실명) 재료. 없으면 null.
  let starters: string | null = null;
  try {
    const hs = m.homeStarter ? (JSON.parse(m.homeStarter) as { name?: string; era?: number }) : null;
    const as = m.awayStarter ? (JSON.parse(m.awayStarter) as { name?: string; era?: number }) : null;
    if (hs?.name && as?.name) {
      const fmt = (s: { name?: string; era?: number }) =>
        `${s.name}${s.era != null ? `(ERA ${s.era.toFixed(2)})` : ""}`;
      starters = `${fmt(hs)} vs ${fmt(as)}`;
    }
  } catch {
    // 선발 JSON 파싱 실패는 무시 — 재료가 없을 뿐
  }
  return {
    id: m.id,
    league: m.league,
    sport,
    startTime: m.startTime,
    home: botTeamName(toKoreanTeamName(m.homeTeam.name, m.league), m.league),
    away: botTeamName(toKoreanTeamName(m.awayTeam.name, m.league), m.league),
    hcLine: m.oddsHcLine,
    ouLine: m.oddsTotalLine,
    starters,
  };
}

/** 성향 가중으로 마켓 확정 — 라인 없는 마켓은 후보 제외. */
function chooseMarket(c: FakeCand, bias: Bias): string {
  const avail = new Set(["1X2"]);
  if (c.hcLine != null) avail.add("HANDICAP");
  if (c.ouLine != null) avail.add("OU");
  const weights = MARKET_W[bias].filter(([m]) => avail.has(m));
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [m, w] of weights) {
    r -= w;
    if (r <= 0) return m;
  }
  return weights[weights.length - 1][0];
}

/** 최근 봇 글 — 표현·구조 중복 회피용 컨텍스트. */
async function recentBotPosts(): Promise<string[]> {
  const bots = await prisma.user.findMany({
    where: { email: { startsWith: "fake", endsWith: "@scorebase.internal" } },
    select: { id: true },
  });
  if (!bots.length) return [];
  const posts = await prisma.post.findMany({
    where: { authorId: { in: bots.map((b) => b.id) } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { title: true, content: true },
  });
  return posts.map((p) => `- ${p.title} / ${p.content.slice(0, 50)}`);
}

/** 닉네임·페르소나·확정 마켓 기반 시스템 프롬프트. */
function buildSystem(nickname: string, p: Persona, market: string, drawAllowed: boolean, recent: string[]): string {
  const lenHint = p.len === "short" ? "한 줄(10자짜리 단문도 OK)~2문장" : "1~3문장";
  const pickRule =
    market === "1X2"
      ? `pick 은 ${drawAllowed ? '"HOME"/"DRAW"/"AWAY"' : '"HOME"/"AWAY"'} 중 하나. ⚠️ 홈이라고 습관적으로 HOME 금지 — 원정이 나아 보이면 망설임 없이 AWAY.`
      : market === "HANDICAP"
        ? 'pick 은 "HOME"/"AWAY" 중 하나 (핸디캡 라인을 커버할 쪽).'
        : 'pick 은 "OVER"/"UNDER" 중 하나.';
  return `당신은 스포츠 커뮤니티 회원 "${nickname}"입니다. 경기 하나에 짧은 픽 글을 남깁니다.

[캐릭터]
- 말투: ${p.tone}
- 픽 성향: ${BIAS_DESC[p.bias]}
- 전문 분석가 아님. 팬의 시선으로, 통계 나열 금지.

[이번 글]
- market 은 "${market}" 으로 정해져 있음. ${pickRule}
- 본문 길이: ${lenHint}. 길이가 매번 똑같지 않게.
- 제목: 25자 이내 단문. 게시판에 사람이 대충 치고 올리는 제목처럼 — 혼잣말·질문·감탄·반토막 문장 다 가능. 팀명·선수 실명이나 구체 숫자(배당·라인·ERA) 하나가 들어가면 더 좋지만 강제는 아님. 느낌 예시(문구·구조 베끼기 금지, 톤만 참고): "오늘 느낌은 여기다", "라인업 보니 홈이 이길 거 같은데?", "이 배당이 2.1이라고?", "샌디에이고 요즘 왜 이럼", "글라스나우 ERA 보고 왔습니다".
- 제목 금지: 기사 헤드라인·시적 은유 톤. 특히 "아침 8시, ~가 먼저 깬다"처럼 [시간대·날짜 + 쉼표 + 은유] 구조 절대 금지. 킥오프 시각·요일·기념일을 제목에 넣지 말 것.
- 팀명을 쓸 땐 별명 단독 금지. 예: "파드리스"(X)→"샌디에이고", "내셔널스"(X)→"워싱턴".

[중복 금지 — 중요]
최근 다른 회원들이 쓴 글:
${recent.length ? recent.join("\n") : "(없음)"}
- 위 글들과 문장 구조·표현·제목 패턴이 겹치면 안 됨.
- 특히 "요즘 폼이 좋다", "~믿고 간다/믿어본다", "기선제압", "홈 이점", "A는 잘하고 B는 약하다" 같은 닳은 틀 금지. 자기만의 말로.
- 시차·생체리듬·"누가 먼저 깬다"·아침/새벽 경기 각성 같은 킥오프 시각 근거 금지. 킥오프 시각은 배경 정보일 뿐 픽 이유로 쓰지 말 것.
- "요즘"·"최근"은 남용된 단어 — 아예 안 쓰거나 글당 1회까지. 요새/이번 주/올 시즌/지난 경기들 같은 다른 표현도 섞을 것.

[출력] 반드시 아래 JSON 객체 하나만. 앞뒤 설명·코드블록 금지:
{"pick":"...","title":"...","analysis":"..."}`;
}

/** 짧은 캐주얼 픽 생성. 검증 실패 시 null. */
async function generateShortPick(c: FakeCand, nickname: string, persona: Persona): Promise<ShortPick | null> {
  const drawAllowed = c.sport === "soccer";
  const market = chooseMarket(c, persona.bias);
  const recent = await recentBotPosts();

  const data = [
    `경기: ${c.home}(홈) vs ${c.away}(원정)`,
    `리그: ${leagueLabel(c.league)} · ${kickoffLabel(c.startTime)}`,
    c.starters ? `선발 매치업: ${c.starters}` : null,
    market === "HANDICAP" ? `핸디캡 라인(홈 기준): ${c.hcLine}` : null,
    market === "OU" ? `오버언더 기준선: ${c.ouLine}` : null,
  ]
    .filter((l): l is string => l != null)
    .join("\n");

  const raw = await generate(data, {
    system: buildSystem(nickname, persona, market, drawAllowed, recent),
    maxTokens: 600,
    temperature: 0.95, // 캐주얼·다양성
  });

  const json = parsePickJson(raw);
  if (!json) return null;

  const pick = String(json.pick ?? "").trim().toUpperCase();
  const title = String(json.title ?? "").trim().slice(0, 120);
  const analysis = String(json.analysis ?? "").trim();
  if (!title || analysis.length < 4) return null;

  let line: number | null = null;
  if (market === "1X2") {
    const allowed = drawAllowed ? ["HOME", "DRAW", "AWAY"] : ["HOME", "AWAY"];
    if (!allowed.includes(pick)) return null;
  } else if (market === "HANDICAP") {
    if (!["HOME", "AWAY"].includes(pick) || c.hcLine == null) return null;
    line = c.hcLine;
  } else {
    if (!["OVER", "UNDER"].includes(pick) || c.ouLine == null) return null;
    line = c.ouLine;
  }

  return { market, pick, line, title, analysis };
}

// 분단위 cron(30분 간격) 호출 → 시간대별 확률로 1글만 발행. 하루 5~10글이 시간에 분산(몰아쓰기 X).
// 야구 시즌이라 종목 가중 야구 70% / 축구 30%. force=true 면 확률 게이트 생략(검증·수동용).
export async function runFakeMemberPicks(force = false): Promise<{ created: number; skipped: number }> {
  // 시간대별 발행 확률(KST) — 커뮤니티 3파도(경기중 저녁·종료 직후 밤·익일 아침 출근) 반영.
  // 아침 07~09시 상향: 커뮤니티 실측(2026-07-05)상 스탯 정리 글 소비가 출근 시간대에 최고.
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const rate =
    kstHour >= 18 ? 0.22 : kstHour >= 9 ? 0.12 : kstHour >= 7 ? 0.2 : kstHour >= 3 ? 0.07 : 0.15;
  if (!force && Math.random() > rate) return { created: 0, skipped: 0 };

  const i = Math.floor(Math.random() * FAKE_NICKNAMES.length);
  // 페르소나에 종목이 고정돼 있으면(월드컵 8명 = soccer) 그 종목, 아니면 가중 랜덤(야구 시즌 주력).
  // 월드컵 페르소나 8명이 항상 soccer→WORLD_CUP 우선 → 축구 픽 비중 자동 상향(25%→~36%).
  const r = Math.random();
  const preferSport: Sport =
    PERSONAS[i].sport ?? (r < 0.55 ? "baseball" : r < 0.8 ? "soccer" : r < 0.9 ? "esports" : "mma");

  try {
    const userId = await ensureFakeMember(i);
    const c = await randomMatch(userId, preferSport);
    if (!c) return { created: 0, skipped: 1 };
    const pick = await generateShortPick(c, FAKE_NICKNAMES[i], PERSONAS[i]);
    if (!pick) return { created: 0, skipped: 1 };
    // createdAt 과거 지터 1~29분 — cron 이 :00/:30 정각 실행이라 그대로면 발행 분이 00/30 고정.
    // 1~29분 빼면 :00 발행 → 31~59분, :30 발행 → 1~29분으로 모든 분(10분·13분…)에 고르게 분포.
    // 과거 방향이라 킥오프 전 보장 유지. 초도 랜덤(0~59).
    const createdAt = new Date(Date.now() - (1 + Math.floor(Math.random() * 29)) * 60_000 - Math.floor(Math.random() * 60) * 1000);
    // 스탯카드 짤 확률 첨부(35%) — 커뮤니티 승자 포맷 "캡처 1장". 전원 첨부하면 봇 티가 나 확률로.
    const withCard = Math.random() < 0.35;
    const content = withCard
      ? `${pick.analysis}\n\n![${c.home} vs ${c.away} 경기 데이터](/api/og/match-card?m=${c.id})`
      : pick.analysis;
    await prisma.post.create({
      data: {
        authorId: userId,
        title: pick.title,
        content,
        sport: c.sport,
        matchId: c.id,
        market: pick.market,
        line: pick.line,
        pick: pick.pick,
        createdAt,
      },
    });
    return { created: 1, skipped: 0 };
  } catch {
    return { created: 0, skipped: 1 };
  }
}
