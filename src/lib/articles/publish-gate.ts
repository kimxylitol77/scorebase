// AI 기사 발행 정합 게이트 — 종목 금칙어·본문 승률 vs 모델 승률·결장자 수 주장을 저장 전에 규칙으로 검사한다 (LLM 재호출 없음).
//
// 배경(2026-09-03 GEO 감사). MLB 프리뷰에 "실질적 강등전", 같은 글에서 승률이 53/54/59% 세 갈래,
// 라리가 프리뷰 본문 "결장자 6명" vs 위젯 2명. "데이터 검증을 거쳐 발행" 이라는 약속이 표본 2/2 에서
// 깨졌다. 규칙은 정규식·숫자 대조만이라 비용이 0 이고, 실패한 글은 버리지 않고 PENDING_REVIEW 로
// 남긴다(픽은 글보다 먼저 저장되므로 손실 없음). env ARTICLE_PUBLISH_GATE=off 로 전체 해제.
import {
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
  HOCKEY_LEAGUES,
  LOL_LEAGUES,
  MMA_LEAGUES,
  SOCCER_LEAGUES,
} from "@/lib/sports/sport-leagues";

export type ArticleGateSport = "soccer" | "baseball" | "basketball" | "hockey" | "esports" | "mma" | "other";

export function sportOfLeague(league: string): ArticleGateSport {
  if (SOCCER_LEAGUES.has(league)) return "soccer";
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (BASKETBALL_LEAGUES.has(league)) return "basketball";
  if (HOCKEY_LEAGUES.has(league)) return "hockey";
  if (LOL_LEAGUES.has(league)) return "esports";
  if (MMA_LEAGUES.has(league)) return "mma";
  return "other";
}

export interface ArticleGateInput {
  content: string;
  league: string;
  /** preview 는 3규칙 전부, recap 은 금칙어만 (리뷰 본문은 실제 라인업을 알고 있어 결장 수·승률 대조가 맞지 않음). */
  mode: "preview" | "recap";
  /** 글에 저장되는 predHome/Draw/Away 와 같은 값. 없으면 승률 규칙 생략. */
  winProb?: { home: number; draw: number; away: number } | null;
  /** 프롬프트에 실제로 준 결장 명단. 없으면(null) 본문의 결장자 수 주장은 근거가 없는 것. */
  injuries?: { home: unknown[]; away: unknown[] } | null;
}

export type ArticleGateResult = { ok: true } | { ok: false; reasons: string[] };

// 종목에 있을 수 없는 개념. 야구·농구·하키에 "리그 강등" 어법(강등전·강등권·잔류 싸움), 축구에 이닝/홈런.
// "강등" 한 단어로 잡으면 안 된다 — 야구는 "2군 강등", 농구는 "G리그 강등" 이 정상 용어다 (2026-09-04 NPB 오탐).
// e스포츠는 리그마다 승강 구조가 달라 제외.
const RELEGATION_TALK = /강등(전|권|\s?위험|\s?가능성|\s?경쟁|\s?확률)|잔류\s?(싸움|경쟁|다툼)|승격권/g;
const SPORT_FORBIDDEN: Partial<Record<ArticleGateSport, RegExp>> = {
  baseball: RELEGATION_TALK,
  basketball: RELEGATION_TALK,
  hockey: RELEGATION_TALK,
  soccer: /이닝|홈런|타율|삼진/g,
};

/** 문장 단위 분리 — 마침표·물음표·느낌표·줄바꿈. */
function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 모델 승률을 말하는 문장인가 — "최근 5경기 승률 60%" 같은 폼 통계는 제외하려고 모델·추정·예측 어휘를 요구한다. */
function isModelProbSentence(s: string): boolean {
  if (/오버|언더|OVER|UNDER|핸디|커버|토탈|득점|실점/i.test(s)) return false;
  if (/최근|통산|역대|상대전적|맞대결|홈 경기 승률|원정 승률/.test(s)) return false;
  // 시장(배당) 확률을 모델 승률과 나란히 적는 문장은 대조 불가 — "시장 평균 40% 대 60%" 는 모델 값이 아니다.
  if (/시장|배당|북메이커|오즈|implied/i.test(s)) return false;
  return /(모델|추정|예측|통계)/.test(s) && /(승률|승리|이길|확률)/.test(s);
}

