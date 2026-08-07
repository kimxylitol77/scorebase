// 북유럽 hj/kj/sj 오음역 audit — 영문 name 이 복구된 뒤에야 가능해진 검사(2026-08-07).
//   스칸디나비아어(노르웨이·덴마크·스웨덴·아이슬란드)는 **hj 의 h 가 묵음**이다(Hjalmar → 얄마르).
//   TheSports 공식 name_ko 는 이걸 영어식으로 읽어 "힐데·휼만드·흐줄사게르" 류 오기를 대량 생산했다.
//
//   ⚠️ 같은 철자라도 언어권이 다르면 규칙이 정반대다 — Gj/Hj 는 알바니아(ALB)·마케도니아(MKD)·
//   세르비아(SRB) 이름에도 흔하고 거긴 h 가 묵음이 아니다. 그래서 **국적으로 먼저 가른다**.
//
//   1단계(--scan): 대상 추출 + TheSports API 로 국적 확보 → data 파일 없이 JSON 출력
//   2단계(--wiki): en위키 ko langlink 로 정본 조회 (있으면 그게 답)
//   3단계(--haiku): 위키에 없는 선수만 언어 규칙 명시 프롬프트로 음역 + 기계 검증
//   적용은 --apply (DB nameKo + data/player-ko-locks.json 등재)
//
//   실행: npx tsx --env-file=.env.local scripts/audit-nordic-player-names.ts --scan --wiki --haiku
//         ... --apply
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const DO_WIKI = process.argv.includes("--wiki");
const DO_HAIKU = process.argv.includes("--haiku");
const PACE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOCKS_PATH = new URL("../data/player-ko-locks.json", import.meta.url).pathname;
// 조회 결과 캐시(국적·위키·haiku). 재실행 시 이어가려고 두는 임시 파일 — 커밋하지 않는다.
const CACHE_PATH = new URL("../data/_nordic-audit-cache.json", import.meta.url).pathname;

// ⚠️ hj 묵음은 **아이슬란드어에 적용되지 않는다** — 아이슬란드어 hj 는 /ç/ 라 h 가 살아 있다.
//   ko위키 정본 `Hjörtur Hermannsson → 히외르튀르` 가 그 증거고, ISL 선수 5명 전부 h 를 살린
//   표기가 정상이다. 그래서 규칙 기반 교정은 NOR·DEN·SWE·FRO 로 한정한다(FIN 도 판단 보류).
const HJ_SILENT = new Set(["NOR", "DEN", "SWE", "FRO"]);

interface Row {
  id: string;
  en: string;
  ko: string;
  nat?: string;
  wikiKo?: string | null;
  haikuKo?: string | null;
}

async function fetchNationality(uuid: string): Promise<string | null> {
  const url = new URL("https://api.thesports.com/v1/football/player/with_stat/list");
  url.searchParams.set("user", process.env.THESPORTS_USER ?? "");
  url.searchParams.set("secret", process.env.THESPORTS_SECRET ?? "");
  url.searchParams.set("uuid", uuid);
  const d = (await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()) as {
    code: number;
    results?: Array<{ nationality?: string }>;
  };
  if (d.code !== 0) throw new Error(`code=${d.code}`);
  return d.results?.[0]?.nationality?.trim() || null;
}

// UA 없는 요청은 Wikipedia 가 막는다 — 없으면 전건 조용히 null 이 된다(2026-08-07 실측).
const WIKI_UA = "scorebase-bot/1.0 (+https://scorebase.kr)";

/** en위키 표제어 → ko langlink. 하위리그 선수는 대개 문서가 없어 null 이 정상. */
async function fetchWikiKo(enName: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", enName);
  url.searchParams.set("prop", "langlinks");
  url.searchParams.set("lllang", "ko");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  const d = (await (
    await fetch(url, { headers: { "User-Agent": WIKI_UA }, signal: AbortSignal.timeout(15000) })
  ).json()) as {
    query?: { pages?: Record<string, { langlinks?: Array<{ "*": string }> }> };
  };
  for (const page of Object.values(d.query?.pages ?? {})) {
    const ko = page.langlinks?.[0]?.["*"];
    if (ko) return ko.replace(/\s*\([^)]*\)\s*$/, "").trim(); // "무릴루 (2002년)" 동음이의 꼬리 제거
  }
  return null;
}

const LANG_NAME: Record<string, string> = {
  NOR: "노르웨이어", DEN: "덴마크어", SWE: "스웨덴어",
  ISL: "아이슬란드어", FIN: "핀란드어", FRO: "페로어",
};

