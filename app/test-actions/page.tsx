import { notFound } from "next/navigation";
import { ActionCenter } from "@/components/actions/ActionCenter";
import type { ActionWithDetails } from "@/types";

export default async function TestActionsPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_TEST_ROUTES !== "true"
  ) {
    notFound();
  }

  const initialActions: ActionWithDetails[] = [
    {
      id: "action-e2e-1",
      documentId: "test-doc-12345",
      findingId: "finding-ob-1",
      userId: "user-test-e2e",
      title: "Confirm scheduled maintenance notice period",
      description: "Ask provider if 72 hours can be increased to 5 days.",
      status: "open",
      createdAt: new Date("2026-09-23T10:00:00Z"),
      updatedAt: new Date("2026-09-23T10:00:00Z"),
      completedAt: null,
      document: {
        id: "test-doc-12345",
        title: "Master Services Agreement 2026",
        originalFilename: "Master_Services_Agreement_2026.pdf",
      },
      finding: {
        id: "finding-ob-1",
        findingType: "obligation",
        importance: "needs_attention",
        label: "Maintenance Notice Obligation",
        summary: "Provider must give 72 hours advance notice for scheduled maintenance.",
        sourceText: "Provider shall provide seventy-two (72) hours advance notice of scheduled maintenance",
        pageNumber: 1,
        sectionId: "sec-1",
        sectionTitle: "Section 1: General Provisions and Term",
      },
    },
  ];

  return <ActionCenter initialActions={initialActions} />;
}
