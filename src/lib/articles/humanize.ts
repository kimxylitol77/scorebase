// 심판봇 — AI 기사의 "AI 티"를 규칙으로 채점하고, 기준 미달이면 LLM 이 문체만 고쳐 쓰게 한 뒤 숫자·헤딩·표가 그대로인지 검증해 채택한다.
//
// 왜 규칙이 먼저인가. 티는 단어가 아니라 구조(문장 길이 균일·상투 마무리·강조어·볼드 라벨 세트)에서 나고,
// 구조는 정규식과 통계로 잴 수 있다. LLM 은 미달일 때만 부르므로 비용이 글당 최대 2회로 묶인다.
// 심판봇은 글을 막지 않는다 — 검증에 실패하면 원문을 그대로 발행한다 (2026-09-04, reports/geo/humanize-context-notes.md).
import { generate } from "@/lib/ai/claude";
import { HUMANIZE_SYSTEM, buildHumanizePrompt } from "@/prompts/humanize";

export interface HumanessScore {
  score: number; // 0~100, 높을수록 사람 글에 가깝다
  findings: string[]; // 감점 사유 (고쳐쓰기 프롬프트에 그대로 들어간다)
  metrics: Record<string, number>;
}

/** 보존 대상 줄 — 페이지가 파싱하거나 위젯과 단일 소스여야 하는 것. 채점에서도 제외한다. */
export function isProtectedLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith("#")) return true; // 헤딩
  if (t.startsWith("|")) return true; // 표
  if (t.startsWith("<!--")) return true; // MVP 마커 등 주석
  if (/\{\{[^}]+\}\}/.test(t)) return true; // tactical-shape 토큰
  if (t.startsWith("**") && /[📊🎲📈🎯]/u.test(t)) return true; // 위젯 단일 소스 라벨 줄
  if (/^\*\*본 분석은/.test(t)) return true; // 면책
  // 굵은 리드 문장(H1 직후 한 줄 요약) — 40자 이상의 볼드 단독 줄. 짧은 볼드 소제목(≤40자)은 고쳐쓰기 대상.
  if (/^\*\*[^*]{40,}\*\*$/.test(t)) return true;
  if (t === "---") return true;
  return false;
}

