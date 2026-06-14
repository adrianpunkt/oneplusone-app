import { redirect } from "next/navigation";

import { getOptionalMemberContext } from "@/lib/data/member";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const context = await getOptionalMemberContext();
  redirect(context ? "/dashboard" : "/login");
}
