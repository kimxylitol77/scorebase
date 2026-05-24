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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{processed}</ReactMarkdown>
    </div>
  );
}
