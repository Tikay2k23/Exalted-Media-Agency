import { Preloader } from "@/components/ui/preloader";

/**
 * A dashboard route whose data has not arrived.
 *
 * Inside the layout, so the sidebar and the top bar stay where they are and
 * only the content area waits - a page change should not look like the
 * application restarting.
 *
 * Client tab switching does not reach this. Those tabs are state in
 * ClientTabs and move through history.pushState rather than a navigation,
 * so no loading boundary is involved and the record stays on screen.
 */
export default function Loading() {
  return <Preloader />;
}
