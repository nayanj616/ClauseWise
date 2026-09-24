import { requireSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/shared/Sidebar";
import { MobileNav } from "@/components/shared/MobileNav";

/**
 * Protected app layout.
 * All routes in (app)/ require authentication.
 * requireSession() redirects to /sign-in if no valid session exists.
 *
 * Responsive layout shell:
 *   - Mobile (< md): MobileNav header with sliding drawer
 *   - Desktop (>= md): Fixed left Sidebar
 *   - Main content area: Accessible scrollable container with skip link target
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side session check — redirects if unauthenticated
  const session = await requireSession();

  const user = {
    name: session.user.name,
    email: session.user.email ?? "",
  };

  return (
    <div className="flex h-screen flex-col md:flex-row overflow-hidden bg-background">
      {/* Accessible skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Mobile top bar and drawer navigation (< md) */}
      <MobileNav user={user} />

      {/* Desktop Sidebar — fixed left column (>= md) */}
      <Sidebar user={user} />

      {/* Main content area */}
      <main
        className="flex flex-1 flex-col overflow-y-auto"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}


