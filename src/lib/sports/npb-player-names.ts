// NPB 선수 한국어 음역 — 시즌 리더보드·스코어 표시용.
// 사전 자체는 npb-name-dict 가 단일 진실 (선발 투수 경로와 공유). 여기는 조회 규칙만 갖는다.
// 매핑 없으면 jpPitcherToKorean 의 성 매핑 시도, 그것도 없으면 원어 그대로.

import { jpPitcherToKorean } from "./npb-starters";
import { NPB_PLAYER_KO } from "./npb-name-dict";
import { kanaToKorean } from "./kana-to-korean";


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
