import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

export function Layout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  // Client-side navigation doesn't move focus on its own; without this,
  // keyboard and screen reader users stay on the link they just activated.
  // Comparing paths (not a first-render flag) keeps it correct when React
  // StrictMode runs effects twice, and ignores query-only changes like paging.
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <>
      <a
        href="#main"
        className="sr-only rounded bg-sheet px-4 py-2 font-medium text-pen focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10"
      >
        Skip to main content
      </a>

      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4 sm:px-6">
          <Link to="/" className="font-display text-xl font-semibold text-ink">
            DocuMind AI
          </Link>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8 outline-none sm:px-6">
        <Outlet />
      </main>
    </>
  );
}
