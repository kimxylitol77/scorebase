// /admin/agents — 5명의 전문 에이전트 채팅 페이지 (server entry).
import AgentChat from "./AgentChat";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "에이전트 회의실 — Scorebase Admin",
};

export default function AgentsPage() {
  return <AgentChat />;
}
