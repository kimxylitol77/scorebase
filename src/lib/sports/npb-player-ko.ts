// NPB 선수 공식 pid → 한글 표시명. 로스터(baseball-rosters.json)는 한자·가타카나 원문이라
//   그대로 노출하면 "スチュワート・ジュニア" 처럼 읽을 수 없다.
//   build-npb-player-link 가 수집한 카나 사전(pid → kana)을 kanaToKorean 으로 음역해 표시한다.
//   카나 미보유·음역 실패 시 원문 폴백(빈 화면보다 원문이 낫다).
import kanaDict from "../../../data/npb-player-kana.json";
import foreignDict from "../../../data/npb-foreign-names.json";
import { kanaToKorean } from "./kana-to-korean";

const DICT = kanaDict as Record<string, string>;
// 외국인 선수는 카나 음역 시 일본어 발음을 거쳐 원명과 멀어진다(JOSE QUIJADA → "호세 기하다").
//  build-npb-foreign-names-haiku 가 영문 원명을 음역해 만든 사전을 1순위로 쓴다.
const FOREIGN = foreignDict as Record<string, string>;

export function npbPlayerKo(pid: string, fallback: string): string {
  const foreign = FOREIGN[pid];
  if (foreign) return foreign;
  const kana = DICT[pid];
  if (!kana) return fallback;
  // 로마자 병기("ホセ・キハダ　(JOSE QUIJADA)") 는 괄호 이하 제거 후 음역
  const ko = kanaToKorean(kana).replace(/\s*[（(].*$/, "").trim();
  return /[가-힣]/.test(ko) ? ko : fallback;
}
