import { existsSync } from "node:fs";
import path from "node:path";

import { redirect } from "next/navigation";

import {
  BACKGROUND_SRC,
  BrandHeaderCompact,
  BrandPanel,
  LOGO_DARK_SRC,
  LOGO_LIGHT_SRC,
  ScriptureFooterCompact,
} from "@/components/auth/brand-panel";
import { LoginForm } from "@/components/auth/login-form";
import { getServerAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
};

/**
 * Is the artwork actually on disk?
 *
 * Checked rather than assumed so the page degrades to the brand lockup and a
 * gradient instead of rendering a broken image or, worse, the light-mode
 * wordmark as a white rectangle on navy. Drop the files into public/ and the
 * page picks them up on the next request with no code change.
 */
function brandAssets() {
  const inPublic = (file: string) =>
    existsSync(path.join(process.cwd(), "public", file.replace(/^\//, "")));

  return {
    hasLightLogo: inPublic(LOGO_LIGHT_SRC),
    hasDarkLogo: inPublic(LOGO_DARK_SRC),
    hasBackground: inPublic(BACKGROUND_SRC),
  };
}

/**
 * The sign-in screen.
 *
 * A true split at large sizes - the branding panel fills its half edge to edge
 * rather than floating in a rounded card, which is what makes it read as a
 * front door rather than another dashboard surface.
 *
 * One fold, never a scrollbar. The page is exactly one viewport tall and both
 * columns are sized against that height, so the whole thing - branding, form,
 * verse - is what you see when it loads. svh rather than vh because a phone's
 * vh is measured with the browser chrome hidden, which would push the button
 * under the address bar.
 *
 * The form column keeps overflow-y-auto as a safety valve. On a short window,
 * or with a large font size set in the browser, the card has somewhere to go
 * rather than being clipped and made unusable. It centres with auto margins
 * rather than justify-center, which would put the top of an overflowing card
 * above the scroll origin and make it unreachable.
 *
 * The form column is a minmax track rather than a plain fraction. A fraction
 * splits whatever is there, so at 1280 the card was squeezed to 410px - the
 * minimum floors it instead, and the fraction only ever makes it wider.
 *
 * The panel appears at lg, not md. It was tried at md and measured: in a
 * 768-wide portrait tablet the panel column comes out at 375px, which pushed
 * the headline onto five lines and clipped 290px of the panel off the bottom.
 * A column that narrow cannot carry a headline, three values and a verse at
 * any type size worth reading, so below 1024 the branding comes through the
 * compact header and the verse under the form instead - and the card gets the
 * whole width rather than fighting the panel for it.
 */
export default async function LoginPage() {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  const assets = brandAssets();

  return (
    <main className="grid h-[100svh] overflow-hidden lg:grid-cols-[1fr_minmax(30rem,0.8fr)] xl:grid-cols-[1fr_minmax(36rem,0.85fr)]">
      <BrandPanel
        hasLightLogo={assets.hasLightLogo}
        hasBackground={assets.hasBackground}
      />

      <section className="flex h-full flex-col overflow-y-auto bg-slate-50 px-5 py-[clamp(0.625rem,min(4vh,3.8vw),3rem)] sm:px-8 md:px-10 lg:bg-white lg:px-10 xl:px-12">
        <div className="m-auto w-full max-w-[30rem]">
          <BrandHeaderCompact hasDarkLogo={assets.hasDarkLogo} />

          <div className="mt-[clamp(0.75rem,2.2vh,2rem)] lg:mt-0">
            <LoginForm />
          </div>

          <ScriptureFooterCompact />
        </div>
      </section>
    </main>
  );
}
