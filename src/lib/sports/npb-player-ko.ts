// NPB 선수 공식 pid → 한글 표시명. 로스터(baseball-rosters.json)는 한자·가타카나 원문이라
//   그대로 노출하면 "スチュワート・ジュニア" 처럼 읽을 수 없다.
//   build-npb-player-link 가 수집한 카나 사전(pid → kana)을 kanaToKorean 으로 음역해 표시한다.
//   카나 미보유·음역 실패 시 원문 폴백(빈 화면보다 원문이 낫다).
import kanaDict from "../../../data/npb-player-kana.json";
import { kanaToKorean } from "./kana-to-korean";

const DICT = kanaDict as Record<string, string>;

export function npbPlayerKo(pid: string, fallback: string): string {
  const kana = DICT[pid];
  if (!kana) return fallback;
  // 외국인 선수는 "ホセ・キハダ　(JOSE QUIJADA)" 처럼 로마자 병기 → 괄호 이하 제거
  const ko = kanaToKorean(kana).replace(/\s*[（(].*$/, "").trim();
  return /[가-힣]/.test(ko) ? ko : fallback;
}
