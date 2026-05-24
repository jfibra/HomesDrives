"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: "/", label: "MARKETPLACE" },
    { href: "/map", label: "MAP" },
    { href: "/about", label: "ABOUT" },
    { href: "/contact", label: "CONTACT" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-50 flex h-16 items-center sm:h-20"
        style={{
          backgroundColor: "rgba(249,249,255,0.92)",
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
              className="h-7 w-auto object-contain sm:h-10"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-xs font-semibold tracking-[0.18em] transition-opacity hover:opacity-70"
                style={{ color: isActive(item.href) ? "#b52426" : "#43474e" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center text-xs font-semibold tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: "#43474e" }}
            >
              SIGN IN
            </Link>
            <Link
              href="/signup"
              className="hidden md:inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] transition hover:opacity-80"
              style={{ borderColor: "#002045", color: "#002045" }}
            >
              SIGN UP
            </Link>
            <Link
              href="/"
              className="hidden md:inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "#b52426" }}
            >
              Explore Photos
            </Link>

            {/* Hamburger — mobile only */}
            <button
              className="inline-flex md:hidden items-center justify-center rounded-lg p-2 transition hover:opacity-70"
              style={{ color: "#002045" }}
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Backdrop */}
      {/* Backdrop — z-[55] so it covers the header (z-50) too */}
      <div
        className="fixed inset-0 z-[55] md:hidden transition-all duration-300"
        style={{
          backgroundColor: "rgba(0,0,0,0.35)",
          backdropFilter: mobileOpen ? "blur(6px)" : "blur(0px)",
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "auto" : "none",
        }}
        onClick={() => setMobileOpen(false)}
      />

      {/* Right-side drawer — z-[60] sits above the backdrop */}
      <div
        className="fixed inset-y-0 right-0 z-[60] flex w-72 flex-col md:hidden"
        style={{
          backgroundColor: "#f9f9ff",
          borderLeft: "1px solid #c4c6cf",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Drawer header */}
        <div
          className="flex h-16 items-center justify-between px-5"
          style={{ borderBottom: "1px solid #c4c6cf" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Homes%20Drive%20Logo%20Blue.png"
            alt="Homes.ph Drive"
            className="h-7 w-auto object-contain"
          />
          <button
            className="flex items-center justify-center rounded-lg p-2 transition hover:opacity-70"
            style={{ color: "#002045" }}
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col px-5 pt-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="border-b py-4 text-sm font-semibold tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{
                color: isActive(item.href) ? "#b52426" : "#43474e",
                borderColor: "#e8e9ef",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Auth actions */}
        <div className="mt-auto flex flex-col gap-3 px-5 pb-8 pt-6">
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold tracking-[0.18em] transition hover:opacity-80"
            style={{ borderColor: "#002045", color: "#002045" }}
          >
            SIGN IN
          </Link>
          <Link
            href="/signup"
            onClick={() => setMobileOpen(false)}
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "#002045" }}
          >
            SIGN UP
          </Link>
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "#b52426" }}
          >
            Explore Photos
          </Link>
        </div>
      </div>
    </>
  );
}
