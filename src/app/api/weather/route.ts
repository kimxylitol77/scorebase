// /api/weather?city=London&country=England — 매치 카드 날씨 배지용 현재 날씨.
// Open-Meteo (키 불필요) · CDN 30분 캐시.

import { NextResponse, type NextRequest } from "next/server";
import { fetchCityWeather } from "@/lib/weather";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  const country = req.nextUrl.searchParams.get("country");
  if (!city) {
    return NextResponse.json({ error: "city required" }, { status: 400 });
  }

  const weather = await fetchCityWeather(city, country);
  return NextResponse.json(
    { weather },
    {
      headers: {
        "cache-control": weather
          ? "public, s-maxage=1800, stale-while-revalidate=3600"
          : "public, s-maxage=300",
      },
    },
  );
}
