// User-Agent 로 디바이스 (모바일/태블릿/데스크탑) 분류.
// admin/stats 페이지 모바일 비율 표시용. 봇 감지는 bot-detect.ts 사용.
//
// 보수적 분류 — UA 가 명확히 모바일/태블릿일 때만 그쪽으로, 모호한 건 데스크탑.
// iPadOS 13+ Safari 는 desktop UA 와 동일해서 감지 불가 (Apple 정책).

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  type: DeviceType;
  /** 짧은 이름 (예: "iPhone", "Android", "iPad", "Desktop") */
  name: string;
}

export function detectDevice(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { type: "desktop", name: "Unknown" };

  // 태블릿 — iPad / Android Tablet
  if (/iPad/i.test(ua)) return { type: "tablet", name: "iPad" };
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) {
    return { type: "tablet", name: "Android Tablet" };
  }
  if (/Tablet/i.test(ua)) return { type: "tablet", name: "Tablet" };

  // 모바일
  if (/iPhone/i.test(ua)) return { type: "mobile", name: "iPhone" };
  if (/iPod/i.test(ua)) return { type: "mobile", name: "iPod" };
  if (/Android/i.test(ua)) return { type: "mobile", name: "Android" };
  if (/webOS|Opera Mini|IEMobile|BlackBerry/i.test(ua)) {
    return { type: "mobile", name: "Mobile (etc)" };
  }
  if (/Mobi/i.test(ua)) return { type: "mobile", name: "Mobile" };

  // 데스크탑
  if (/Macintosh/i.test(ua)) return { type: "desktop", name: "Mac" };
  if (/Windows/i.test(ua)) return { type: "desktop", name: "Windows" };
  if (/Linux/i.test(ua)) return { type: "desktop", name: "Linux" };
  if (/CrOS/i.test(ua)) return { type: "desktop", name: "ChromeOS" };

  return { type: "desktop", name: "Unknown" };
}

export const DEVICE_LABEL: Record<DeviceType, { label: string; emoji: string }> = {
  mobile: { label: "모바일", emoji: "📱" },
  tablet: { label: "태블릿", emoji: "📲" },
  desktop: { label: "데스크탑", emoji: "💻" },
};
