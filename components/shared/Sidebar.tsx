"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  GitCompare,
  CheckSquare,
  LogOut,
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

interface SidebarProps {
  user: {
    name?: string | null;
    email: string;
  };
}

/**
 * Application sidebar navigation.
 * Active route is highlighted based on the current pathname.
 * Sign-out invokes the signOutAction server action.
 */
export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  // Build initials for the avatar fallback
  const initials = user.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <aside className="hidden md:flex h-full w-64 shrink-0 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        <Link href="/dashboard" aria-label="ClauseWise home" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <Logo size="md" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
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

      {/* User footer */}
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
    </aside>
  );
}

