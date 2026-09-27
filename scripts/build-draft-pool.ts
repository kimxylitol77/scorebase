// 블라인드 드래프트 선수-시즌 풀 빌드 — 리그별 빌더(scripts/draft-pool/*)를 돌려 data/draft-pool-{mode}.json 을 만든다.
//   원본 응답은 OS 임시 폴더에 캐시한다(다시 돌리면 네트워크 없이 끝남). 기여도·기준선 규칙은 docs/hoop-draft/context-notes.md.
//   실행: npx tsx --env-file=.env.local scripts/build-draft-pool.ts [nba|kbl|mlb|kbo|epl|kleague ...]   (인자 없으면 전부)
import { isDraftMode, type DraftMode } from "../src/lib/draft/modes";
import { buildKbl, buildNba } from "./draft-pool/basketball";
import { finalize, type Built } from "./draft-pool/common";
import { buildKbo } from "./draft-pool/kbo";
import { buildMlb } from "./draft-pool/mlb";
import { buildEpl, buildKleague } from "./draft-pool/soccer-af";

const BUILDERS: Partial<Record<DraftMode, () => Promise<Built>>> = {
  nba: buildNba,
  kbl: buildKbl,
  mlb: buildMlb,
  kbo: buildKbo,
  epl: buildEpl,
  kleague: buildKleague,
};

async function main() {
  const args = process.argv.slice(2).filter(isDraftMode);
  const modes = args.length ? args : (Object.keys(BUILDERS) as DraftMode[]);
  for (const m of modes) {
    const build = BUILDERS[m];
    if (!build) {
      console.warn(`${m}: 빌더가 아직 없습니다`);
      continue;
    }
    finalize(m, await build());
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
