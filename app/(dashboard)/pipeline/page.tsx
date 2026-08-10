import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The drag-and-drop board used to live here.
 *
 * It showed the same accounts, grouped by the same stages, as the Client
 * Journey page - two pages answering one question, which is most of why nobody
 * knew which to open.
 *
 * The journey page is the better of the two, and not by preference: it shows
 * what a stage requires *before* the move, so a blocked account is explained
 * rather than discovered. Dragging a card could only fail after the drop.
 *
 * Kept as a redirect rather than deleted so existing links and bookmarks still
 * land somewhere useful.
 */
export default function PipelinePage() {
  redirect("/journey");
}