/** 산문만 남긴다 — 보존 줄·마크다운 기호 제거. */
function extractProse(content: string): { text: string; boldLabelSets: number; listsOfThree: number } {
  const lines = content.split("\n");
  const kept: string[] = [];
  let boldLabelSets = 0;
  let listsOfThree = 0;
  let listRun = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (isProtectedLine(raw)) continue;
    // 번호 목록: 정확히 3개짜리 목록이 몇 번 나오는지
    if (/^\d+\.\s/.test(t)) {
      listRun++;
    } else if (t === "" && listRun > 0) {
      if (listRun === 3) listsOfThree++;
      listRun = 0;
    }
    // 볼드 라벨 한 줄(문장부호 없이 끝) + 다음 비어있지 않은 줄이 문단 = 세트
    if (/^\*\*[^*]{2,60}\*\*$/.test(t)) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      if (next && !isProtectedLine(next) && !/^\*\*/.test(next.trim())) boldLabelSets++;
      continue;
    }
    kept.push(t.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
  }
  if (listRun === 3) listsOfThree++;
  const text = kept
    .join("\n")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`[^`]*`/g, "");
  return { text, boldLabelSets, listsOfThree };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

const CLOSER_RE = /(보여준다|드러낸다|시사한다|의미한다|입증한다|말해준다|방증한다|반영한다|보여주는 대목이다|드러내고 있다|보여주고 있다|뜻이다|의미다|결과다|셈이다|신호다|근거가 된다)\.?$/;
const OPENER_RE = /^(이는|이러한|이 같은|이것은|이처럼|특히|다만|반면)(\s|,)/;
const HEDGE_RE = /(가능성이 높다|가능성이 크다|것으로 보인다|것으로 예상된다|것으로 풀이된다|전망이다|것이다)\.?$/;
const INTENSIFIER_RE = /극단적|극명|극악|압도적|압도한다|명확한|명확히|결정적|핵심적|상당한|뚜렷|월등|본격적|현저히|절대 우위|가장 중요한/g;

/** 규칙 채점 — 결정론. 같은 글은 항상 같은 점수. */
export function scoreHumanness(content: string): HumanessScore {
  const { text, boldLabelSets, listsOfThree } = extractProse(content);
  const sentences = splitSentences(text);
  const n = sentences.length;
  const findings: string[] = [];
  const metrics: Record<string, number> = { sentences: n, boldLabelSets, listsOfThree };
  if (n < 6) return { score: 100, findings, metrics }; // 산문이 거의 없는 글(표·목록 위주)은 채점 대상이 아니다

  const lens = sentences.map((s) => s.length);
  const mean = lens.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const cv = mean ? sd / mean : 0;
  let similarRuns = 0;
  for (let i = 2; i < n; i++) {
    const tol = mean * 0.18;
    if (Math.abs(lens[i] - lens[i - 1]) < tol && Math.abs(lens[i - 1] - lens[i - 2]) < tol) similarRuns++;
  }
  const closers = sentences.filter((s) => CLOSER_RE.test(s)).length;
  const openers = sentences.filter((s) => OPENER_RE.test(s)).length;
  const hedges = sentences.filter((s) => HEDGE_RE.test(s)).length;
  const per1k = 1000 / Math.max(text.length, 1);
  const intensifiers = (text.match(INTENSIFIER_RE) ?? []).length * per1k;
  const emDashes = (text.match(/—/g) ?? []).length * per1k;
  // 숫자 과시 — 문장 셋 중 둘 이상에 숫자가 두 개 넘게 들어가면 사람은 읽다 지친다 (system prompt 도 "숫자 나열 금지").
  const numericHeavy = sentences.filter((s) => (s.match(/\d/g) ?? []).length >= 4).length;

  Object.assign(metrics, {
    meanLen: Math.round(mean),
    cv: Number(cv.toFixed(2)),
    similarRunRatio: Number((similarRuns / n).toFixed(2)),
    closerRatio: Number((closers / n).toFixed(2)),
    openerRatio: Number((openers / n).toFixed(2)),
    hedgeRatio: Number((hedges / n).toFixed(2)),
    intensifiersPer1k: Number(intensifiers.toFixed(1)),
    emDashPer1k: Number(emDashes.toFixed(1)),
    numericHeavyRatio: Number((numericHeavy / n).toFixed(2)),
  });

  let score = 100;
  const pen = (cond: boolean, pts: number, why: string) => {
    if (cond) {
      score -= pts;
      findings.push(why);
    }
  };
  pen(cv < 0.25, 25, `문장 길이가 거의 같다 (변동계수 ${cv.toFixed(2)}, 평균 ${Math.round(mean)}자). 긴 문장 뒤에 짧은 문장을 두어 호흡을 바꿔라`);
  pen(cv >= 0.25 && cv < 0.35, 15, `문장 길이 변화가 적다 (변동계수 ${cv.toFixed(2)}). 짧은 문장을 섞어라`);
  pen(cv >= 0.35 && cv < 0.45, 6, `문장 길이가 다소 균일하다 (변동계수 ${cv.toFixed(2)})`);
  pen(similarRuns / n > 0.25, 15, `비슷한 길이의 문장이 세 개씩 연달아 온다 (${similarRuns}곳)`);
  pen(similarRuns / n > 0.15 && similarRuns / n <= 0.25, 8, `비슷한 길이의 문장이 연달아 오는 곳이 있다 (${similarRuns}곳)`);
  pen(closers / n > 0.2, 15, `"~을 보여준다/드러낸다/시사한다/뜻이다" 식 해설 마무리가 문장 ${closers}개 (${Math.round((closers / n) * 100)}%). 근거 문장에 붙이거나 지워라`);
  pen(closers / n > 0.07 && closers / n <= 0.2, 8, `"~을 보여준다/시사한다/뜻이다" 식 마무리 ${closers}개. 절반 이상 지워라`);
  pen(openers / n > 0.15, 10, `"이는/이러한/이 같은" 으로 시작하는 문장 ${openers}개. 앞 문장에 붙이거나 주어를 바꿔라`);
  pen(openers / n > 0.07 && openers / n <= 0.15, 5, `"이는/이러한" 시작 문장 ${openers}개`);
  pen(intensifiers > 3, 12, `강조어(극단적·극명한·명확한·압도적·결정적…)가 1,000자당 ${intensifiers.toFixed(1)}회. 숫자가 말하는 곳에서는 빼라`);
  pen(intensifiers > 1.2 && intensifiers <= 3, 6, `강조어가 1,000자당 ${intensifiers.toFixed(1)}회. 절반으로 줄여라`);
  pen(numericHeavy / n > 0.5, 10, `문장 ${numericHeavy}개에 숫자가 네 개 이상 들어 있다 (${Math.round((numericHeavy / n) * 100)}%). 숫자 없는 해석 문장·짧은 문장을 사이에 넣어라`);
  pen(numericHeavy / n > 0.35 && numericHeavy / n <= 0.5, 5, `숫자가 많은 문장이 ${Math.round((numericHeavy / n) * 100)}%. 숫자 없는 짧은 문장을 섞어라`);
  pen(emDashes > 1.5, 8, `긴 줄표(—)가 1,000자당 ${emDashes.toFixed(1)}개. 쉼표·마침표로 바꿔라 (보존 줄 제외)`);
  pen(emDashes > 0.7 && emDashes <= 1.5, 4, `긴 줄표(—) ${emDashes.toFixed(1)}개/1,000자`);
  pen(hedges / n > 0.3, 8, `"~할 것이다/가능성이 높다/것으로 보인다" 마무리가 문장 ${hedges}개. 일부는 평서문으로`);
  pen(hedges / n > 0.2 && hedges / n <= 0.3, 4, `추정형 마무리 ${hedges}개`);
  pen(boldLabelSets > 6, 8, `볼드 소제목 한 줄 + 설명 문단 세트가 ${boldLabelSets}개. 절반은 소제목을 지우고 문단 첫 문장이 주제를 말하게`);
  pen(boldLabelSets > 3 && boldLabelSets <= 6, 4, `볼드 소제목 + 문단 세트 ${boldLabelSets}개`);
  pen(listsOfThree >= 2, 5, `정확히 3개짜리 번호 목록이 ${listsOfThree}번. 관전 포인트 외에는 항목 수를 내용에 맞춰라`);

  return { score: Math.max(0, score), findings, metrics };
}

// ── 불변 검증 ────────────────────────────────────────────────────────

const NUMBER_RE = /\d[\d,.:%\-]*\d|\d/g;

function numberSet(s: string): Set<string> {
  return new Set((s.match(NUMBER_RE) ?? []).map((x) => x.replace(/[.,:\-]+$/, "")));
}
function protectedLines(s: string): string[] {
  return s.split("\n").filter((l) => isProtectedLine(l) && l.trim() !== "---").map((l) => l.trim());
}
function linkSet(s: string): Set<string> {
  return new Set([...s.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]));
}
function setDiff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x));
}

/** 보존 줄을 원문으로 되돌린다 — 모델이 라벨 줄의 줄표나 리드 문장을 손댔어도 개수가 같으면 자리마다 원문을 덮어쓴다.
 *  페이지가 파싱하는 줄은 어차피 원문이어야 하므로 폐기보다 복원이 맞다. 개수가 다르면 null(구조가 깨진 것). */
export function restoreProtectedLines(original: string, revised: string): string | null {
  const po = original.split("\n").filter((l) => isProtectedLine(l) && l.trim() !== "---");
  const rl = revised.split("\n");
  const idx = rl.map((l, i) => (isProtectedLine(l) && l.trim() !== "---" ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== po.length) return null;
  idx.forEach((i, k) => {
    rl[i] = po[k];
  });
  return rl.join("\n");
}

/** 고쳐쓴 글이 원문의 사실·구조를 보존했는지. 실패 사유가 비면 통과. */
export function checkInvariants(original: string, revised: string): string[] {
  const reasons: string[] = [];
  const po = protectedLines(original);
  const pr = protectedLines(revised);
  const firstDiff = po.findIndex((l, i) => l !== pr[i]);
  if (po.length !== pr.length || firstDiff >= 0) {
    const detail = firstDiff >= 0 ? ` 첫 차이: "${po[firstDiff]?.slice(0, 40)}" → "${pr[firstDiff]?.slice(0, 40)}"` : "";
    reasons.push(`보존 줄(헤딩·표·라벨) 불일치: 원문 ${po.length}줄 vs 고침 ${pr.length}줄${detail}`);
  }
  const no = numberSet(original);
  const nr = numberSet(revised);
  const missing = setDiff(no, nr);
  const added = setDiff(nr, no);
  if (missing.length) {
    const ctx = missing.slice(0, 3).map((x) => {
      const i = original.search(new RegExp(`(?<![\\d.])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d.])`));
      return i >= 0 ? `${x}("…${original.slice(Math.max(0, i - 18), i + 14).replace(/\n/g, " ")}…")` : x;
    });
    reasons.push(`숫자 누락: ${ctx.join(", ")}${missing.length > 3 ? ` 외 ${missing.length - 3}개` : ""}`);
  }
  if (added.length) reasons.push(`새 숫자: ${added.slice(0, 8).join(", ")}`);
  const lo = linkSet(original);
  const lr = linkSet(revised);
  if (setDiff(lo, lr).length || setDiff(lr, lo).length) reasons.push("링크 집합 불일치");
  const ratio = revised.length / Math.max(original.length, 1);
  if (ratio < 0.7 || ratio > 1.35) reasons.push(`길이 ${ratio.toFixed(2)}배 (허용 0.7~1.35)`);
  return reasons;
}

// ── 루프 ────────────────────────────────────────────────────────────

export interface HumanizeOptions {
  label?: string;
  threshold?: number;
  maxRounds?: number;
  model?: string;
  /** 테스트·dry-run 용 주입. 기본은 Claude generate. */
  revise?: (prompt: string, system: string, model?: string) => Promise<string>;
}

export interface HumanizeResult {
  content: string;
  before: number;
  after: number;
  rounds: number; // 실제 LLM 호출 횟수
  accepted: boolean; // 고쳐쓴 글이 채택됐는가
  findings: string[]; // 최초 채점 사유
  rejections: string[]; // 라운드별 폐기 사유
}

export function humanizeEnabled(): boolean {
  return process.env.ARTICLE_HUMANIZE !== "off";
}

function stripFence(s: string): string {
  return s.replace(/^\s*```(?:markdown|md)?\s*\n/, "").replace(/\n```\s*$/, "").trim();
}

export async function humanizeArticle(content: string, opts: HumanizeOptions = {}): Promise<HumanizeResult> {
  const threshold = opts.threshold ?? Number(process.env.HUMANIZE_THRESHOLD ?? 80);
  const maxRounds = opts.maxRounds ?? Number(process.env.HUMANIZE_MAX_ROUNDS ?? 2);
  const model = opts.model ?? process.env.HUMANIZE_MODEL;
  const label = opts.label ?? "article";
  const revise =
    opts.revise ??
    ((prompt: string, system: string, m?: string) =>
      generate(prompt, { system, maxTokens: 6000, ...(m ? { model: m } : { temperature: 0.4 }) }));

  const first = scoreHumanness(content);
  const result: HumanizeResult = {
    content,
    before: first.score,
    after: first.score,
    rounds: 0,
    accepted: false,
    findings: first.findings,
    rejections: [],
  };
  if (!humanizeEnabled() || first.score >= threshold) return result;

  let current = content;
  let currentScore = first.score;
  let currentFindings = first.findings;
  let lastRejection: string | null = null;
  for (let r = 0; r < maxRounds && currentScore < threshold; r++) {
    result.rounds++;
    let out: string;
    try {
      const notes = lastRejection ? [`직전 시도가 폐기된 이유 — 이번엔 반드시 지켜라: ${lastRejection}`] : [];
      out = stripFence(await revise(buildHumanizePrompt(current, [...currentFindings, ...notes]), HUMANIZE_SYSTEM, model));
    } catch (e) {
      result.rejections.push(`${r + 1}회: 호출 실패 ${(e as Error).message?.slice(0, 120)}`);
      break;
    }
    const restored = restoreProtectedLines(content, out);
    if (restored == null) {
      lastRejection = "보존 줄(헤딩·표·라벨·리드)이 사라지거나 늘어남";
      result.rejections.push(`${r + 1}회: ${lastRejection}`);
      continue;
    }
    out = restored;
    const bad = checkInvariants(content, out); // 항상 원문 기준 — 라운드가 쌓여도 숫자는 원문과 같아야 한다
    if (bad.length) {
      lastRejection = bad.join(" / ");
      result.rejections.push(`${r + 1}회: ${lastRejection}`);
      continue;
    }
    const s = scoreHumanness(out);
    if (s.score <= currentScore) {
      lastRejection = `점수 미개선 ${currentScore}→${s.score}. 감점 사유를 더 과감하게 고쳐라`;
      result.rejections.push(`${r + 1}회: ${lastRejection}`);
      continue;
    }
    lastRejection = null;
    current = out;
    currentScore = s.score;
    currentFindings = s.findings;
    result.content = current;
    result.after = currentScore;
    result.accepted = true;
  }
  if (result.rounds > 0) {
    console.log(
      `[humanize] ${label} ${result.before}→${result.after}점 (${result.rounds}회, ${result.accepted ? "채택" : "원문 유지"})` +
        (result.rejections.length ? ` 폐기: ${result.rejections.join(" | ")}` : ""),
    );
  }
  return result;
}