export function checkArticleGate(input: ArticleGateInput): ArticleGateResult {
  const reasons: string[] = [];
  const { content, league } = input;
  const sport = sportOfLeague(league);

  // ① 종목 금칙어
  const forbidden = SPORT_FORBIDDEN[sport];
  if (forbidden) {
    const hits = [...new Set(content.match(forbidden) ?? [])];
    if (hits.length) reasons.push(`종목(${sport}) 부적합 어휘: ${hits.join(", ")}`);
  }
  // 무승부가 규정상 없는 종목만 — 야구는 KBO·NPB 에 실제로 무승부가 있어 제외(leagueHasDraw 는 화면 표기 기준이라 못 쓴다).
  if ((sport === "basketball" || sport === "hockey") && /무승부/.test(content)) {
    reasons.push(`무승부가 없는 종목(${sport})에 "무승부" 언급`);
  }

  if (input.mode === "preview") {
    // ② 본문 승률 vs 모델 승률 — 모델 승률 문장의 % 만 대조. ±1 은 반올림 차이로 허용.
    if (input.winProb) {
      const allowed = [input.winProb.home, input.winProb.draw, input.winProb.away].map((p) => Math.round(p * 100));
      const bad: string[] = [];
      for (const s of splitSentences(content)) {
        if (!isModelProbSentence(s)) continue;
        // "%p"·"%포인트" 는 격차 표기라 승률이 아니다.
        for (const m of s.matchAll(/(\d{1,3})(?:\.\d+)?\s*%(?![pP]|포인트)/g)) {
          const n = Number(m[1]);
          if (n > 100) continue;
          if (!allowed.some((a) => Math.abs(a - n) <= 1)) bad.push(`${n}%`);
        }
      }
      if (bad.length) {
        reasons.push(`본문 승률 ${[...new Set(bad)].join(", ")} 이(가) 모델 승률(홈 ${allowed[0]}/무 ${allowed[1]}/원정 ${allowed[2]})과 불일치`);
      }
    }

    // ③ 결장자 수 주장 — 프롬프트에 준 명단이 없으면 어떤 숫자도 근거가 없다.
    const claims = [...content.matchAll(/(?:결장|이탈|부상)(?:자|\s*선수)?\s*(\d{1,2})\s*명|(\d{1,2})\s*명(?:의|이)?\s*(?:결장|이탈|부상)/g)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => n > 0);
    if (claims.length) {
      if (!input.injuries) {
        reasons.push(`근거 없는 결장자 수 주장: ${[...new Set(claims)].map((n) => `${n}명`).join(", ")} (프롬프트에 부상 데이터 없음)`);
      } else {
        // 명단이 있으면 부분 집계("투수진 부상 17명")도 정당하다 — 명단 총원을 넘는 숫자만 지어낸 것으로 본다.
        // (2026-09-04 NPB 오탐: 1군 등록말소 명단이 길어 홈·원정·합계 정확 일치 요구가 정상 글을 막았다)
        const total = input.injuries.home.length + input.injuries.away.length;
        const wrong = [...new Set(claims)].filter((n) => n > total);
        if (wrong.length) {
          reasons.push(`결장자 수 ${wrong.map((n) => `${n}명`).join(", ")} 이(가) 명단 총원(${total}명)을 넘음`);
        }
      }
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** env 로 전체 해제 — 규칙이 정상 글을 과하게 막을 때 임시 우회. */
export function articleGateEnabled(): boolean {
  return process.env.ARTICLE_PUBLISH_GATE !== "off";
}
