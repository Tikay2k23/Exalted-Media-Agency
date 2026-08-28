import { Preloader } from "@/components/ui/preloader";

/**
 * The first paint.
 *
 * Shown while the application initialises and while the session is verified -
 * the moments when there is genuinely nothing useful to put on screen yet.
 * Routes inside the dashboard have their own boundary that keeps the shell,
 * so this is the outermost case only: a cold load, a hard refresh, or a
 * direct URL.
 */
export default function Loading() {
  return <Preloader fullScreen />;
}
