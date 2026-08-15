// 비축구 감독 수집 — 야구(KBO·MLB·NPB) + 농구(NBA·WNBA·KBL·WKBL) + 하키(NHL)
// → data/nonsoccer-coaches.json { ourTeamId: { nameKo, nameEn?, interim?, asOf } }
//
// 팀 페이지 감독 카드용(축구 team-coaches.json 의 비축구 버전). 멱등(전체 갱신).
// 소스 — MLB=MLB Stats API, NBA·WNBA·NHL=ESPN roster(둘 다 무료·키 없음),
// KBO·NPB·KBL·WKBL=검증된 정적 사전(교체 시 사전 수정 후 재실행).
// 검증 근거(2026-08-15): KBO·KBL·WKBL=ko.wikipedia+뉴스 교차, NPB=npb.jp 공시+ja.wikipedia 교차.
// 미지원(소스 부재·트래픽 미미): CPBL·LMB·AIHL·NZIHL·국대 대회(IIHF_WC·VNL 등).
//
//   npx tsx --env-file=.env.local scripts/build-nonsoccer-coaches.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "nonsoccer-coaches.json");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const AS_OF = process.argv[2] || new Date().toISOString().slice(0, 10);

interface Entry { nameKo: string; nameEn?: string; interim?: boolean; asOf: string }

// ===== KBO 10팀 (키=팀명, 2026-08-15 검증 — 시즌 중 교체 없음) =====
const KBO: Record<string, string> = {
  "KIA 타이거즈": "이범호",
  "KT 위즈": "이강철",
  "LG 트윈스": "염경엽",
  "NC 다이노스": "이호준",
  "SSG 랜더스": "이숭용",
  "두산 베어스": "김원형",
  "롯데 자이언츠": "김태형",
  "삼성 라이온즈": "박진만",
  "키움 히어로즈": "설종진",
  "한화 이글스": "김경문",
};

// ===== NPB 12팀 (2026-08-15 npb.jp 공시 검증 — 라쿠텐은 6/18 미키→요시이, 요미우리는 5/26~ 하시가미 대행) =====
const NPB: Record<string, { nameKo: string; nameEn: string; interim?: boolean }> = {
  "도쿄 야쿠르트 스왈로스": { nameKo: "이케야마 다카히로", nameEn: "Takahiro Ikeyama" },
  "도호쿠 라쿠텐 골든이글스": { nameKo: "요시이 마사토", nameEn: "Masato Yoshii" },
  "사이타마 세이부 라이온스": { nameKo: "니시구치 후미야", nameEn: "Fumiya Nishiguchi" },
  "오릭스 버팔로스": { nameKo: "기시다 마모루", nameEn: "Mamoru Kishida" },
  "요미우리 자이언츠": { nameKo: "하시가미 히데키", nameEn: "Hideki Hashigami", interim: true },
  "요코하마 디엔에이 베이스타스": { nameKo: "아이카와 료지", nameEn: "Ryoji Aikawa" },
  "주니치 드래곤스": { nameKo: "이노우에 가즈키", nameEn: "Kazuki Inoue" },
  "지바 롯데 마린스": { nameKo: "사부로", nameEn: "Saburo" },
  "한신 타이거스": { nameKo: "후지카와 규지", nameEn: "Kyuji Fujikawa" },
  "홋카이도 닛폰햄 파이터즈": { nameKo: "신조 쓰요시", nameEn: "Tsuyoshi Shinjo" },
  "후쿠오카 소프트뱅크 호크스": { nameKo: "고쿠보 히로키", nameEn: "Hiroki Kokubo" },
  "히로시마 도요 카프": { nameKo: "아라이 다카히로", nameEn: "Takahiro Arai" },
};

// ===== KBL 10팀 + WKBL 6팀 (키=우리 DB 팀명, 2026-08-15 ko위키+뉴스 검증 — 김상식 7/16 선임 반영) =====
const KBL_WKBL: Record<string, string> = {
  // KBL
  "Anyang JungKwanJang Red Boosters": "유도훈",
  "Busan KCC Egis": "이상민",
  "Changwon LG Sakers": "조상현",
  "Daegu KOGAS Pegasus": "강혁",
  "Goyang Sono Skygunners": "손창환",
  "Seoul SK Knights": "전희철",
  "Seoul Samsung Thunders": "김상식",
  "Suwon KT Sonicboom": "문경은",
  "Ulsan Mobis Phoebus": "양동근",
  "Wonju Dongbu Promy": "이규섭",
  // WKBL
  "BNK Sum Women": "박정은",
  "Bucheon Keb Hanabank": "이상범",
  "KB Stars": "김완수",
  "Samsunglife Blueminx": "하상윤",
  "Sinhan Bank S-Birds": "최윤아",
  "Woori Bank Wibee": "전주원",
};

