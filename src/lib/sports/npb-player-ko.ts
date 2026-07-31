// NPB 선수 공식 pid → 한글 표시명. 로스터(baseball-rosters.json)는 한자·가타카나 원문이라
//   그대로 노출하면 "スチュワート・ジュニア" 처럼 읽을 수 없다.
//   build-npb-player-link 가 수집한 카나 사전(pid → kana)을 kanaToKorean 으로 음역해 표시한다.
//   카나 미보유·음역 실패 시 원문 폴백(빈 화면보다 원문이 낫다).
import kanaDict from "../../../data/npb-player-kana.json";
import foreignDict from "../../../data/npb-foreign-names.json";
import photoDict from "../../../data/npb-player-photos.json";
import { kanaToKorean } from "./kana-to-korean";
import { NPB_PLAYER_KO } from "./npb-name-dict";
import { PITCHER_NAME_KO } from "./npb-starters";

const DICT = kanaDict as Record<string, string>;
// 외국인 선수는 카나 음역 시 일본어 발음을 거쳐 원명과 멀어진다(JOSE QUIJADA → "호세 기하다").
//  build-npb-foreign-names-haiku 가 영문 원명을 음역해 만든 사전을 1순위로 쓴다.
const FOREIGN = foreignDict as Record<string, string>;

// 사진 URL — build-npb-roster-photos 가 수집한 사전(pid → p.npb.jp URL). 미보유는 undefined(이니셜 폴백).
export function npbPlayerPhoto(pid: string): string | undefined {
  return (photoDict as Record<string, string>)[pid];
}

export function npbPlayerKo(pid: string, fallback: string): string {
  const foreign = FOREIGN[pid];
  if (foreign) return foreign;
  const kana = DICT[pid];
  if (kana) {
    // 로마자 병기("ホセ・キハダ　(JOSE QUIJADA)") 는 괄호 이하 제거 후 음역
    const ko = kanaToKorean(kana).replace(/\s*[（(].*$/, "").trim();
    if (/[가-힣]/.test(ko)) return ko;
  }
  return byNameFallback(fallback);
}

/**
 * pid 카나 사전에 없는 선수 — 이름으로 한 번 더 시도한다.
 *
 * 풀네임 정확 일치와 순수 가나 음역만 쓴다. 성 prefix 매칭(jpPitcherToKorean 이 하는)을
 * 끌어오면 "西舘 昂汰" → "니시", "ワォーターズ" → "와" 처럼 잘린 이름이 나온다.
 * 틀린 한글보다 원문이 낫다는 게 이 파일의 폴백 원칙이다.
 */
function byNameFallback(name: string): string {
  const compact = name.replace(/[\s　]+/g, "");
  const exact = NPB_PLAYER_KO[compact] ?? PITCHER_NAME_KO[compact];
  if (exact) return exact;
  // 한자 없이 가나만(외국인 등록명) 이면 전체 음역 — 부분 매칭이 아니라 안전하다.
  if (!/[㐀-鿿]/.test(compact) && /[぀-ゟ゠-ヿ]/.test(compact)) {
    const ko = kanaToKorean(compact);
    if (ko && /[가-힣]/.test(ko) && !/[぀-ゟ゠-ヿ]/.test(ko)) return ko;
  }
  return name;
}
