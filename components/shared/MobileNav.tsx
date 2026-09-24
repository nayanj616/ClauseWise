"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  GitCompare,
  CheckSquare,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/actions", label: "Action Center", icon: CheckSquare },
];

export interface MobileNavProps {
  user: {
    name?: string | null;
    email: string;
  };
}

/**
 * Accessible mobile navigation header and slide-over drawer (Phase 10).
 * Displays exclusively on small viewports (< 768px / md).
 * Enforces keyboard dismiss (Escape), body scroll locking, and ARIA modal semantics.
 */
export function MobileNav({ user }: MobileNavProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const pathname = usePathname();
  const drawerRef = React.useRef<HTMLDivElement>(null);

  // Close drawer upon pathname change
  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll and register escape key listener when drawer is open
  React.useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const initials = user.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Top Mobile Bar (visible only below md) */}
      <header className="flex h-14 w-full items-center justify-between border-b bg-card px-4 md:hidden shrink-0 z-30">
        <Link href="/dashboard" aria-label="ClauseWise home" className="flex items-center">
          <Logo size="sm" />
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation-drawer"
          className="h-9 w-9 text-foreground"
          data-testid="mobile-menu-toggle"
        >
          {isOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </Button>
      </header>

      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        id="mobile-navigation-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-card shadow-2xl transition-transform duration-200 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="mobile-navigation-drawer"
      >
        {/* Drawer Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link href="/dashboard" onClick={() => setIsOpen(false)} aria-label="ClauseWise home">
            <Logo size="sm" />
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>

        {/* Drawer Nav links */}
        <nav className="flex flex-1 flex-col gap-1 p-3 overflow-y-auto" aria-label="Mobile main navigation">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <Separator />

        {/* User footer in Drawer */}
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              {user.name && (
                <span className="truncate text-sm font-medium leading-none">
                  {user.name}
                </span>
              )}
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>

          <form action={signOutAction} className="mt-1">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

