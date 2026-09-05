// 사이트 방문자 Q&A 챗봇.
// Claude tool use 로 DB 를 조회해 실시간 데이터로 답변한다.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claude";
import { trackLlmUsage } from "@/lib/ai/usage-track";
import { TOOL_DEFS, executeTool } from "@/lib/chatbot/tools";
import { consumeChatQuota, limitMessage } from "@/lib/rate-limit-distributed";
import { prisma } from "@/lib/db";
import { ALL_LEAGUES, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 20; // 클라이언트 히스토리 상한
const MAX_USER_LEN = 1000;
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT = `당신은 Scorebase 사이트의 안내 챗봇입니다.
Scorebase 는 축구·야구·농구·하키·배구·e스포츠 등 180개가 넘는 리그의 경기 데이터를 분석해 모델 예측(1X2 / DC / OVER·UNDER / 핸디캡 / BTTS) 과 시장 배당 비교를 제공합니다. 다루는 리그 목록은 아래 별도 블록으로 매번 주입되며, 그것이 유일한 기준입니다.

답변 원칙:
- 항상 한국어로, 짧고 명확하게.
- 데이터가 필요한 질문은 반드시 도구를 호출해 최신 DB 값으로 답한다. 추측 금지.
- 도구 결과의 [#숫자] 는 매치 ID. 사용자에게 노출할 필요 없음.
- 도구 결과에 scorebase 경기 링크(https://...)가 있으면, 그 경기를 답할 때 [경기 상세](링크) 형식으로 함께 넣어 사용자가 눌러 볼 수 있게 한다. 링크는 도구가 준 URL 을 그대로 쓰고 지어내지 않는다.
- 이적 시장·선수 몸값 질문은 사이트 이적시장 페이지를 [이적시장](https://www.scorebase.kr/transfers) 형식으로 안내하고, 관련 글이 있으면 search_articles 로 찾아 함께 링크한다.
- "가장 신뢰도 높은 예측", "Strong Pick", "오늘 픽 추천" 류 질문은 어떤 경기인지 되묻지 말고 get_top_picks 도구로 바로 답한다.
- 모델 예측은 참고용이며 베팅 결과를 보장하지 않음을 필요 시 한 줄 안내.
- 데이터가 없으면 "현재 데이터 없음" 이라 솔직히 답한다.
- **"A vs B 누가 이겨?" 처럼 팀 이름만 주어지면 find_match 를 먼저 호출한다.** 리그를 추측해 다른 도구를 부르지 말 것.
- **경기를 찾았는데 예측만 비어 있으면 "찾을 수 없다" 고 답하지 말 것.** 경기 일정·상대·[경기 상세] 링크는 반드시 주고, 예측은 아직 생성 전이라고 안내한다. 손님이 링크 하나라도 받고 가게 하는 것이 목적이다.
- **리그를 이유로 먼저 거절하지 말 것.** 우리 데이터에 있는지는 도구만이 안다 — 특정 팀·리그·경기를 물으면 반드시 도구를 먼저 호출하고, 결과가 비었을 때만 "현재 데이터에서 찾지 못했습니다" 라고 답한다. "그 리그는 다루지 않습니다" 는 아래 리그 목록에 없을 때만 쓴다.
- 순위·최근 성적·예측처럼 전용 도구가 있는 질문은 도구를 시도하기 전에 "지원하지 않는다" 고 답하지 않는다 (get_standings·get_recent_results·get_match_prediction 등).
- 실시간 중계·개인 의견처럼 사이트가 다루지 않는 **종류**의 요청만 모른다고 답한다.
- 답변은 가능한 5문장 이내. 표보다는 짧은 불릿 또는 줄글.
- 버그·오류 제보, 광고·제휴 문의, 관리자·운영팀 연락 요청은 forward_to_admin 도구로 운영자에게 전달하고 "관리자에게 전달해 드리겠습니다. 감사합니다! 연락 받으실 텔레그램이나 이메일을 남겨주시면 관리자 확인 후 연락드립니다." 라고 답한다. 사용자가 연락처(텔레그램·이메일)를 남기면 그 연락처도 forward_to_admin 으로 다시 전달한다. 존재하지 않는 메뉴(문의하기·Contact 등)를 안내하지 말 것.
- 운영자·관리자의 개인 이메일 주소·전화번호 등 연락처를 사용자에게 알려주지 말 것. "관리자 이메일 알려줘" 같은 요청에도 특정 주소를 노출하지 말고, forward_to_admin 으로 전달한 뒤 사용자의 연락처를 받는 방향으로 안내한다.`;

/**
 * 프롬프트에 주입할 "우리가 다루는 리그" 목록 — ALL_LEAGUES(사이트 노출 단일 진실)에서 만든다.
 *
 * 하드코딩된 14개 목록을 쓰다가 실제 커버리지와 어긋나, 챗봇이 우리 데이터를 두고
 * "그 리그는 다루지 않습니다" 로 손님을 돌려보내고 있었다 — 2026-09-05 실측: 최근 30일
 * 경기가 있는 181개 리그 중 170개(11,563경기)가 거절 대상이었다. 8/23 에 챗봇이 직접
 * 추천한 세르비아 슈퍼리그 경기를 8/31 에는 "다루지 않는다" 고 답한 자기모순도 여기서 나왔다.
 *
 * ⚠ 처음엔 DB groupBy + unstable_cache 로 만들었는데 프로덕션에서 조용히 실패했다
 * (catch 가 원인을 삼켜 블록이 빈 채로 나갔고 증상이 그대로였다). 리그 구성은 배포 단위로만
 * 바뀌므로 DB 를 볼 이유가 없다 — 모듈 로드 시 한 번 계산하고 실패 경로를 없앤다.
 */
const LEAGUE_COVERAGE_BLOCK = [
  "다루는 리그 — 아래에 있으면 우리 데이터가 있는 것이다. 없다고 단정하지 말고 도구로 확인할 것.",
  ALL_LEAGUES.map((code) => `${LEAGUE_DISPLAY[code] ?? code}(${code})`).join(" · "),
].join("\n");

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

// 현재 경로가 경기 상세(/live/{league}/{gameId})면 그 경기를 챗봇에 알려주는 문장을 만든다.
// gameId = Match.externalId 라 조회해 Match.id 를 얻는다(get_match_prediction 은 숫자 id 를 받음).
async function resolveMatchContext(path: string | undefined): Promise<string | null> {
  if (!path) return null;
  const m = path.match(/^\/live\/[^/]+\/([^/?#]+)/);
  if (!m) return null;
  let externalId: string;
  try {
    externalId = decodeURIComponent(m[1]);
  } catch {
    externalId = m[1];
  }
  const match = await prisma.match.findFirst({
    where: { externalId },
    select: {
      id: true,
      homeTeam: { select: { nameKo: true, name: true } },
      awayTeam: { select: { nameKo: true, name: true } },
    },
  });
  if (!match) return null;
  const home = match.homeTeam?.nameKo || match.homeTeam?.name || "홈팀";
  const away = match.awayTeam?.nameKo || match.awayTeam?.name || "원정팀";
  return `사용자는 지금 "${home} vs ${away}" 경기(matchId ${match.id}) 상세 페이지를 보고 있습니다. 사용자가 "이 경기", "이거", "여기" 처럼 특정 경기를 지칭하면 이 경기를 뜻합니다. 이 경기에 대한 질문(예측·배당·라인업·전망)은 어떤 경기인지 되묻지 말고 get_match_prediction 도구에 matchId ${match.id} 로 답하세요.`;
}

function getClientIp(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: Request) {
  const h = await headers();
  const ip = getClientIp(h);
  // IP 버스트 + IP 일일 + 전체 일일 3단 한도. 저장소 장애 시 fail-closed.
  const limit = await consumeChatQuota(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limitMessage(limit) },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: { messages?: IncomingMessage[]; path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청." }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "messages 가 비어 있음." }, { status: 400 });
  }
  if (incoming.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "대화가 너무 깁니다." }, { status: 400 });
  }

  const lastUser =
    [...incoming].reverse().find((m) => m.role === "user")?.content?.slice(0, MAX_USER_LEN).trim() ?? "";

  // AI 킬스위치 — 기본은 켜짐(질문에 답변). CHATBOT_AI_ENABLED=false 로 끄면
  // Claude 미호출·무과금 모드가 되어 사용자 메시지를 제보로 텔레그램 전달만 한다.
  if (process.env.CHATBOT_AI_ENABLED === "false") {
    if (lastUser) {
      try {
        await executeTool("forward_to_admin", { message: lastUser, category: "문의" });
      } catch (err) {
        console.error("[chat] off-mode 제보 전달 실패", err);
      }
    }
    return NextResponse.json({
      reply:
        "남겨주신 내용은 관리자에게 전달해 드렸어요. 감사합니다! 연락 받으실 텔레그램이나 이메일을 함께 남겨주시면 관리자 확인 후 연락드립니다.",
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const messages: Anthropic.MessageParam[] = incoming.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content.slice(0, MAX_USER_LEN) : "",
  }));

  // 경기 상세 페이지에서 열었으면 그 경기를 system 에 알려준다(조회 실패는 무시).
  let matchContext: string | null = null;
  try {
    matchContext = await resolveMatchContext(body.path);
  } catch (e) {
    console.error("[chat] 경기 컨텍스트 해석 실패", e);
  }

  // 리그 목록은 프롬프트와 함께 캐시 — 둘 다 시간 단위로만 바뀐다.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `${SYSTEM_PROMPT}\n\n${LEAGUE_COVERAGE_BLOCK}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  // 경기 컨텍스트는 캐시된 프롬프트와 분리(경기마다 캐시 무효화 방지).
  if (matchContext) {
    systemBlocks.push({ type: "text", text: matchContext });
  }

  try {
    let iterations = 0;
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations += 1;
      const response = await claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.4,
        system: systemBlocks,
        tools: TOOL_DEFS,
        messages,
      });

      // 계측 — generate() 를 안 거치고 SDK 를 직접 부르므로 여기서 직접 기록한다.
      // 도구 호출은 턴마다 따로 과금되므로 루프 안에서 턴마다 센다.
      // 캐시 읽기·생성분도 입력 토큰에 더한다(system 을 ephemeral 캐시로 태워 보낸다).
      const u = response.usage;
      await trackLlmUsage(
        response.model,
        u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        u.output_tokens,
        "chat",
      );

      // assistant 메시지 누적
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "tool_use") {
        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const t of toolUses) {
          let result: string;
          try {
            result = await executeTool(t.name, t.input as Record<string, unknown>);
          } catch (err) {
            result = `(도구 실행 오류: ${(err as Error).message})`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: t.id,
            content: result,
          });
        }
        messages.push({ role: "user", content: toolResults });
        continue; // 다음 턴
      }

      // 최종 텍스트 추출
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      // 대화 저장 (실패는 무시 — 응답을 막지 않음)
      try {
        await prisma.chatLog.create({
          data: { question: lastUser, answer: text, ip },
        });
      } catch (e) {
        console.error("[chat] 로그 저장 실패", e);
      }

      return NextResponse.json({
        reply: text || "(빈 응답)",
        usage: response.usage,
      });
    }

    return NextResponse.json(
      { reply: "도구 호출 한도를 초과했습니다. 질문을 단순화해 다시 시도해 주세요." },
    );
  } catch (err) {
    console.error("[chat]", err);
    // Claude 실패(크레딧 소진·API 오류 등) 시 — 사용자에겐 에러 대신 제보 접수로 응대하고 운영자에게 전달.
    if (lastUser) {
      try {
        await executeTool("forward_to_admin", { message: lastUser, category: "문의" });
      } catch {
        // 전달 실패는 무시
      }
    }
    return NextResponse.json({
      reply:
        "죄송해요, 지금은 답변을 드리기 어려워요. 남겨주신 내용은 관리자에게 전달해 드렸어요. 연락 받으실 텔레그램이나 이메일을 남겨주시면 확인 후 연락드립니다.",
    });
  }
}
