"use client";

// 매치 카드 헤더의 경기장 도시 현재 날씨 배지 — /api/weather 1회 fetch, 실패 시 미표시.

import { useEffect, useState } from "react";

interface Props {
  city: string;
  country?: string | null;
  /** 배지 표시용 도시명 (한글 등) — 미지정 시 geocoding 결과 영문명 */
  label?: string | null;
  /** 킥오프 ISO — 지정 시 그 시각의 날씨로 고정 (종료 경기용). 미지정 시 현재 날씨 */
  at?: string | null;
}

interface WeatherData {
  tempC: number;
  label: string;
  city: string;
}

export default function MatchWeather({ city, country, label, at }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ city });
    if (country) params.set("country", country);
    if (at) params.set("at", at);
    fetch(`/api/weather?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { weather?: WeatherData | null } | null) => {
        if (alive && json?.weather) setWeather(json.weather);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [city, country, at]);

  if (!weather) return null;

  return (
    <span
      className="text-[10px] text-neutral-500 whitespace-nowrap"
      title={`${label ?? weather.city} ${at ? "경기 당시 날씨" : "현재 날씨"}`}
    >
      {label ?? weather.city} {Math.round(weather.tempC)}°C · {weather.label}
    </span>
  );
}
