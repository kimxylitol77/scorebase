// sportspredictions.live 프리뷰 본문 렌더 — 공용 Markdown 의 한국어 자동 내부링크 없이, sp 토큰 색으로.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function SpMarkdown({ children }: { children: string }) {
  return (
    <div className="sp-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
