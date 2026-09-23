import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { listActionsByUser } from "@/lib/services/action-service";
import { ActionCenter } from "@/components/actions/ActionCenter";

export const metadata: Metadata = {
  title: "Action Center — ClauseWise",
  description: "Track and manage review items derived from document findings with verified evidence.",
};

/**
 * Action Center Page — Phase 7
 * Server component enforcing session authentication and loading initial actions with full provenance.
 */
export default async function ActionsPage() {
  const session = await requireSession();
  const initialActions = await listActionsByUser({ userId: session.user.id });

  return <ActionCenter initialActions={initialActions} />;
}
