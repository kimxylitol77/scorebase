// 감독 한글 이름 정본(data/coach-name-canon.json)을 기준으로 감독 데이터 파일들의 표기를 맞춘다.
// 표기를 고칠 때는 정본 파일 한 곳만 고치고 이 스크립트를 돌린다. --check 는 고치지 않고 어긋남만 센다(있으면 exit 1).
//   npx tsx scripts/sync-coach-names.ts [--check]
import { readFileSync, writeFileSync, existsSync } from "fs";
import { applyCanon, absorbInto, type CoachFiles } from "../src/lib/coach-name-canon";

const CANON = "data/coach-name-canon.json";
const FILES = {
  teamCoaches: "data/team-coaches.json",
  coachPhotos: "data/coach-photos.json",
  coachNames: "data/coach-names.json",
  coachCareers: "data/coach-careers.json",
} as const;
// 각 파일을 쓰는 빌더와 같은 형식으로 저장해야 diff 가 표기 변경만 남는다
const INDENT: Record<keyof typeof FILES, number | undefined> = { teamCoaches: undefined, coachPhotos: 1, coachNames: 2, coachCareers: undefined };

const check = process.argv.includes("--check");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const canon: Record<string, string> = existsSync(CANON) ? read(CANON) : {};
const files = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)])) as unknown as CoachFiles;

const added = absorbInto(canon, files);
const changed = applyCanon(canon, files);
const total = Object.values(changed).reduce((a, b) => a + b, 0);
console.log(`정본 ${Object.keys(canon).length}명 (신규 ${added}) · 맞춘 표기 ${total}건 ${JSON.stringify(changed)}`);

if (check) {
  if (total > 0 || added > 0) process.exit(1);
} else {
  const sorted = Object.fromEntries(Object.entries(canon).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(CANON, JSON.stringify(sorted, null, 1));
  for (const [k, p] of Object.entries(FILES) as [keyof typeof FILES, string][]) {
    if (changed[k] === 0) continue;
    // coach-names.json 은 빌더가 한 줄에 한 명씩 들여쓰기 없이 쓴다 — 같은 형식으로
    const text = k === "coachNames"
      ? `{\n${Object.entries(files.coachNames).map(([id, ko]) => `${JSON.stringify(id)}: ${JSON.stringify(ko)}`).join(",\n")}\n}`
      : JSON.stringify(files[k], null, INDENT[k]);
    writeFileSync(p, text);
  }
}
