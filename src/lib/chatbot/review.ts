// 챗봇 대화 하루(KST) 자동 채점 — 전날 ChatLog 를 haiku 로 분류(답함·되물음·못 답함·단정 의심)하고,
// 반복 수요를 묶고, 반복 실패에 대한 행동 규칙을 제안(PROPOSED)한다. 규칙은 관리자가 승인해야 챗봇에 들어간다.
// 계획·결정: reports/plans/chatbot-review-loop/.
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";

type Verdict = "answered" | "reasked" | "failed" | "suspect";
export interface ChatReviewDetail {
  summary: string;
  demands: { label: string; count: number; examples: string[] }[];
  cases: { verdict: Verdict; question: string; answer: string; note: string }[];
}
export interface ChatReviewResult {
  day: string;
  total: number;
  counts: Record<Verdict, number>;
  detail: ChatReviewDetail;
  proposed: { text: string; reason: string; examples: string[] }[];
}

const MAX_LOGS = 150;
const MAX_RULES_PER_DAY = 3;
const MAX_RULE_LEN = 200;

/** "2026-09-28" KST 하루의 UTC 경계 */
function kstDayRange(day: string): { gte: Date; lt: Date } {
  const start = new Date(`${day}T00:00:00+09:00`);
  return { gte: start, lt: new Date(start.getTime() + 86400_000) };
}
export function kstYesterday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000 - 86400_000).toISOString().slice(0, 10);
}

// 챗봇이 가진 도구 — 채점기가 "도구로 풀 수 있었는데 되물었다"를 판단하는 기준
const BOT_CAPABILITIES = `챗봇 도구: 오늘 경기(get_today_matches, 리그 생략 가능)·향후 경기·최근 결과·경기 상세 예측·선수 검색·기사 검색·
고확신 픽(get_top_picks, "가장 신뢰도 높은 예측"에 되묻지 말고 바로)·xG 추천·팀 xG·팀 이름으로 경기 찾기(find_match)·리그 개인 순위·순위표·모델 적중률·운영자 전달.
없는 것: 라이브 투수 교체·실점, 여러 경기 조합(고배당 조합) 추천, 개인 베팅 금액 조언.`;

function buildPrompt(
  logs: { question: string; answer: string; ip: string | null }[],
  rules: { text: string; status: string }[],
): string {
  const lines = logs.map(
    (l, i) =>
      `[${i}] (ip ${l.ip?.slice(-6) ?? "-"})\nQ: ${l.question.slice(0, 300).replace(/\s+/g, " ")}\nA: ${l.answer.slice(0, 600).replace(/\s+/g, " ")}`,
  );
  const ruleLines = rules.length ? rules.map((r) => `- (${r.status}) ${r.text}`).join("\n") : "(없음)";
  return `아래는 스포츠 데이터 사이트 Scorebase 의 안내 챗봇이 하루 동안 나눈 대화다. 품질 점검관으로서 채점하라.

${BOT_CAPABILITIES}

챗봇에 이미 있는 행동 규칙(아래 rules 제안 때만 참고 — 대화 채점 기준이 아니다):
${ruleLines}

대화 ${logs.length}건:
${lines.join("\n\n")}

각 대화를 하나로 분류:
- answered: 질문에 실제로 답함(인사·잡담에 적절히 응대한 것 포함)
- reasked: 도구로 바로 답할 수 있었는데 리그·경기 등을 되물음
- failed: 답을 못 함·엉뚱한 답·도구가 없어 못 도움
- suspect: 도구 근거 없이 경기·확률·시각·선수 사실을 단정한 것으로 보임
중요: 네 배경지식으로 사실 여부를 판정하지 마라(선수 소속·경기 일정은 네 지식이 낡았거나 틀릴 수 있다).
챗봇 답의 사실관계는 맞다고 가정하고, 질문에 답했는지·되물었는지·도구로 뒷받침될 수 없는 것을 지어냈는지만 본다.

그리고:
- demands: 같은 요구가 2번 이상(또는 같은 ip 가 재질문) 나온 것을 묶어 짧은 이름·횟수·예시 질문(최대 3개)
- rules: reasked·failed 가 반복되는 패턴에 대해, 챗봇 시스템 프롬프트에 넣을 행동 규칙을 최대 ${MAX_RULES_PER_DAY}개 제안.
  규칙은 행동 지침만(사실·숫자·팀명 단정 금지), ${MAX_RULE_LEN}자 이하, 한국어 한 문장. 도박 조장·특정 사용자 겨냥 금지.
  챗봇은 한 대화 안의 이전 메시지만 보고 다른 대화·ip 이력은 모른다 — 대화를 넘나들어야 지킬 수 있는 규칙은 제안하지 마라.
  위 이미 있는 규칙과 뜻이 같으면 제안하지 마라. 근거가 약하면 비워 둬라.
- summary: 오늘 대화 한 줄 요약(한국어, 60자 이하)

JSON 만 출력(설명 금지):
{"grades":[{"i":0,"verdict":"answered","note":"짧은 이유"}],"demands":[{"label":"","count":0,"examples":[""]}],"rules":[{"text":"","reason":"","examples":[""]}],"summary":""}`;
}

