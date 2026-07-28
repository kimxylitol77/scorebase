import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { autoLinkInternal } from "@/lib/internal-links";

interface Props {
  children: string;
  /** 자동 내부 링크 비활성 (관리자 미리보기 등) */
  disableAutoLink?: boolean;
  /** 자기 페이지 링크 자기로 거는 거 방지 */
  selfHref?: string;
}

export default function Markdown({ children, disableAutoLink, selfHref }: Props) {
  // 글당 최대 2개 키워드 자동 internal link
  const processed = disableAutoLink
    ? children
    : autoLinkInternal(children, { maxLinks: 2, selfHref });

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h1:leading-tight prose-h1:mb-4 prose-h2:text-xl prose-h2:mt-8 prose-h3:text-lg prose-p:leading-7 prose-strong:font-semibold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 업로드 동영상(/api/file/{id}?v=1) — 마크다운엔 이미지 문법으로 넣고 여기서 <video> 로 렌더.
          img: ({ src, alt }) => {
            const s = typeof src === "string" ? src : "";
            if (s.startsWith("/api/file/") && s.includes("v=1")) {
              // 세로 쇼츠가 본문 폭을 꽉 채우면 과대 — 높이 제한 + 가운데 정렬 (가로 영상은 max-w 로 자연 제한)
              return (
                <video
                  src={s}
                  controls
                  playsInline
                  preload="metadata"
                  className="mx-auto w-auto max-w-full max-h-[560px] rounded-xl"
                />
              );
            }
            // 경기 데이터 카드(AI 승률·배당 짤) — 처음 보는 독자가 "이건 어디서 만드나"를 알도록
            // 사용법 캡션을 자동으로 붙인다. span 사용 = ReactMarkdown 이 img 를 <p> 안에 두므로
            // figure/div 를 쓰면 hydration 경고(p 안의 block)가 난다.
            if (s.startsWith("/api/og/match-card")) {
              return (
                <span className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s} alt={alt ?? "경기 데이터 카드"} loading="lazy" className="rounded-xl !my-0" />
                  <span className="mt-1.5 block text-center text-xs text-neutral-400">
                    AI 승률·배당 카드 — 글쓰기에서 예측 경기를 고르면 &ldquo;경기 데이터 카드 첨부&rdquo;로 자동 생성됩니다
                  </span>
                </span>
              );
            }
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={s} alt={alt ?? ""} loading="lazy" className="rounded-xl" />;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
