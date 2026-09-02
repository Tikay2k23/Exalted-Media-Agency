import Link from "next/link";

/**
 * The page for anything that is not there.
 *
 * Eight pages in this application already call notFound() - a client, a
 * journey, an SOP reference that does not exist, or one the reader is not
 * allowed to see - and without this file every one of them rendered a blank
 * page. A reader who follows a stale link deserves to be told the record is
 * gone rather than left looking at nothing and wondering if it is broken.
 *
 * Deliberately vague about why. This is also what a reader without permission
 * gets, and "you are not allowed to see SOP-04" confirms SOP-04 exists.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.32em] text-sky-600">Not found</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          That record is not here
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          It may have been archived or renamed, or you may not have access to it. The
          link itself is not broken.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