async function haikuTransliterate(rows: Row[]): Promise<Map<string, string>> {
  const key = process.env.ANTHROPIC_API_KEY;
  const out = new Map<string, string>();
  if (!key || !rows.length) return out;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const list = batch.map((r) => `${r.en} (${LANG_NAME[r.nat ?? ""] ?? "북유럽어"})`).join("\n");
    const prompt =
      `다음 축구 선수 이름을 한국 스포츠 미디어 표기(한글)로 옮겨라. 전부 북유럽 선수다.\n\n` +
      `반드시 지킬 규칙.\n` +
      `1. hj 의 h 는 소리나지 않고 j 는 살아 반모음이 된다. Hjalmar→얄마르, Hjelde→옐데,\n` +
      `   Hjulmand→율만, Hjörvarsson→요르바르손, Hjalte→얄테.\n` +
      `   즉 "하/히/휼" 로 시작하면 틀렸고, j 를 통째로 버린 "알테·아르마르" 도 똑같이 틀렸다.\n` +
      `2. 노르웨이·스웨덴어 sj·skj 는 "시/셰" 계열. Sjöberg→셰베리.\n` +
      `3. 노르웨이·스웨덴어 kj 는 "시/셰" 계열, 덴마크어 kj 는 "키" 계열.\n` +
      `4. u 는 독일어 ü 가 아니다. Fuhr→푸르.\n` +
      `5. 덴마크어 어말 -sen 은 "센", 노르웨이어 -son 은 "손".\n\n` +
      `이름 목록.\n${list}\n\n` +
      `JSON 만 출력. { "영문 이름": "한글 이름" } 형식. 설명·코드펜스 금지.`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    const j = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
    if (j.error) {
      console.log("  haiku 오류:", j.error.message);
      continue;
    }
    const text = (j.content?.[0]?.text ?? "").replace(/^```(?:json)?|```$/gm, "").trim();
    try {
      const parsed = JSON.parse(text) as Record<string, string>;
      for (const r of batch) if (parsed[r.en]) out.set(r.id, parsed[r.en].trim());
    } catch {
      console.log("  haiku JSON 파싱 실패 (배치 건너뜀)");
    }
    console.log(`  haiku ${Math.min(i + 25, rows.length)}/${rows.length}`);
  }
  return out;
}