// 영문 감독 한글 표기 고정 사전 — Haiku 표기가 흔들리면 여기 추가
// (로벨로=SPOTV·MLB코리아, 맥컬러=나무위키·뉴스1 실측 2026-08-15)
const MANUAL_KO: Record<string, string> = {
  "Torey Lovullo": "토리 로벨로",
  "Clayton McCullough": "클레이튼 맥컬러",
  "Craig Stammen": "크레이그 스태먼",
  "Warren Schaeffer": "워런 셰이퍼",
  "Kurt Suzuki": "커트 스즈키",
  "John Schneider": "존 슈나이더",
  "Stephen Vogt": "스티븐 보트",
  "Craig Albernaz": "크레이그 앨버나즈",
  "Tony Vitello": "토니 비텔로",
  "Pat Murphy": "팻 머피",
  "Blake Butera": "블레이크 부테라",
  "Chad Tracy": "채드 트레이시",
  // NBA (데이그놀트=바스켓코리아·루키, 레딕=국내 매체 관용)
  "JJ Redick": "JJ 레딕",
  "Mark Daigneault": "마크 데이그놀트",
  "Jamahl Mosley": "자말 모슬리",
  "Tiago Splitter": "티아고 스플리터",
  "J.B. Bickerstaff": "J.B. 비커스태프",
  "Sean Sweeney": "숀 스위니",
  "Taylor Jenkins": "테일러 젠킨스",
  "Dusty May": "더스티 메이",
  "Tuomas Iisalo": "투오마스 이살로",
  "Jordan Ott": "조던 오트",
  "Mitch Johnson": "미치 존슨",
  "Chris DeMarco": "크리스 디마코",
  "David Adelman": "데이비드 아델만",
  // MLB 추가
  "Mark Kotsay": "마크 코세이",
  // NHL
  "Dan Muse": "댄 뮤즈",
  "Ryan Craig": "라이언 크레이그",
  "Mike Babcock": "마이크 밥콕",
  "Jeff Blashill": "제프 블래실",
  "Glen Gulutzan": "글렌 굴루잔",
  "Rick Tocchet": "릭 토켓",
  "Rod Brind'Amour": "로드 브린다무어",
  "Sheldon Keefe": "셸던 키프",
  "Manny Malhotra": "매니 말호트라",
  "Spencer Carbery": "스펜서 카버리",
  // WNBA
  "Stephanie White": "스테파니 화이트",
  "Natalie Nakase": "나탈리 나카세",
  "Nate Tibbetts": "네이트 티베츠",
  "Tyler Marsh": "타일러 마시",
  "Sydney Johnson": "시드니 존슨",
  "Sonia Raman": "소니아 라만",
  "Rachid Meziane": "라시드 메지안",
  "Karl Smesko": "칼 스메스코",
  "Alex Sarama": "알렉스 사라마",
  "Jose Fernandez": "호세 페르난데스",
  "Lynne Roberts": "린 로버츠",
};

async function fetchMlbManagers(): Promise<Map<string, { name: string; interim: boolean }>> {
  const r = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1", { signal: AbortSignal.timeout(15000) });
  const d = (await r.json()) as { teams?: Array<{ id: number; name: string }> };
  const out = new Map<string, { name: string; interim: boolean }>();
  for (const t of d.teams ?? []) {
    const cr = await fetch(`https://statsapi.mlb.com/api/v1/teams/${t.id}/coaches`, { signal: AbortSignal.timeout(15000) });
    const cd = (await cr.json()) as { roster?: Array<{ jobId?: string; person?: { fullName?: string } }> };
    const mgr = (cd.roster ?? []).find((c) => c.jobId === "MNGR") ?? (cd.roster ?? []).find((c) => c.jobId === "NTRM");
    if (mgr?.person?.fullName) out.set(t.name.toLowerCase(), { name: mgr.person.fullName, interim: mgr.jobId === "NTRM" });
    await new Promise((res) => setTimeout(res, 200));
  }
  return out;
}

