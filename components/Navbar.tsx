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
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Homes%20Drive%20Logo%20Blue.png"
            alt="Homes.ph Drive"
            className="h-8 w-auto object-contain sm:h-10"
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

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/login"
            className="inline-flex items-center text-[10px] font-semibold tracking-[0.18em] transition-opacity hover:opacity-70 sm:text-xs"
            style={{ color: "#43474e" }}
          >
            SIGN IN
          </Link>
          <Link
            href="/signup"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] transition hover:opacity-80"
            style={{
              borderColor: "#002045",
              color: "#002045",
            }}
          >
            SIGN UP
          </Link>
          <Link
            href="/signup"
            className="inline-flex sm:hidden items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.18em] transition hover:opacity-80"
            style={{ borderColor: "#002045", color: "#002045" }}
          >
            SIGN UP
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-white transition hover:opacity-90 sm:px-5 sm:py-2.5 sm:text-sm sm:tracking-normal"
            style={{ backgroundColor: "#b52426" }}
          >
            <span className="hidden sm:inline">Explore Photos</span>
            <span className="sm:hidden">EXPLORE</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
