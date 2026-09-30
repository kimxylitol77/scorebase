// SNS 글 주소 → 임베드 정보 파서. 인스타그램·X·Threads 공개 글만 허용한다(인증샷 모음 /community/proof).
// 외부 스크립트 없이 각 플랫폼의 공식 임베드 주소를 iframe 으로 직접 건다.
export type SnsPlatform = "instagram" | "x" | "threads";

export interface SnsEmbedInfo {
  platform: SnsPlatform;
  /** 중복 판정·원문 링크용 정규 주소 (쿼리·추적 파라미터 제거) */
  url: string;
  /** iframe src */
  embedUrl: string;
}

export const SNS_LABEL: Record<SnsPlatform, string> = { instagram: "인스타그램", x: "X", threads: "Threads" };

const ID = /^[A-Za-z0-9_-]+$/;
const USER = /^[A-Za-z0-9_.]+$/;

export function parseSnsUrl(raw: string): SnsEmbedInfo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m|mobile)\./, "");
  const seg = u.pathname.split("/").filter(Boolean);

  if (host === "instagram.com") {
    // /p/{code} · /reel/{code} · /{user}/p/{code}
    const i = seg.findIndex((s) => s === "p" || s === "reel" || s === "reels");
    const code = i >= 0 ? seg[i + 1] : undefined;
    if (!code || !ID.test(code)) return null;
    const url = `https://www.instagram.com/p/${code}/`;
    return { platform: "instagram", url, embedUrl: `${url}embed/` };
  }
  if (host === "x.com" || host === "twitter.com") {
    // /{user}/status/{id}
    const i = seg.indexOf("status");
    const id = i >= 1 ? seg[i + 1] : undefined;
    const user = seg[0];
    if (!id || !/^\d{5,25}$/.test(id) || !USER.test(user)) return null;
    return {
      platform: "x",
      url: `https://x.com/${user}/status/${id}`,
      embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&lang=ko&dnt=true`,
    };
  }
  if (host === "threads.net" || host === "threads.com") {
    // /@{user}/post/{code}
    const user = seg[0]?.startsWith("@") ? seg[0].slice(1) : undefined;
    const code = seg[1] === "post" ? seg[2] : undefined;
    if (!user || !code || !USER.test(user) || !ID.test(code)) return null;
    const url = `https://www.threads.net/@${user}/post/${code}`;
    return { platform: "threads", url, embedUrl: `${url}/embed` };
  }
  return null;
}
