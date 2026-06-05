// TheSports language type=5 공식 한글 → FOOTBALL 선수 nameKo 교체 (공식 우선, 없으면 기존 haiku 유지).
// worker 가 fetch 한 /tmp/lang-player-ko.jsonl ({id, ko} JSONL) 을 읽어 우리 선수와 매칭.
// 공식 name_ko 노이즈 정규화: 영문/이니셜 혼합 거부, "성, 이름" 콤마 역순 교정.
//   dry-run: npx tsx --env-file=.env.local scripts/apply-thesports-official-korean.ts
//   apply:   ... --apply
// mac mini 공식 한글 봇(daily-official-korean)이 매일 새벽 호출.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

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
    const off = normalize(raw);
    if (!off) { rejected++; continue; }
    if (p.nameKo === off) { same++; continue; }
    if (!p.nameKo) newly++; else diff++;
    updates.push({ id: p.id, ko: off });
  }
  console.log(`매칭=${matched}/${ours.length} (${(matched / ours.length * 100).toFixed(1)}%) | 동일=${same} 교체=${diff} 신규=${newly} 노이즈거부=${rejected} 미매칭=${ours.length - matched}`);
  console.log(`업데이트 대상=${updates.length}`);

  if (!APPLY) { console.log("[DRY-RUN] --apply 로 적용"); await prisma.$disconnect(); return; }

  let done = 0;
  for (const u of updates) {
    await prisma.theSportsPlayer.update({ where: { id: u.id }, data: { nameKo: u.ko } });
    if (++done % 500 === 0) console.log("  updated", done);
  }
  console.log("APPLY DONE", done);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
