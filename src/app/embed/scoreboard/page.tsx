// 방송 오버레이 스코어보드 임베드 — OBS 브라우저 소스/iframe 용 (사이트 chrome 없음, 투명 배경).
// URL: /embed/scoreboard?league=EPL&id=560547&bg=transparent&size=1&clock=1&names=short&league_badge=0
import type { Metadata } from "next";
import ScoreboardOverlay from "@/components/embed/ScoreboardOverlay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "라이브 스코어보드 오버레이",
  robots: { index: false, follow: false },
};

export default async function ScoreboardEmbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const league = one("league");
  const id = one("id");
  const bgRaw = one("bg");
  const bg: "transparent" | "dark" | "light" = bgRaw === "dark" || bgRaw === "light" ? bgRaw : "transparent";
  const size = Number(one("size")) || 1;
  const clock = one("clock") !== "0";
  const names = one("names") === "full" ? "full" : "short";
  const showLeague = one("league_badge") === "1";

  return (
    <>
      {/* 투명 오버레이 — 사이트 배경색을 지운다. OBS 는 페이지 배경을 그대로 합성한다. */}
      <style>{`html,body{background:transparent!important;margin:0}body>*{background:transparent}`}</style>
      <div className="flex items-start justify-center p-2">
        {league && id ? (
          <ScoreboardOverlay league={league} id={id} bg={bg} size={size} clock={clock} names={names} showLeague={showLeague} />
        ) : (
          <div className="rounded-xl bg-black/75 px-4 py-3 text-sm text-white">league·id 파라미터가 필요합니다. 예: /embed/scoreboard?league=EPL&id=560547</div>
        )}
      </div>
    </>
  );
}