async function main() {
  // 캐시 재사용 — API·위키 조회는 느리므로 --scan 결과를 파일로 남기고 재실행 시 이어간다.
  let rows: Row[] = [];
  try {
    rows = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Row[];
    console.log(`캐시 로드 ${rows.length}건`);
  } catch {
    const raw = await prisma.$queryRawUnsafe<Array<{ id: string; en: string; ko: string }>>(
      `select id, name en, "nameKo" ko from "TheSportsPlayer"
       where sport='FOOTBALL' and "nameKo" is not null and name ~ '(^| )(Hj|Kj|Sj|Gj|Skj)'
       order by name`,
    );
    console.log(`대상 후보 ${raw.length}건 — 국적 조회 시작 (${PACE_MS}ms 페이스)`);
    for (const [i, r] of raw.entries()) {
      let nat: string | null = null;
      try {
        nat = await fetchNationality(r.id);
      } catch (e) {
        console.log(`  국적 실패 ${r.en}:`, e instanceof Error ? e.message : e);
      }
      rows.push({ ...r, nat: nat ?? undefined });
      if ((i + 1) % 25 === 0) console.log(`  국적 ${i + 1}/${raw.length}`);
      await sleep(PACE_MS);
    }
    writeFileSync(CACHE_PATH, JSON.stringify(rows, null, 1));
  }

  // 규칙 교정 대상은 hj 묵음 언어권만. 위키 정본은 언어 판단이 필요 없어 전건에 적용한다.
  const ruleTargets = rows.filter((r) => r.nat && HJ_SILENT.has(r.nat));
  console.log(`\n규칙 교정 대상(NOR·DEN·SWE·FRO) ${ruleTargets.length} / 전체 ${rows.length}`);
  const byNat = new Map<string, number>();
  for (const r of rows) byNat.set(r.nat ?? "미상", (byNat.get(r.nat ?? "미상") ?? 0) + 1);
  console.log("  국적 분포:", Object.fromEntries([...byNat].sort((a, b) => b[1] - a[1])));

  if (DO_WIKI) {
    const todo = rows.filter((r) => r.wikiKo === undefined);
    console.log(`\n위키 조회 ${todo.length}건`);
    for (const [i, r] of todo.entries()) {
      try {
        r.wikiKo = await fetchWikiKo(r.en);
      } catch {
        r.wikiKo = null;
      }
      if ((i + 1) % 25 === 0) console.log(`  위키 ${i + 1}/${todo.length}`);
      await sleep(200);
    }
    writeFileSync(CACHE_PATH, JSON.stringify(rows, null, 1));
    console.log(`  위키 표제어 확보 ${rows.filter((r) => r.wikiKo).length}건`);
  }

  if (DO_HAIKU) {
    const todo = ruleTargets.filter((r) => !r.wikiKo && r.haikuKo === undefined);
    console.log(`\nhaiku 음역 ${todo.length}건`);
    const got = await haikuTransliterate(todo);
    for (const r of todo) r.haikuKo = got.get(r.id) ?? null;
    writeFileSync(CACHE_PATH, JSON.stringify(rows, null, 1));
  }

  // hj 로 시작하는 영문 토큰과 같은 자리의 한글 토큰이 ㅎ 로 시작하면 규칙 위반이다.
  // (전체 이름을 훑으면 "요르투르 헤르만손" 의 헤르만손 때문에 오탐한다 — 자리를 맞춰 본다.)
  // ⚠️ 범위는 반드시 [하-힣] — [하-히] 는 받침 있는 ㅎ 음절(힐·혤·휼)을 놓쳐 "힐테"가 통과한다.
  function hjViolation(en: string, ko: string): boolean {
    const et = en.split(/\s+/), kt = ko.split(/\s+/);
    if (et.length !== kt.length) return /^Hj/i.test(et[et.length - 1]) && /^[하-힣]/.test(kt[kt.length - 1] ?? "");
    return et.some((t, i) => /^Hj/i.test(t) && /^[하-힣]/.test(kt[i] ?? ""));
  }

  // 적용 방침 — 위키 정본은 무조건 채택. 위키가 없으면 **현재 값이 hj 규칙을 명백히 위반할 때만**
  // haiku 값을 쓴다. 위반이 아닌데 haiku 가 손보자는 Kj·Sj 미세조정은 개악 위험이 커서 버린다
  // (실측: "얄테 기츠"(정상) → "알테 기츠"(j 탈락) 같은 역행이 섞여 나왔다).
  const proposals: Array<{ id: string; en: string; from: string; to: string; src: string }> = [];
  const rejected: Array<{ en: string; to: string; why: string }> = [];
  const skipped: Array<{ en: string; from: string; to: string }> = [];
  for (const r of rows) {
    const to = (r.wikiKo || r.haikuKo || "").trim();
    const src = r.wikiKo ? "위키" : "haiku";
    if (!to || to === r.ko) continue;
    if (!/^[가-힣][가-힣 ·]*$/.test(to)) {
      rejected.push({ en: r.en, to, why: "한글 외 문자" });
      continue;
    }
    let final = to;
    if (src === "haiku") {
      if (!hjViolation(r.en, r.ko)) {
        skipped.push({ en: r.en, from: r.ko, to });
        continue;
      }
      // haiku 는 같은 입력에도 나머지 토큰을 매번 다르게 낸다(Andrew → 앤드루/안드레).
      // 목적은 hj 규칙 위반 교정이므로 **위반 토큰만** 갈아끼우고 나머지는 현행을 유지한다.
      const et = r.en.split(/\s+/), kt = r.ko.split(/\s+/), ht = to.split(/\s+/);
      if (et.length === kt.length && et.length === ht.length) {
        final = kt.map((k, i) => (/^Hj/i.test(et[i]) ? ht[i] : k)).join(" ");
      }
      if (final === r.ko) {
        skipped.push({ en: r.en, from: r.ko, to });
        continue;
      }
      if (hjViolation(r.en, final)) {
        rejected.push({ en: r.en, to: final, why: "교정값도 hj 규칙 위반" });
        continue;
      }
    }
    proposals.push({ id: r.id, en: r.en, from: r.ko, to: final, src });
  }

  console.log(`\n=== 교정 제안 ${proposals.length}건 ===`);
  for (const p of proposals) console.log(`  ${p.from.padEnd(18)} → ${p.to.padEnd(18)} [${p.src}] ${p.en}`);
  if (rejected.length) {
    console.log(`\n=== 기계 검증 거부 ${rejected.length}건 (손대지 않음) ===`);
    for (const r of rejected) console.log(`  ${r.en} → ${r.to}  (${r.why})`);
  }
  if (skipped.length) {
    console.log(`\n=== 규칙 위반 아님 → 손대지 않음 ${skipped.length}건 (haiku 제안은 참고용) ===`);
    for (const s of skipped) console.log(`  ${s.from.padEnd(18)} (haiku 제안: ${s.to})  ${s.en}`);
  }
  const unchanged = rows.length - proposals.length - rejected.length - skipped.length;
  console.log(
    `\n동일 ${unchanged} · 적용 ${proposals.length} · 보류 ${skipped.length} · 거부 ${rejected.length}`,
  );

  if (!APPLY) {
    console.log("\n[DRY-RUN] --apply 로 적용 (DB nameKo + locks 등재)");
    await prisma.$disconnect();
    return;
  }

  for (let i = 0; i < proposals.length; i += 20) {
    const batch = proposals.slice(i, i + 20);
    await prisma.$transaction(
      batch.map((p) => prisma.theSportsPlayer.update({ where: { id: p.id }, data: { nameKo: p.to } })),
    );
  }
  console.log(`DB nameKo 적용 ${proposals.length}건`);

  // locks 등재 — 공식명 봇·위키 재동기가 되돌리지 못하게 고정. indent 1 유지(diff 번짐 방지).
  const locks = JSON.parse(readFileSync(LOCKS_PATH, "utf8")) as Record<string, { en: string; ko: string }>;
  for (const p of proposals) locks[p.id] = { en: p.en, ko: p.to };
  writeFileSync(LOCKS_PATH, JSON.stringify(locks, null, 1) + "\n");
  console.log(`locks 등재 완료 (총 ${Object.keys(locks).length})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