function parseJson(text: string): unknown {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("채점 응답에 JSON 이 없음");
  return JSON.parse(text.slice(a, b + 1));
}

interface GraderOut {
  grades?: { i?: number; verdict?: string; note?: string }[];
  demands?: { label?: string; count?: number; examples?: string[] }[];
  rules?: { text?: string; reason?: string; examples?: string[] }[];
  summary?: string;
}

const VERDICTS: Verdict[] = ["answered", "reasked", "failed", "suspect"];

/** day(KST) 하루분을 채점. dry=true 면 DB 에 쓰지 않는다. 로그 0건이면 LLM 을 부르지 않는다. */
export async function reviewChatDay(day: string, { dry = false } = {}): Promise<ChatReviewResult> {
  const logs = await prisma.chatLog.findMany({
    where: { createdAt: kstDayRange(day) },
    select: { question: true, answer: true, ip: true },
    orderBy: { createdAt: "asc" },
    take: MAX_LOGS,
  });
  const counts: Record<Verdict, number> = { answered: 0, reasked: 0, failed: 0, suspect: 0 };
  const empty: ChatReviewResult = { day, total: 0, counts, detail: { summary: "대화 없음", demands: [], cases: [] }, proposed: [] };
  if (logs.length === 0) return empty;

  // 같은 날 재실행이면 그날 대기 제안은 아래서 교체되므로 "이미 있는 규칙"에서 뺀다(빼지 않으면 재제안이 막혀 사라진다)
  const rules = await prisma.chatbotRule.findMany({
    where: { status: { in: ["ACTIVE", "PROPOSED"] }, NOT: { sourceDay: day, status: "PROPOSED" } },
    select: { text: true, status: true },
  });
  const raw = await generate(buildPrompt(logs, rules), { maxTokens: 4000, temperature: 0 });
  const out = parseJson(raw) as GraderOut;

  const cases: ChatReviewDetail["cases"] = [];
  for (const g of out.grades ?? []) {
    const v = VERDICTS.includes(g.verdict as Verdict) ? (g.verdict as Verdict) : null;
    const l = typeof g.i === "number" ? logs[g.i] : undefined;
    if (!v || !l) continue;
    counts[v]++;
    if (v !== "answered") {
      cases.push({ verdict: v, question: l.question.slice(0, 200), answer: l.answer.slice(0, 300), note: (g.note ?? "").slice(0, 120) });
    }
  }
  const demands = (out.demands ?? [])
    .filter((d) => d.label && (d.count ?? 0) >= 2)
    .map((d) => ({ label: String(d.label).slice(0, 40), count: Number(d.count), examples: (d.examples ?? []).slice(0, 3).map((e) => String(e).slice(0, 80)) }));
  const proposed = (out.rules ?? [])
    .filter((r) => r.text && r.text.length <= MAX_RULE_LEN)
    .slice(0, MAX_RULES_PER_DAY)
    .map((r) => ({ text: String(r.text).trim(), reason: String(r.reason ?? "").slice(0, 200), examples: (r.examples ?? []).slice(0, 3).map((e) => String(e).slice(0, 80)) }));
  const detail: ChatReviewDetail = { summary: String(out.summary ?? "").slice(0, 80), demands, cases: cases.slice(0, 30) };
  const result: ChatReviewResult = { day, total: logs.length, counts, detail, proposed };

  if (!dry) {
    const data = { total: logs.length, ...counts, detail: detail as object };
    await prisma.chatReview.upsert({ where: { day }, create: { day, ...data }, update: data });
    // 같은 날 재실행 시 제안이 쌓이지 않게 — 그날 제안 중 아직 처리 안 된 것만 교체
    await prisma.chatbotRule.deleteMany({ where: { sourceDay: day, status: "PROPOSED" } });
    for (const r of proposed) {
      await prisma.chatbotRule.create({ data: { text: r.text, reason: r.reason, examples: r.examples, sourceDay: day } });
    }
  }
  return result;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 텔레그램 요약 한 통 (HTML) */
export function chatReviewMessage(r: ChatReviewResult, siteUrl: string): string {
  if (r.total === 0) return `[챗봇 점검] ${r.day} 대화 없음`;
  const fail = r.counts.reasked + r.counts.failed;
  const lines = [
    `<b>[챗봇 점검] ${r.day}</b> — ${r.total}건 · 답함 ${r.counts.answered} · 되물음 ${r.counts.reasked} · 못 답함 ${r.counts.failed} · 단정 의심 ${r.counts.suspect}`,
  ];
  if (r.detail.summary) lines.push(esc(r.detail.summary));
  if (r.detail.demands.length) {
    lines.push(`반복 수요: ${r.detail.demands.map((d) => `${esc(d.label)} ${d.count}회`).join(", ")}`);
  }
  if (r.proposed.length) {
    lines.push(`새 규칙 제안 ${r.proposed.length}건 — 승인 대기`);
    r.proposed.forEach((p, i) => lines.push(`${i + 1}. ${esc(p.text)}`));
  }
  if (fail === 0 && r.counts.suspect === 0 && r.proposed.length === 0) lines.push("특이사항 없음");
  else lines.push(`${siteUrl}/admin/chat-logs`);
  return lines.join("\n");
}
