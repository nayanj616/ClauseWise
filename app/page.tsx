import { redirect } from "next/navigation";

/**
 * Root route — redirects to dashboard.
 * Middleware will redirect unauthenticated users to /sign-in.
 */
export default function RootPage() {
  redirect("/dashboard");
}

