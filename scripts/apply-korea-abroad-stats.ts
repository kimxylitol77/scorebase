// 해외파 선수 데이터를 선수 페이지(/transfers/[id]) 소스에 병합.
//   data/korea-abroad.json → data/player-season-stats.json · data/player-photos.json
//
// 왜 필요한가: 기존 파이프라인(build-ts-af-player-map 등)은 빅5+MLS 유니버스만 돌아서
//   챔피언십·덴마크·세르비아·터키·벨기에·스코틀랜드·포르투갈 소속 한국 선수는 시즌스탯이 통째로 비었다
//   (2026-07-28 실측 9/25). 그 결과 선수 페이지의 레이더 7축·90분당·상세 스탯·백분위가 전부 안 뜬다.
//   해외파 스캔이 af 에서 이미 받아 둔 값을 그대로 옮기므로 **추가 API 호출 0**.
//
// 안전 규칙: 기존 항목은 덮어쓰지 않는다(기존 빌더 산출이 정본). 비어 있는 선수만 채운다.
//   --force 를 주면 해외파 스캔값으로 덮어쓴다.
//
// 실행 순서: build-korea-abroad → link-korea-abroad-players(tsId 확정) → 이 스크립트
//   npx tsx --env-file=.env.local scripts/apply-korea-abroad-stats.ts
import * as fs from "fs";
import * as path from "path";

const DATA = path.join(__dirname, "..", "data");
const KA = path.join(DATA, "korea-abroad.json");
const SEASON = path.join(DATA, "player-season-stats.json");
const PHOTOS = path.join(DATA, "player-photos.json");
const OVERRIDES = path.join(DATA, "player-overrides.json");
const FORCE = process.argv.includes("--force");

interface KaPlayer {
  tsId: string | null;
  nameKo: string;
  photo: string | null;
  seasonStat: Record<string, unknown> | null;
}

function main() {
  const doc = JSON.parse(fs.readFileSync(KA, "utf8")) as { players: KaPlayer[] };
  const season = JSON.parse(fs.readFileSync(SEASON, "utf8")) as Record<string, unknown>;
  const photos = JSON.parse(fs.readFileSync(PHOTOS, "utf8")) as Record<string, string>;

  let statAdd = 0, statSkip = 0, photoAdd = 0, noId = 0;
  for (const p of doc.players) {
    if (!p.tsId) {
      noId++;
      continue;
    }
    if (p.seasonStat) {
      if (!season[p.tsId] || FORCE) {
        season[p.tsId] = p.seasonStat;
        statAdd++;
      } else statSkip++;
    }
    if (p.photo && (!photos[p.tsId] || FORCE)) {
      photos[p.tsId] = p.photo;
      photoAdd++;
    }
  }

  // 한글명 — korea-abroad 쪽은 위키백과로 확정한 값이라 overrides 의 옛 표기보다 정확하다.
  //   (ts 사전엔 "이주현"(→이현주)·"이용준"(→이영준) 처럼 뒤집히거나 다른 표기가 남아 있다)
  const ov = JSON.parse(fs.readFileSync(OVERRIDES, "utf8")) as Record<string, { nameKo?: string }>;
  let nameFix = 0;
  for (const p of doc.players) {
    if (!p.tsId || !/[가-힣]/.test(p.nameKo)) continue;
    if (ov[p.tsId]?.nameKo === p.nameKo) continue;
    ov[p.tsId] = { ...(ov[p.tsId] ?? {}), nameKo: p.nameKo };
    nameFix++;
  }
  fs.writeFileSync(OVERRIDES, JSON.stringify(ov));

  fs.writeFileSync(SEASON, JSON.stringify(season, null, 2));
  fs.writeFileSync(PHOTOS, JSON.stringify(photos, null, 2));
  console.log(`시즌스탯 +${statAdd} (기존 유지 ${statSkip}) · 사진 +${photoAdd} · 한글명 교정 ${nameFix} · tsId 없어 건너뜀 ${noId}`);
  console.log(`player-season-stats.json ${Object.keys(season).length}건 · player-photos.json ${Object.keys(photos).length}건`);
}

main();
