// TheSports language type=5 공식 한글 → FOOTBALL 선수 nameKo 교체 (공식 우선, 없으면 기존 haiku 유지).
// worker 가 fetch 한 /tmp/lang-player-ko.jsonl ({id, ko} JSONL) 을 읽어 우리 선수와 매칭.
// 공식 name_ko 노이즈 정규화: 영문/이니셜 혼합 거부, "성, 이름" 콤마 역순 교정.
//   dry-run: npx tsx --env-file=.env.local scripts/apply-thesports-official-korean.ts
//   apply:   ... --apply
// mac mini 공식 한글 봇(daily-official-korean)이 매일 새벽 호출.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { deReverseKoreanName } from "../src/lib/korean-name-order";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const JSONL = process.env.LANG_JSONL || "/tmp/lang-player-ko.jsonl";

// 공식 name_ko 정규화: 영문/이니셜 혼합은 거부(haiku 유지), "성, 이름" 콤마 역순은 교정.
function normalize(raw: string): string | null {
  let s = raw.trim();
  if (/[A-Za-z]/.test(s)) return null; // "Raul Jonas Steffens", "F. 파운데스" 등 거부
  if (s.includes(", ")) {
    const parts = s.split(", ");
    if (parts.length === 2) s = `${parts[1]} ${parts[0]}`.trim(); // "산초, 제이든" → "제이든 산초"
  }
  if (!s || !/[가-힣]/.test(s)) return null;
  return s;
}

async function main() {
  const ours = await prisma.theSportsPlayer.findMany({
    where: { sport: "FOOTBALL" },
    select: { id: true, name: true, nameKo: true },
  });
  const langMap = new Map<string, string>();
  for (const ln of readFileSync(JSONL, "utf8").split("\n")) {
    if (!ln.trim()) continue;
    const o = JSON.parse(ln) as { id: string; ko: string };
    if (o.ko && o.ko.trim()) langMap.set(o.id, o.ko.trim());
  }
  console.log(`our FOOTBALL=${ours.length}, 공식 ko 항목=${langMap.size}`);

  let matched = 0, same = 0, diff = 0, newly = 0, rejected = 0;
  const updates: Array<{ id: string; ko: string }> = [];
  for (const p of ours) {
    const raw = langMap.get(p.id);
    if (!raw) continue;
    matched++;
    const off0 = normalize(raw);
    if (!off0) { rejected++; continue; }
    const off = deReverseKoreanName(off0, p.name); // 공식 ko 가 "흥민 손" 처럼 뒤집힌 경우 "손흥민" 으로 교정
    if (p.nameKo === off) { same++; continue; }
    if (!p.nameKo) newly++; else diff++;
    updates.push({ id: p.id, ko: off });
  }
  console.log(`매칭=${matched}/${ours.length} (${(matched / ours.length * 100).toFixed(1)}%) | 동일=${same} 교체=${diff} 신규=${newly} 노이즈거부=${rejected} 미매칭=${ours.length - matched}`);
  console.log(`업데이트 대상=${updates.length}`);

  // market value 선수 보강: PlayerMarketValue 에 있으나 TheSportsPlayer 에 없는 선수를 공식 한글로 추가.
  // (TheSportsPlayer 는 라인업 출전 선수 기반 → 몸값 데이터의 비출전 선수는 /transfers 에서 "선수" placeholder 로 떴음)
  const ourIds = new Set(ours.map((p) => p.id));
  const marketRows = await prisma.playerMarketValue.findMany({ select: { id: true } });
  const toAdd: Array<{ id: string; ko: string }> = [];
  for (const m of marketRows) {
    if (ourIds.has(m.id)) continue;
    const raw = langMap.get(m.id);
    if (!raw) continue;
    const ko = normalize(raw);
    if (!ko) continue;
    toAdd.push({ id: m.id, ko });
  }
  console.log(`market 보강 대상(TheSportsPlayer 신규)=${toAdd.length}`);

  if (!APPLY) { console.log("[DRY-RUN] --apply 로 적용"); await prisma.$disconnect(); return; }

  let done = 0;
  for (const u of updates) {
    await prisma.theSportsPlayer.update({ where: { id: u.id }, data: { nameKo: u.ko } });
    if (++done % 500 === 0) console.log("  updated", done);
  }
  console.log("라인업 nameKo 교체 DONE", done);

  // createMany 일괄 insert (개별 upsert 루프는 Neon 연결 소진 유발). market 보강은 신규 전용 = skipDuplicates.
  if (toAdd.length) {
    const res = await prisma.theSportsPlayer.createMany({
      data: toAdd.map((t) => ({ id: t.id, name: t.ko, nameKo: t.ko, sport: "FOOTBALL" })),
      skipDuplicates: true,
    });
    console.log("market 보강 createMany 추가:", res.count);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
