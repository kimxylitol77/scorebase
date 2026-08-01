// Open-Meteo 로 도시 현재 날씨 조회 (geocoding + current weather) — 키 불필요, 서버 전용.

export interface CityWeather {
  tempC: number;
  label: string; // 한국어 날씨 상태 (맑음/흐림/비 ...)
  city: string; // geocoding 이 확정한 도시명 (영문)
}

// WMO weather code → 한국어 label (Open-Meteo current.weather_code)
function wmoLabel(code: number): string {
  if (code === 0) return "맑음";
  if (code === 1) return "대체로 맑음";
  if (code === 2) return "구름 조금";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code === 85 || code === 86) return "소낙눈";
  if (code >= 95) return "뇌우";
  return "흐림";
}

// venue country → Open-Meteo geocoding country 보정 (영국 구성국 등)
const COUNTRY_ALIASES: Record<string, string> = {
  England: "United Kingdom",
  Scotland: "United Kingdom",
  Wales: "United Kingdom",
  "Northern Ireland": "United Kingdom",
  USA: "United States",
  "Korea Republic": "South Korea",
};

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
}

// 도시명 → 좌표 (Open-Meteo geocoding, 24h 캐시)
async function geocodeCity(
  city: string,
  country?: string | null,
): Promise<GeoResult | null> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`,
    { next: { revalidate: 86400 } },
  );
  if (!geoRes.ok) return null;
  const geo: { results?: GeoResult[] } = await geoRes.json();
  const results = geo.results ?? [];
  if (results.length === 0) return null;

  const wantCountry = country ? (COUNTRY_ALIASES[country] ?? country) : null;
  return (
    (wantCountry &&
      results.find(
        (r) => r.country?.toLowerCase() === wantCountry.toLowerCase(),
      )) ||
    results[0]
  );
}

/**
 * 도시명(영문, TheSports venue city) 현재 날씨. 실패/미발견 시 null.
 * geocoding 24h · 날씨 30분 fetch 캐시 — Vercel data cache 로 도시당 캐시 공유.
 */
export async function fetchCityWeather(
  city: string,
  country?: string | null,
): Promise<CityWeather | null> {
  try {
    const picked = await geocodeCity(city, country);
    if (!picked) return null;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${picked.latitude}&longitude=${picked.longitude}&current=temperature_2m,weather_code`,
      { next: { revalidate: 1800 } },
    );
    if (!wxRes.ok) return null;
    const wx: {
      current?: { temperature_2m?: number; weather_code?: number };
    } = await wxRes.json();
    if (wx.current?.temperature_2m == null) return null;

    return {
      tempC: wx.current.temperature_2m,
      label: wmoLabel(wx.current.weather_code ?? 3),
      city: picked.name,
    };
  } catch {
    return null;
  }
}

/**
 * 특정 시각(킥오프)의 도시 날씨 — 종료 경기의 "경기 당시 날씨" 고정용.
 * Open-Meteo forecast API 의 start_date/end_date 시간별 데이터에서 가장 가까운
 * 시각을 고른다 (과거 ~92일까지). 그보다 오래된 경기는 null (배지 미표시).
 * 과거 날씨는 불변이라 24h 캐시.
 */
export async function fetchCityWeatherAt(
  city: string,
  country: string | null | undefined,
  atIso: string,
): Promise<CityWeather | null> {
  try {
    const at = new Date(atIso).getTime();
    if (!Number.isFinite(at)) return null;
    const ageDays = (Date.now() - at) / 86_400_000;
    if (ageDays > 90 || ageDays < 0) return null;

    const picked = await geocodeCity(city, country);
    if (!picked) return null;

    const dateStr = new Date(at).toISOString().slice(0, 10);
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${picked.latitude}&longitude=${picked.longitude}&hourly=temperature_2m,weather_code&start_date=${dateStr}&end_date=${dateStr}&timezone=UTC`,
      { next: { revalidate: 86400 } },
    );
    if (!wxRes.ok) return null;
    const wx: {
      hourly?: {
        time?: string[];
        temperature_2m?: (number | null)[];
        weather_code?: (number | null)[];
      };
    } = await wxRes.json();
    const times = wx.hourly?.time ?? [];
    if (times.length === 0) return null;

    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(`${times[i]}Z`).getTime() - at);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    const temp = wx.hourly?.temperature_2m?.[best];
    if (temp == null) return null;

    return {
      tempC: temp,
      label: wmoLabel(wx.hourly?.weather_code?.[best] ?? 3),
      city: picked.name,
    };
  } catch {
    return null;
  }
}
