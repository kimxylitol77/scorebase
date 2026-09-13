// 헤더 "AI에게 묻기" → 플로팅 챗봇 열기 — 페이지 어디서든 window 이벤트 하나로 연다(2026-09-13, 사용자 승인).
// 전역 Chatbot 과 경기 전용 MatchChat 이 둘 다 이 이벤트를 듣는다(경기 상세에선 전역 챗봇이 비켜 있으므로).
export const OPEN_CHAT_EVENT = "scorebase:open-chat";

export interface OpenChatDetail {
  /** 입력창에 미리 채울 질문(선택) — 사용자가 전송 버튼을 눌러야 보낸다 */
  preset?: string;
}

export function openChat(preset?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenChatDetail>(OPEN_CHAT_EVENT, { detail: { preset } }));
}
