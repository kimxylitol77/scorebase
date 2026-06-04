import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

// /analysis/ranking → /experts 일원화 (2026-06-04). 같은 적중률 랭킹 데이터가 두 페이지로
// 중복돼 전문가 페이지(/experts)로 통합. tab(월간) 보존 + 기존 색인/북마크 308 전달.
export default async function RankingRedirect({ searchParams }: Props) {
  const { tab } = await searchParams;
  permanentRedirect(tab === "monthly" ? "/experts?tab=monthly" : "/experts");
}
