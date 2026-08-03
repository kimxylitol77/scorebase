// NPB 선수 한국어 음역 — 시즌 리더보드·스코어 표시용.
// 사전 자체는 npb-name-dict 가 단일 진실 (선발 투수 경로와 공유). 여기는 조회 규칙만 갖는다.
// 매핑 없으면 jpPitcherToKorean 의 성 매핑 시도, 그것도 없으면 원어 그대로.

import { jpPitcherToKorean } from "./npb-starters";
import { NPB_PLAYER_KO } from "./npb-name-dict";
import { kanaToKorean } from "./kana-to-korean";
import rosters from "../../../data/baseball-rosters.json";
import kanaDict from "../../../data/npb-player-kana.json";

// 한자 풀네임 → 카나. 이 경로(시즌스탯·스코어)는 pid 없이 한자 이름만 들고 오는데,
//   카나 사전은 pid 키라 그대로는 못 쓴다. 로스터(pid ↔ 한자)를 다리로 역인덱스를 만든다.
//   수동 사전은 165명뿐이라 나머지 480명이 한자 원문으로 새어 나갔다
//   (2026-08-03 武内　夏暉 실측 — 로스터 경로는 이미 "타케우치 나츠키" 로 맞게 나왔다).
//   동명이인은 어느 pid 인지 못 가리므로 넣지 않는다 — 틀린 한글보다 원문이 낫다.
const KANA_BY_KANJI: Record<string, string> = (() => {
  const K = kanaDict as Record<string, string>;
  const seen: Record<string, string | null> = {};
  for (const [teamId, players] of Object.entries(rosters as Record<string, { id: string; name: string }[]>)) {
    if (Number(teamId) < 23329) continue; // NPB 12팀만 (KBO=3813~3822)
    for (const p of players) {
      const key = p.name.replace(/[\s　]+/g, "");
      if (!key) continue;
      const kana = K[p.id];
      if (seen[key] !== undefined && seen[key] !== (kana ?? null)) {
        seen[key] = null; // 동명이인 — 모호로 표시
        continue;
      }
      seen[key] = kana ?? null;
    }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(seen)) if (v) out[k] = v;
  return out;
})();


/**
 * NPB 일본 선수명 → 한국 음역.
 *   1) 풀네임 (全角 공백 제거 후) 직접 매핑
 *   2) 카타카나 풀네임이면 kanaToKorean 으로 자동 음역
 *   3) 매핑 없는 한자는 jpPitcherToKorean 으로 성 매핑 시도 (성만 알려도 표시 OK)
 *   4) 그래도 미매핑이면 원어 그대로
 */
export function npbPlayerToKorean(jpName: string): string {
  const trimmed = jpName.trim();
  if (!trimmed) return trimmed;
  // 全角/半角 공백 제거 (PITCHER_NAME_KO 는 공백 없는 형식 위주)
  const compact = trimmed.replace(/[\s　]+/g, "");
  const direct = NPB_PLAYER_KO[compact];
  if (direct) return direct;
  // 카타카나/히라가나만 — 자동 음역
  if (/^[぀-ゟ゠-ヿー・\s]+$/.test(compact)) {
    const ko = kanaToKorean(compact);
    if (ko && ko !== compact) return ko;
  }
  // 한자 풀네임 → 로스터 역인덱스로 카나를 찾아 음역 (pid 경로와 같은 결과가 나온다).
  //   성만 맞추는 아래 폴백보다 정확하므로 먼저 시도한다.
  const kana = KANA_BY_KANJI[compact];
  if (kana) {
    // 로마자 병기("ホセ・キハダ　(JOSE QUIJADA)") 는 괄호 이하 제거 후 음역
    const ko = kanaToKorean(kana).replace(/\s*[（(].*$/, "").trim();
    if (ko && /[가-힣]/.test(ko) && !/[぀-ヿ㐀-鿿]/.test(ko)) return ko;
  }
  // 한자 성만 알면 — 성+이름 토큰 분리 시도
  // 일본 한자 이름은 보통 성 2자 + 이름 2~3자. 첫 2자/1자 순으로 성 매핑.
  // 단일 글자 토큰 (柳·達 등) 도 지원하기 위해 전체 토큰부터 시도.
  const koFull = jpPitcherToKorean(compact);
  if (koFull !== compact) return koFull;
  if (compact.length >= 2) {
    const surname2 = compact.slice(0, 2);
    const ko2 = jpPitcherToKorean(surname2);
    if (ko2 !== surname2) return ko2;
    const surname1 = compact.slice(0, 1);
    const ko1 = jpPitcherToKorean(surname1);
    if (ko1 !== surname1) return ko1;
  }
  return trimmed;
}
