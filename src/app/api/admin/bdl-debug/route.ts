// 임시 debug endpoint — BDL key + LOL/NBA fetch 결과 확인용. 확인 후 삭제 예정.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.BALLDONTLIE_KEY;
  const out: Record<string, unknown> = {
    keySet: !!key,
    keyLen: key?.length ?? 0,
    keyPrefix: key?.slice(0, 4) ?? null,
  };

  // NBA player 132 (Luka)
  try {
    const r = await fetch("https://api.balldontlie.io/v1/players/132", {
      headers: { Authorization: key ?? "" },
      cache: "no-store",
    });
    out.nbaStatus = r.status;
    const txt = await r.text();
    out.nbaBody = txt.slice(0, 200);
  } catch (e) {
    out.nbaError = (e as Error).message;
  }

  // LOL player 744 (Aria)
  try {
    const url = "https://api.balldontlie.io/lol/v1/player_match_map_stats?player_id=744&tournament_ids%5B%5D=324&dates%5B%5D=2026-01-01&per_page=3";
    const r = await fetch(url, {
      headers: { Authorization: key ?? "" },
      cache: "no-store",
    });
    out.lolStatus = r.status;
    const txt = await r.text();
    out.lolBodyLen = txt.length;
    out.lolBodyHead = txt.slice(0, 300);
  } catch (e) {
    out.lolError = (e as Error).message;
  }

  return NextResponse.json(out);
}
