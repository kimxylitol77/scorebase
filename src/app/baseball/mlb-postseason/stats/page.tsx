// 옛 주소 — MLB 포스트시즌 선수 통계는 MLB·KBO·NPB 통합 페이지(/baseball/postseason/stats)로 옮겼다. 쿼리는 그대로 넘긴다.
import { permanentRedirect } from "next/navigation";

export default async function OldMlbPostseasonStats({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const qs = new URLSearchParams({ league: "MLB" });
  for (const [k, v] of Object.entries(await searchParams)) if (v && k !== "league") qs.set(k, v);
  permanentRedirect(`/baseball/postseason/stats?${qs}`);
}
