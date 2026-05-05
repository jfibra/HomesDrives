"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "MARKETPLACE" },
    { href: "/about", label: "ABOUT" },
    { href: "/contact", label: "CONTACT" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex h-20 items-center"
      style={{
        backgroundColor: "rgba(249,249,255,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #c4c6cf",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-8">
        <Link href="/" className="inline-flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Homes%20Drive%20Logo%20Blue.png"
            alt="Homes.ph Drive"
            className="h-10 w-auto object-contain"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs font-semibold tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{
                color: isActive(item.href) ? "#b52426" : "#43474e",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/"
          className="hidden sm:inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "#b52426" }}
        >
          Explore Photos
        </Link>
      </div>
    </header>
  );
}
