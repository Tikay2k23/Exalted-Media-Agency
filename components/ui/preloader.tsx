"use client";

import { useId } from "react";

import styles from "./preloader.module.css";

/**
 * The application preloader.
 *
 * One loader, for the moments when nothing useful can be shown yet: the first
 * paint, a hard refresh, a route whose data has not arrived. Not for saving a
 * task, opening a drawer or switching a client tab - those have their own
 * local states and blocking the screen for them would be a step backwards.
 *
 * A client component only because of the gradient id. Two of these on screen
 * at once would otherwise define the same id twice, and the second would
 * silently paint with the first one's gradient; useId gives each instance its
 * own and matches between the server and the browser, so there is no
 * hydration mismatch either.
 */
export function Preloader({ fullScreen = false }: { fullScreen?: boolean }) {
  /* Colons are legal in an id but awkward inside url(#...), so they go. */
  const gradientId = `pl-grad-${useId().replace(/:/g, "")}`;

  return (
    <div
      /*
       * The status role belongs to the container, and the label is fixed:
       * nothing here changes, so a screen reader announces "Loading" once
       * rather than narrating an animation.
       */
      role="status"
      aria-label="Loading"
      className={`${styles.screen}${fullScreen ? ` ${styles.fullScreen}` : ""}`}
    >
      <svg
        className={styles.pl}
        viewBox="0 0 128 128"
        width="128px"
        height="128px"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(193,90%,55%)" />
            <stop offset="100%" stopColor="hsl(223,90%,55%)" />
          </linearGradient>
        </defs>

        <circle
          className={styles.ring}
          r="56"
          cx="64"
          cy="64"
          fill="none"
          strokeWidth="16"
          strokeLinecap="round"
        />

        <path
          className={styles.worm}
          d="M92,15.492S78.194,4.967,66.743,16.887c-17.231,17.938-28.26,96.974-28.26,96.974L119.85,59.892l-99-31.588,57.528,89.832L97.8,19.349,13.636,88.51l89.012,16.015S81.908,38.332,66.1,22.337C50.114,6.156,36,15.492,36,15.492a56,56,0,1,0,56,0Z"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="44 1111"
          strokeDashoffset="10"
        />
      </svg>
    </div>
  );
}
