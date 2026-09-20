import { requireSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/shared/Sidebar";

/**
 * Protected app layout.
 * All routes in (app)/ require authentication.
 * requireSession() redirects to /sign-in if no valid session exists.
 *
 * Three-panel layout shell:
 *   - Left: Sidebar (fixed width)
 *   - Right: main content area (scrollable)
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side session check — redirects if unauthenticated
  const session = await requireSession();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — fixed left column */}
      <Sidebar
        user={{
          name: session.user.name,
          email: session.user.email ?? "",
        }}
      />

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

