import { redirect } from "next/navigation";

// /predictions 진입 시 기본 리그(EPL)로 리다이렉트.
export default function PredictionsRoot() {
  redirect("/predictions/EPL");
}
