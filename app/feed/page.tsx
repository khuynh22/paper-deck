import { redirect } from "next/navigation";
import { discoveryHref, parseDiscovery, type DiscoveryInput } from "@/lib/corpus/discovery";

/** The feed moved to the home page; keep old /feed links working. */
export default async function FeedRedirect({
  searchParams,
}: {
  searchParams: Promise<DiscoveryInput>;
}) {
  redirect(discoveryHref("/", parseDiscovery(await searchParams)));
}
