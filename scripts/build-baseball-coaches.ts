// 야구 3리그(KBO·MLB·NPB) 감독 수집 — MLB 는 MLB Stats API(무료 공식) 자동, KBO·NPB 는 검증된 정적 사전
// → data/baseball-coaches.json { ourTeamId: { nameKo, nameEn?, interim?, asOf } }
//
// 팀 페이지 감독 카드용(축구 team-coaches.json 의 야구 버전). 멱등(전체 갱신).
// KBO·NPB 감독 교체 시 아래 사전을 고치고 재실행. MLB 는 재실행만으로 갱신.
// 검증 근거(2026-08-15): KBO=ko.wikipedia+뉴스 교차, NPB=npb.jp 공시+ja.wikipedia 교차.
//
//   npx tsx --env-file=.env.local scripts/build-baseball-coaches.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "baseball-coaches.json");
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

// MLB 감독 한글 표기 고정 사전 — Haiku 표기가 흔들리면 여기 추가
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

async function haikuTranslate(names: string[]): Promise<Record<string, string>> {
  if (!ANTHROPIC_KEY) { console.warn("⚠️ ANTHROPIC_API_KEY 없음 — MLB 한글명 생략(영문 표기)"); return {}; }
  const prompt =
    `다음 MLB 감독 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
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
    where: { league: { in: ["KBO", "MLB", "NPB"] } },
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

  console.log("MLB Stats API 감독 수집 중...");
  const mlbMgrs = await fetchMlbManagers();
  const mlbTeams = teams.filter((x) => x.league === "MLB");
  const mlbNames = [...new Set([...mlbMgrs.values()].map((m) => m.name))];
  const ko = { ...(await haikuTranslate(mlbNames)), ...MANUAL_KO };
  for (const t of mlbTeams) {
    const mgr = mlbMgrs.get(t.name.toLowerCase());
    if (!mgr) { misses.push(`MLB ${t.name}`); continue; }
    out[String(t.id)] = { nameKo: ko[mgr.name] || mgr.name, nameEn: mgr.name, ...(mgr.interim ? { interim: true } : {}), asOf: AS_OF };
  }

  // 이벤트성 행(올스타·Dream/Nanum·Central/Pacific league)은 사전·statsapi 에 없어 자연 제외
  const counts = { KBO: 0, MLB: 0, NPB: 0 } as Record<string, number>;
  for (const t of teams) if (out[String(t.id)]) counts[t.league]++;
  console.log(`✅ ${OUT} — KBO ${counts.KBO}/10, MLB ${counts.MLB}/30, NPB ${counts.NPB}/12`);
  if (misses.length) console.warn("⚠️ 매칭 실패:", misses.join(", "));
  const untranslated = Object.values(out).filter((e) => /[A-Za-z]/.test(e.nameKo));
  if (untranslated.length) console.warn("⚠️ 한글 미변환:", untranslated.map((e) => e.nameKo).join(", "));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  await prisma.$disconnect();
})();
