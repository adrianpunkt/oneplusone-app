"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MemberNavIcon } from "@/components/app/member-nav-icon";
import { isPathInSection, meActivePaths, navSections } from "@/components/app/nav-sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileMenu({
  displayName,
  imageUrl,
  unreadCount,
}: {
  displayName: string;
  imageUrl: string;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const updateMenuTop = useCallback(() => {
    const headerBottom = triggerRef.current?.closest("header")?.getBoundingClientRect().bottom ?? 0;
    setMenuTop(headerBottom);
  }, []);

  function openMenu() {
    updateMenuTop();
    setMounted(true);
    window.requestAnimationFrame(() => setOpen(true));
  }

  function closeMenu() {
    setOpen(false);
  }

  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    updateMenuTop();
    window.addEventListener("resize", updateMenuTop);
    window.visualViewport?.addEventListener("resize", updateMenuTop);
    return () => {
      window.removeEventListener("resize", updateMenuTop);
      window.visualViewport?.removeEventListener("resize", updateMenuTop);
    };
  }, [mounted, updateMenuTop]);

  useEffect(() => {
    if (open || !mounted) return;

    const timeout = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(timeout);
  }, [mounted, open]);

  useEffect(() => {
    if (!mounted) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted]);

  const menu = (
    <div
      className={cn(
        "fixed inset-x-0 z-20 grid w-dvw origin-top overflow-hidden bg-blush px-4 shadow-[0_18px_45px_rgba(68,10,18,0.10)] transition-[clip-path,opacity,transform] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden",
        open
          ? "translate-y-0 opacity-100 [clip-path:inset(0_0_0_0)]"
          : "-translate-y-2 opacity-0 [clip-path:inset(0_0_100%_0)]",
      )}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      style={{ height: `calc(100dvh - ${menuTop}px)`, top: menuTop }}
    >
      <div className="grid h-full place-items-center pb-20">
        <nav className="grid w-full max-w-sm gap-3">
          {navSections.map((item) => {
            const isActive = isPathInSection(pathname, item.activePaths);

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-16 items-center justify-center gap-3 rounded-lg px-4 font-display text-2xl font-bold transition-colors hover:bg-white hover:text-lipstick",
                  isActive ? "bg-white text-lipstick shadow-sm" : "text-wine",
                )}
                href={item.href}
                key={item.href}
                onClick={closeMenu}
              >
                <item.icon className="h-6 w-6 shrink-0" />
                <span className="relative">
                  {item.label}
                  {item.href === "/messages" && unreadCount > 0 ? (
                    <Badge className="absolute left-full top-0 ml-1 -translate-y-1/2 px-2 py-0.5">
                      {unreadCount}
                    </Badge>
                  ) : null}
                </span>
              </Link>
            );
          })}
          <Link
            aria-current={isPathInSection(pathname, meActivePaths) ? "page" : undefined}
            className={cn(
              "flex min-h-16 items-center justify-center gap-3 rounded-lg px-4 font-display text-2xl font-bold transition-colors hover:bg-white hover:text-lipstick",
              isPathInSection(pathname, meActivePaths)
                ? "bg-white text-lipstick shadow-sm"
                : "text-wine",
            )}
            href="/me"
            onClick={closeMenu}
          >
            <MemberNavIcon
              className="h-7 w-7 shrink-0 text-xs"
              displayName={displayName}
              imageUrl={imageUrl}
            />
            <span>Me</span>
          </Link>
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <Button
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="hover:translate-y-0 hover:shadow-none"
        onClick={open ? closeMenu : openMenu}
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {mounted ? createPortal(menu, document.body) : null}
    </>
  );
}
