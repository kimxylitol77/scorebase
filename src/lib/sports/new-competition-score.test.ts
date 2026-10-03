// 신규 대회 후보 점수 — 한국 관련 최우선, 유소년·여자는 한국 관련일 때만, 대표팀 대회 가산
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMinorCompetition, rankCandidates, type CompetitionCandidate } from "./new-competition-score";

const c = (name: string, matches: number, extra: Partial<CompetitionCandidate> = {}): CompetitionCandidate => ({ source: "af", id: name, name, country: "X", matches, korea: [], national: false, ...extra });

test("유소년·여자·2군 판별", () => {
  for (const n of ["UEFA U17 Championship", "AFC U-20 Asian Cup", "Primera Division Women", "Liga MX Femenil", "Bundesliga II", "Premier League 2 Reserve", "CA U17W C"]) assert.ok(isMinorCompetition(n), n);
  for (const n of ["Asian Games", "Primera Division", "Liga I", "Premier League"]) assert.ok(!isMinorCompetition(n), n);
});

test("한국 관련이 맨 앞, 유소년은 한국 관련일 때만 남는다", () => {
  const r = rankCandidates([
    c("Big League", 40),
    c("AFC U-20 Asian Cup", 20, { korea: ["대표팀 South Korea U20"], national: true }),
    c("UEFA U17 Championship", 30),
    c("Gulf Cup", 10, { national: true }),
    c("Some Cup", 5, { korea: ["해외파 백승호(Birmingham)"] }),
  ]);
  assert.deepEqual(r.map((x) => x.name), ["Some Cup", "AFC U-20 Asian Cup", "Gulf Cup", "Big League"]);
});
