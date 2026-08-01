// /api/weather?city=London&country=England — 매치 카드 날씨 배지용 현재 날씨.
// &at=<ISO> 를 주면 그 시각(킥오프)의 날씨 — 종료 경기 "경기 당시 날씨" 고정용.
// Open-Meteo (키 불필요) · CDN 캐시 (현재 30분 / 과거 시각 24시간).

import { NextResponse, type NextRequest } from "next/server";
import { fetchCityWeather, fetchCityWeatherAt } from "@/lib/weather";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  const country = req.nextUrl.searchParams.get("country");
  const at = req.nextUrl.searchParams.get("at");
  if (!city) {
    return NextResponse.json({ error: "city required" }, { status: 400 });
  }

  const weather = at
    ? await fetchCityWeatherAt(city, country, at)
    : await fetchCityWeather(city, country);
  return NextResponse.json(
    { weather },
    {
      headers: {
        "cache-control": weather
          ? at
            ? "public, s-maxage=86400, stale-while-revalidate=86400"
            : "public, s-maxage=1800, stale-while-revalidate=3600"
          : "public, s-maxage=300",
      },
    },
  );
}