// ESPN — 팀 목록 + 팀별 roster 의 coach (NBA·WNBA·NHL). 키 없음.
async function fetchEspnCoaches(sport: string, league: string): Promise<Map<string, string>> {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}`;
  const r = await fetch(`${base}/teams?limit=50`, { signal: AbortSignal.timeout(15000) });
  const d = (await r.json()) as { sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: { id: string; displayName: string } }> }> }> };
  const teams = d.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const out = new Map<string, string>();
  for (const { team } of teams) {
    try {
      const rr = await fetch(`${base}/teams/${team.id}/roster`, { signal: AbortSignal.timeout(15000) });
      const rd = (await rr.json()) as { coach?: Array<{ firstName?: string; lastName?: string }> };
      const c = rd.coach?.[0];
      if (c?.firstName && c?.lastName) out.set(team.displayName.toLowerCase(), `${c.firstName} ${c.lastName}`);
    } catch {}
    await new Promise((res) => setTimeout(res, 200));
  }
  return out;
}

async function haikuTranslate(names: string[]): Promise<Record<string, string>> {
  if (!ANTHROPIC_KEY) { console.warn("⚠️ ANTHROPIC_API_KEY 없음 — MLB 한글명 생략(영문 표기)"); return {}; }
  const prompt =
    `다음 미국 스포츠(MLB·NBA·NHL·WNBA) 감독 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `한국 언론 관용 표기를 따르세요 (예: "Dave Roberts"→데이브 로버츠, "Aaron Boone"→애런 분).\n` +
    `자신없으면 그 entry 제외.\n\n` +
    names.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄만: {"Dave Roberts": "데이브 로버츠"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    const d = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = d.content?.map((c) => c.text ?? "").join("") ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const parsed = JSON.parse(m[0]) as Record<string, string>;
    // 라틴 문자가 남았으면(절반 변환) 해당 entry 폐기
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string" && !/[A-Za-z]/.test(v)));
  } catch (e) {
    console.warn("⚠️ Haiku 변환 실패:", (e as Error).message);
    return {};
  }
}

(async () => {
  const teams = await prisma.team.findMany({
    where: { league: { in: ["KBO", "MLB", "NPB", "NBA", "WNBA", "NHL", "KBL", "WKBL"] } },
    select: { id: true, league: true, name: true },
  });
  const out: Record<string, Entry> = {};
  const misses: string[] = [];

  for (const t of teams.filter((x) => x.league === "KBO")) {
    const ko = KBO[t.name];
    if (ko) out[String(t.id)] = { nameKo: ko, asOf: AS_OF };
  }
  for (const t of teams.filter((x) => x.league === "NPB")) {
    const e = NPB[t.name];
    if (e) out[String(t.id)] = { nameKo: e.nameKo, nameEn: e.nameEn, ...(e.interim ? { interim: true } : {}), asOf: AS_OF };
  }
  for (const t of teams.filter((x) => x.league === "KBL" || x.league === "WKBL")) {
    const ko = KBL_WKBL[t.name];
    if (ko) out[String(t.id)] = { nameKo: ko, asOf: AS_OF };
    else misses.push(`${t.league} ${t.name}`);
  }

  console.log("MLB Stats API 감독 수집 중...");
  const mlbMgrs = await fetchMlbManagers();
  // ESPN — WNBA 는 우리 팀명이 "... W" 접미라 매칭 전에 제거
  console.log("ESPN NBA·WNBA·NHL 감독 수집 중...");
  const espn: Record<string, Map<string, string>> = {
    NBA: await fetchEspnCoaches("basketball", "nba"),
    WNBA: await fetchEspnCoaches("basketball", "wnba"),
    NHL: await fetchEspnCoaches("hockey", "nhl"),
  };

  const mlbNames = [...new Set([...mlbMgrs.values()].map((m) => m.name))];
  const espnNames = [...new Set(Object.values(espn).flatMap((m) => [...m.values()]))];
  const ko = { ...(await haikuTranslate([...mlbNames, ...espnNames])), ...MANUAL_KO };

  for (const t of teams.filter((x) => x.league === "MLB")) {
    const mgr = mlbMgrs.get(t.name.toLowerCase());
    if (!mgr) { misses.push(`MLB ${t.name}`); continue; }
    out[String(t.id)] = { nameKo: ko[mgr.name] || mgr.name, nameEn: mgr.name, ...(mgr.interim ? { interim: true } : {}), asOf: AS_OF };
  }
  for (const league of ["NBA", "WNBA", "NHL"] as const) {
    for (const t of teams.filter((x) => x.league === league)) {
      const key = (league === "WNBA" ? t.name.replace(/ W$/, "") : t.name).toLowerCase();
      const name = espn[league].get(key);
      if (!name) { misses.push(`${league} ${t.name}`); continue; }
      out[String(t.id)] = { nameKo: ko[name] || name, nameEn: name, asOf: AS_OF };
    }
  }

  // 이벤트성 행(올스타·TBD·NBA 프리시즌 외국팀 등)은 사전·API 목록에 없어 매칭 실패로 남는다 — 정상
  const counts: Record<string, number> = {};
  for (const t of teams) if (out[String(t.id)]) counts[t.league] = (counts[t.league] ?? 0) + 1;
  console.log(`✅ ${OUT} —`, Object.entries(counts).map(([l, c]) => `${l} ${c}`).join(", "));
  if (misses.length) console.warn("⚠️ 매칭 실패:", misses.join(", "));
  const untranslated = Object.values(out).filter((e) => /[A-Za-z]/.test(e.nameKo));
  if (untranslated.length) console.warn("⚠️ 한글 미변환:", untranslated.map((e) => e.nameKo).join(", "));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  await prisma.$disconnect();
})();
