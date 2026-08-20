import { BookOpen, Heart, ShieldCheck, Users } from "lucide-react";
import Image from "next/image";

import { ExaltedLockup } from "@/components/brand/exalted-mark";

/**
 * The left half of the sign-in screen.
 *
 * Carries the brand and the reason behind it. The Christian identity comes
 * through the values and one verse rather than decoration - no crosses, no
 * church imagery, nothing that would look out of place in front of a client.
 *
 * Everything here is sized against the viewport height rather than in fixed
 * pixels, because the page is a single fold: the panel has to hold a logo, a
 * headline, three values and a verse inside whatever height the screen has,
 * without a scrollbar. clamp() gives each piece a floor, a share of the
 * screen, and a ceiling, so a 900px laptop and a 1440px monitor both land on a
 * full-looking panel rather than one padded with dead space or one that
 * overflows.
 *
 * Each share is min(vh, vw), not vh alone. Height is what usually runs out,
 * but at 1024x768 the panel column is only 470px of text and the value lines
 * wrapped to two - which put 34px of the panel past its own bottom edge. The
 * vw term steps the type down when the column is the tighter of the two
 * dimensions; on a wide screen it never binds and the height term decides.
 *
 * Server-rendered: entirely static, so none of it reaches the browser as
 * JavaScript.
 */

/** White lettering on transparency. For the dark panel only. */
export const LOGO_LIGHT_SRC = "/exalted-logo-light.png";
/*
 * Black lettering on a white matte. For the light phone and tablet layout.
 *
 * Its own file rather than a new crop written over exalted-wordmark.png, and
 * suffixed when the crop was tightened. The URL is the cache key, and
 * next/image sends optimized derivatives with a long max-age: replacing the
 * bytes under an unchanged path left browsers decoding the previous shape
 * long after the file on disk had changed, through a server restart and a
 * cleared image cache. A new path is the only reliable invalidation.
 */
export const LOGO_DARK_SRC = "/exalted-logo-dark-v2.png";
export const BACKGROUND_SRC = "/login-mountains.webp";

/*
 * Each file's own pixel dimensions, so next/image never distorts either one.
 *
 * They are not the same shape - the transparent artwork is 2.93:1 and the
 * wordmark is 3.88:1 - so one shared pair of numbers would squash whichever
 * logo it did not describe.
 */
const LOGO_LIGHT_INTRINSIC = { width: 2048, height: 699 };
const LOGO_DARK_INTRINSIC = { width: 1203, height: 310 };

const VALUES = [
  {
    icon: Users,
    title: "Excellence",
    description: "Do every assignment with care, discipline, and high standards.",
  },
  {
    icon: ShieldCheck,
    title: "Stewardship",
    description: "Manage time, clients, resources, and responsibilities faithfully.",
  },
  {
    icon: Heart,
    title: "Service",
    description: "Use our skills to create meaningful results for the people we serve.",
  },
];

export interface BrandAssets {
  /** The white-lettering logo on transparency, for dark panels. */
  hasLightLogo: boolean;
  /** The mountain photograph behind the panel. */
  hasBackground: boolean;
}

/**
 * The logo, at the size the fold can afford.
 *
 * Falls back to the lockup the rest of the app already uses on dark surfaces
 * when the transparent artwork is not in place. The other wordmark in the
 * repository is the light-mode file - dark lettering on a solid white matte -
 * so putting that one on navy renders a white rectangle rather than a logo.
 */
function Wordmark({ hasLightLogo }: { hasLightLogo: boolean }) {
  if (!hasLightLogo) {
    return (
      <div className="origin-left scale-100 lg:scale-125 xl:scale-[1.6]">
        <ExaltedLockup tone="light" idSuffix="login" />
      </div>
    );
  }

  return (
    <Image
      src={LOGO_LIGHT_SRC}
      alt="The Exalted Media, Elevated"
      width={LOGO_LIGHT_INTRINSIC.width}
      height={LOGO_LIGHT_INTRINSIC.height}
      priority
      sizes="(min-width: 1280px) 340px, (min-width: 1024px) 260px, 200px"
      className="h-auto w-[clamp(10rem,min(29vh,20vw),21rem)]"
    />
  );
}

