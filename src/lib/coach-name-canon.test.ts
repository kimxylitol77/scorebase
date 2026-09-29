// 감독 이름 정본 단위 테스트 + 저장소 데이터가 정본과 어긋나지 않는지 확인
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { absorbInto, applyCanon, type CoachFiles } from "./coach-name-canon";

const files = (): CoachFiles => ({
  teamCoaches: { t1: { name: "Enzo Maresca", nameKo: "엔조 마레스카" }, t2: { name: "Hong Myung-bo", nameKo: null } },
  coachPhotos: { c1: { name: "Enzo Maresca", nameKo: "엔초 마레스카" }, c2: { name: "Régis Le Bris", nameKo: "레지스 르브리" }, c3: { name: "José Mourinho" } },
  coachNames: { c3: "주제 무리뉴" },
  coachCareers: { c1: { nameKo: "엔조 마레스카" }, c2: {} },
});

test("정본이 있으면 모든 파일이 그 표기를 따른다", () => {
  const f = files();
  const n = applyCanon({ "Enzo Maresca": "엔초 마레스카" }, f);
  assert.equal(f.teamCoaches.t1.nameKo, "엔초 마레스카");
  assert.equal(f.coachCareers.c1.nameKo, "엔초 마레스카");
  assert.deepEqual(n, { teamCoaches: 1, coachPhotos: 0, coachNames: 0, coachCareers: 1 });
});

test("정본에 없는 감독은 먼저 본 표기를 받아들인다 — 팀 감독 파일 우선", () => {
  const f = files();
  const canon: Record<string, string> = {};
  assert.equal(absorbInto(canon, f), 3);
  assert.equal(canon["Enzo Maresca"], "엔조 마레스카");
  assert.equal(canon["Régis Le Bris"], "레지스 르브리");
  assert.equal(canon["José Mourinho"], "주제 무리뉴"); // 영문 이름은 사진 파일에서 찾는다
  applyCanon(canon, f);
  assert.equal(f.coachPhotos.c1.nameKo, "엔조 마레스카");
  assert.equal(f.coachPhotos.c3.nameKo, "주제 무리뉴");
});

test("이미 정본에 있는 이름은 파일 값으로 바뀌지 않는다", () => {
  const canon = { "Enzo Maresca": "엔초 마레스카" };
  absorbInto(canon, files());
  assert.equal(canon["Enzo Maresca"], "엔초 마레스카");
});

test("경력 파일의 빈 이름 칸은 채우지 않는다", () => {
  const f = files();
  applyCanon({ "Régis Le Bris": "레지스 르브리" }, f);
  assert.equal(f.coachCareers.c2.nameKo, undefined);
});

test("저장소 데이터 — 감독 파일 넷이 정본과 일치한다", () => {
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
  const canon = read("data/coach-name-canon.json") as Record<string, string>;
  const f: CoachFiles = {
    teamCoaches: read("data/team-coaches.json"),
    coachPhotos: read("data/coach-photos.json"),
    coachNames: read("data/coach-names.json"),
    coachCareers: read("data/coach-careers.json"),
  };
  const n = applyCanon(canon, f);
  assert.deepEqual(n, { teamCoaches: 0, coachPhotos: 0, coachNames: 0, coachCareers: 0 }, "어긋나면 npx tsx scripts/sync-coach-names.ts 를 돌린다");
});
