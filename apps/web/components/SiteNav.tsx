"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/basket", label: "Basket" },
  { href: "/weekly", label: "Weekly report" },
] as const;

export function SiteNav() {
  const path = usePathname();
  return (
    <header className="topbar fade">
      <div className="mark">
        <Link href="/" className="brand">
          Carry<em>Scan</em>
        </Link>
        <span>HIP-3 · xyz</span>
      </div>
      <nav aria-label="Site" className="site-nav">
        {LINKS.map((l) => {
          const active =
            l.href === "/"
              ? path === "/"
              : path === l.href || path.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
