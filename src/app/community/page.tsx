// 자유게시판 — 스포츠 분석과 한 게시판으로 통합(/analysis?board=free). 기존 링크 호환용 리다이렉트.
import { redirect } from "next/navigation";

export default function CommunityRedirect() {
  redirect("/analysis?board=free");
}
