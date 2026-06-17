import { redirect } from "next/navigation";

import { getOptionalMemberContextForRender } from "@/lib/data/member";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const context = await getOptionalMemberContextForRender();
  redirect(context ? "/dashboard" : "/login");
}
