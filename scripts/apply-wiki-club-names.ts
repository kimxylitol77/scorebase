// 클럽 위키 문서에서 추출한 (영문, 한글) 쌍을 TheSportsPlayer 에 적용 + 잠금.
//   npx tsx --env-file=.env.local scripts/apply-wiki-club-names.ts <pairs.json> [--apply]
// pairs.json: { "club": "아스널", "pairs": [{ "en": "Bukayo Saka", "ko": "부카요 사카" }, ...] }
// 매칭: 전체 FOOTBALL 선수에서 정규화(소문자·발음기호 제거) 이름 유일 일치만 적용.
//   - 동명이인(2명+) → 보류(ambiguous), 미존재 → 보류(notfound), 이미 일치 → same.
// 적용분은 data/player-ko-locks.json 잠금(공식명 봇·위키 재동기 덮어쓰기 방지).
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const file = process.argv[2];
const LOCKS_PATH = path.resolve(__dirname, "../data/player-ko-locks.json");

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 발음기호 제거
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  if (!file) { console.error("사용법: <pairs.json> [--apply]"); process.exit(1); }
  const { club, pairs } = JSON.parse(readFileSync(file, "utf8")) as { club: string; pairs: { en: string; ko: string }[] };
  const locks: Record<string, { en: string; ko: string }> = existsSync(LOCKS_PATH)
    ? JSON.parse(readFileSync(LOCKS_PATH, "utf8"))
    : {};

  // 전체 FOOTBALL 선수 1회 로드 → 정규화 인덱스 (41k — 메모리 무방)
  const all = await prisma.theSportsPlayer.findMany({
    where: { sport: "FOOTBALL" },
    select: { id: true, name: true, nameKo: true },
  });
  const idx = new Map<string, { id: string; name: string; nameKo: string | null }[]>();
  for (const p of all) {
    const k = norm(p.name);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k)!.push(p);
  }

  let same = 0, ambiguous = 0, notfound = 0, locked = 0;
  const changes: { id: string; en: string; from: string | null; to: string }[] = [];
  for (const pr of pairs) {
    const ko = pr.ko.trim();
    if (!/^[가-힣][가-힣\s·-]*$/.test(ko)) continue; // 순한글 아니면 무시(추출 노이즈)
    const cands = idx.get(norm(pr.en)) ?? [];
    if (cands.length === 0) { notfound++; continue; }
    if (cands.length > 1) { ambiguous++; console.log(`  동명 보류: ${pr.en} (${cands.length}명)`); continue; }
    const p = cands[0];
    if (locks[p.id] && locks[p.id].ko !== ko) { locked++; continue; } // 확정 잠금 우선
    if (p.nameKo === ko) { same++; continue; }
    changes.push({ id: p.id, en: p.name, from: p.nameKo, to: ko });
  }

  console.log(`[${club}] 쌍 ${pairs.length} → 교정 ${changes.length} / 동일 ${same} / 동명보류 ${ambiguous} / 미존재 ${notfound} / 잠금유지 ${locked}`);
  for (const c of changes) console.log(`  ${c.en}: "${c.from}" → "${c.to}"`);

  if (!APPLY) { console.log("[DRY-RUN] --apply 로 적용"); await prisma.$disconnect(); return; }

  for (const c of changes) {
    await prisma.theSportsPlayer.update({ where: { id: c.id }, data: { nameKo: c.to } });
    locks[c.id] = { en: c.en, ko: c.to };
  }
  writeFileSync(LOCKS_PATH, JSON.stringify(locks, null, 1) + "\n");
  console.log(`적용 ${changes.length}건 + 잠금 (총 ${Object.keys(locks).length}명)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