export function BrandPanel({ hasLightLogo, hasBackground }: BrandAssets) {
  return (
    <section className="relative isolate hidden h-full overflow-hidden bg-[#070b18] px-[clamp(2rem,3.6vw,4.5rem)] py-[clamp(1.5rem,4.2vh,3.25rem)] lg:flex lg:flex-col lg:justify-between">
      {hasBackground ? (
        <>
          {/*
            * Framed to the right of centre.
            *
            * The photograph is landscape and the panel is a tall column, so
            * object-cover has to drop roughly a third of the width. Centring
            * it would crop away the ridgeline and the band of dawn light,
            * which are the only things in the frame that read at this size -
            * the left third of the picture is close to black.
            */}
          <Image
            src={BACKGROUND_SRC}
            alt=""
            aria-hidden
            fill
            priority
            sizes="(min-width: 1280px) 60vw, 50vw"
            className="-z-20 object-cover object-[68%_center]"
          />
          {/*
            * The navy wash that keeps the words readable.
            *
            * Weighted to the left, where the text sits, and thinner to the
            * lower right so the ridgeline still reads. A flat overlay at one
            * opacity either drowns the photograph or leaves the paragraph
            * fighting the sky behind it.
            */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(100deg, rgba(7,11,24,0.92) 0%, rgba(7,11,24,0.8) 45%,"
                + " rgba(9,14,32,0.55) 100%)",
            }}
          />
        </>
      ) : (
        /*
         * Depth without the photograph.
         *
         * Shown if the mountain image is ever missing: brand-coloured pools
         * that carry the same gradient as the rest of the app, so the panel
         * still reads as intentional rather than as a broken asset.
         */
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60rem 40rem at 15% -10%, rgba(0,87,254,0.22), transparent 60%),"
              + "radial-gradient(45rem 35rem at 90% 110%, rgba(250,1,204,0.16), transparent 60%)",
          }}
        />
      )}

      <div>
        <Wordmark hasLightLogo={hasLightLogo} />

        <h1 className="mt-[clamp(1.25rem,3.8vh,2.75rem)] max-w-[40rem] font-bold tracking-tight text-white">
          <span className="block text-[clamp(1.625rem,min(6.2vh,4.2vw),3.5rem)] font-extrabold leading-[1.08]">
            Built with purpose.
          </span>
          <span className="mt-1 block bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-400 bg-clip-text text-[clamp(1.375rem,min(5.4vh,3.7vw),3.125rem)] font-bold leading-[1.14] text-transparent">
            Led by faith. Driven by excellence.
          </span>
        </h1>

        <div
          aria-hidden
          className="mt-[clamp(0.875rem,2.4vh,1.75rem)] h-[3px] w-[clamp(3.5rem,7vh,5rem)] rounded-full bg-gradient-to-r from-sky-400 to-indigo-500"
        />

        <p className="mt-[clamp(0.875rem,2.4vh,1.75rem)] max-w-[37.5rem] text-[clamp(0.875rem,min(2.15vh,1.5vw),1.1875rem)] leading-[1.55] text-slate-300">
          A faith-led operating system for a team committed to stewardship, integrity,
          excellence, and meaningful service.
        </p>

        <ul className="mt-[clamp(1.25rem,3.4vh,2.5rem)] space-y-[clamp(0.875rem,2.5vh,1.875rem)]">
          {VALUES.map((value) => (
            <li
              key={value.title}
              className="flex items-start gap-[clamp(0.75rem,1.6vh,1.25rem)]"
            >
              <span
                className="inline-flex aspect-square w-[clamp(2.25rem,min(5.5vh,3.7vw),3.375rem)] shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-sky-300 backdrop-blur-sm"
                aria-hidden
              >
                <value.icon className="h-[45%] w-[45%]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[clamp(0.9375rem,min(2.5vh,1.7vw),1.375rem)] font-semibold leading-tight text-white">
                  {value.title}
                </h2>
                <p className="mt-1 max-w-[34rem] text-[clamp(0.8125rem,min(1.9vh,1.28vw),1.0625rem)] leading-[1.5] text-slate-400">
                  {value.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/*
        * The verse sits last and quietest on the page.
        *
        * The meaning behind the name rather than a banner: separated by a rule,
        * set below the values, and given the same restrained treatment as
        * everything else.
        */}
      <figure className="mt-[clamp(1rem,2.8vh,2.25rem)] border-t border-white/10 pt-[clamp(0.875rem,2.4vh,1.75rem)]">
        <div className="flex items-start gap-[clamp(0.75rem,1.6vh,1.25rem)]">
          <span
            className="inline-flex aspect-square w-[clamp(2.25rem,min(5.5vh,3.7vw),3.375rem)] shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-indigo-300 backdrop-blur-sm"
            aria-hidden
          >
            <BookOpen className="h-[45%] w-[45%]" />
          </span>
          <div className="min-w-0">
            <figcaption className="text-[clamp(0.6875rem,min(1.7vh,1.15vw),1rem)] font-semibold uppercase tracking-[0.3em] text-indigo-300">
              Joshua 3:7
            </figcaption>
            <blockquote className="mt-1.5 max-w-[40rem] text-[clamp(0.8125rem,min(1.95vh,1.3vw),1.0625rem)] leading-[1.5] text-slate-300">
              &ldquo;And the LORD said to Joshua, &lsquo;Today I will begin to exalt you in
              the eyes of all Israel, so they may know that I am with you as I was with
              Moses.&rsquo;&rdquo;
            </blockquote>
          </div>
        </div>
      </figure>
    </section>
  );
}

/**
 * The same brand, compressed for a phone or a portrait tablet.
 *
 * This half of the page is light, so it takes the black wordmark rather than
 * the white one the panel uses - a white-lettering logo needs a dark chip
 * behind it here, and that chip was a box of navy sitting on a pale screen for
 * no reason other than the file it held.
 *
 * A full-height panel above the form would mean scrolling past three values
 * and a verse to reach a password field, which is the wrong order for somebody
 * signing in on their way somewhere.
 */
export function BrandHeaderCompact({ hasDarkLogo }: { hasDarkLogo: boolean }) {
  return (
    <div className="lg:hidden">
      {hasDarkLogo ? (
        /*
         * The wordmark carries a solid white background rather than
         * transparency, which would show as a pale block against the slate the
         * page uses below lg. mix-blend-multiply solves that exactly: white
         * multiplied by the page leaves the page, so the matte disappears,
         * while the black lettering stays black and the gradient X shifts by
         * the three percent between white and slate-50 - which is nothing.
         */
        <Image
          src={LOGO_DARK_SRC}
          alt="The Exalted Media, Elevated"
          width={LOGO_DARK_INTRINSIC.width}
          height={LOGO_DARK_INTRINSIC.height}
          priority
          sizes="220px"
          className="h-auto w-[clamp(8rem,19.5vh,13.75rem)] mix-blend-multiply"
        />
      ) : (
        <ExaltedLockup tone="dark" idSuffix="login-compact" />
      )}

      <p className="mt-3.5 text-[clamp(0.8125rem,1.7vh,1rem)] font-medium leading-[1.4] text-slate-600">
        Built with purpose.{" "}
        <span className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">
          Led by faith. Driven by excellence.
        </span>
      </p>
    </div>
  );
}

/** The verse, kept for phones, below the form where it cannot get in the way. */
export function ScriptureFooterCompact() {
  return (
    <p className="mt-[clamp(0.75rem,2.2vh,2rem)] text-center text-[clamp(0.6875rem,1.45vh,0.875rem)] leading-[1.45] text-slate-400 lg:hidden">
      <span className="font-semibold uppercase tracking-[0.25em] text-indigo-500">
        Joshua 3:7
      </span>
      <span className="mt-1 block">
        &ldquo;Today I will begin to exalt you in the eyes of all Israel.&rdquo;
      </span>
    </p>
  );
}
