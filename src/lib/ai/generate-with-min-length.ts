// 본문 생성 + 최소 길이 가드. SEO 신호 강화용 (Google "Discovered - currently
// not indexed" 회피 — 콘텐츠 가치가 낮은 짧은 글이 색인 보류의 주 원인).
//
// 흐름: generate → 길이 미달이면 expand 지시 붙여 1회 재시도 → 그래도 미달이면 null.
// 호출자는 null 시 DB INSERT 를 건너뜀.

import { generate, type GenerateOptions } from "./claude";

export const MIN_ARTICLE_LENGTH = 1200;

const EXPAND_INSTRUCTION = `

## 추가 지침 — 본문 확장
방금 출력한 본문이 너무 짧아 검색엔진 색인에 불리합니다. 다음 원칙으로 본문을 1.5~2배 길이로 확장해 다시 작성하세요:
- 통계와 맥락(시즌 흐름, 최근 폼, H2H 상대전적, 홈/원정 강도) 추가
- 핵심 선수·감독·전술 키 포인트 한 문단 이상
- 같은 정보 반복은 금지, 새로운 인사이트 위주
- 출력 형식은 동일하게 (마크다운, "# " 제목으로 시작)
`;

export interface GenerateWithMinLengthOptions extends GenerateOptions {
  minLength?: number;
  label?: string;
}

/**
 * 1차 generate → 본문 < minLength 면 expand 지시 붙여 1회 재시도.
 * 재시도도 짧으면 null 반환 — 호출자는 skip 처리.
 */
export async function generateWithMinLength(
  prompt: string,
  opts: GenerateWithMinLengthOptions = {},
): Promise<string | null> {
  const minLength = opts.minLength ?? MIN_ARTICLE_LENGTH;
  const label = opts.label ?? "article";
  const genOpts: GenerateOptions = {
    system: opts.system,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    model: opts.model,
  };

  const first = await generate(prompt, genOpts);
  if (first.trim().length >= minLength) return first;

  console.warn(
    `[${label}] 본문 ${first.trim().length}자 < ${minLength} — expand 재시도`,
  );
  const second = await generate(prompt + EXPAND_INSTRUCTION, genOpts);
  if (second.trim().length >= minLength) return second;

  console.warn(
    `[${label}] 재시도도 ${second.trim().length}자 — SKIP (DB INSERT 건너뜀)`,
  );
  return null;
}
