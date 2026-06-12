import { redirect } from "next/navigation";

/** The feed moved to the home page; keep old /feed links working. */
export default async function FeedRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(tab ? `/?tab=${encodeURIComponent(tab)}` : "/");
}
