import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The Team page moved into My Work.
 *
 * Kept as a redirect rather than deleted: bookmarks exist, and two places in
 * the stage-gate remedies still link here to say "go and assign somebody".
 * Permanent, so browsers and anything reading the response learn the new home
 * rather than asking again every time.
 */
export default function TeamPage() {
  permanentRedirect("/work");
}
