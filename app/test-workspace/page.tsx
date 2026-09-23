import { notFound } from "next/navigation";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import { DocumentNotFoundState } from "@/components/workspace/WorkspaceStates";
import type {
  DocumentWorkspaceData,
  DocumentFinding,
  WorkspaceDocument,
  WorkspaceSection,
} from "@/types";

interface TestWorkspacePageProps {
  searchParams: Promise<{
    state?: string;
    tab?: "analysis" | "document" | "ask";
    findingId?: string;
    sectionId?: string;
  }>;
}

const mockDocument: WorkspaceDocument = {
  id: "test-doc-12345",
  filename: "Master_Services_Agreement_2026.pdf",
  fileSizeBytes: 245760,
  pageCount: 3,
  mimeType: "application/pdf",
  status: "ready",
  errorMessage: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  updatedAt: new Date("2026-09-20T10:00:00Z"),
  metadata: {
    documentType: "Master Services Agreement",
    parties: ["Alpha Corp", "Omega LLC"],
    governingLaw: "State of Delaware",
    jurisdiction: "Wilmington, Delaware",
    importantSections: [
      {
        sectionId: "sec-1",
        title: "Section 1: General Provisions and Term",
        reason: "Defines the core term and parties.",
        orderIndex: 0,
      },
      {
        sectionId: "sec-2",
        title: "Section 2: Fees, Invoicing, and Payment Terms",
        reason: "Specifies monthly fees and billing dispute windows.",
        orderIndex: 1,
      },
    ],
  },
};

const mockSections: WorkspaceSection[] = [
  {
    id: "sec-1",
    orderIndex: 0,
    sectionNumber: 1,
    title: "Section 1: General Provisions and Term",
    content:
      'This Master Services Agreement ("Agreement") is entered into by and between Alpha Corp ("Customer") and Omega LLC ("Provider"). This Agreement shall commence on September 30, 2026 (the "Effective Date") and shall continue in full force and effect for an initial term of two (2) years. Provider shall provide seventy-two (72) hours advance notice of scheduled maintenance.',
    pageStart: 1,
    pageEnd: 1,
  },
  {
    id: "sec-2",
    orderIndex: 1,
    sectionNumber: 2,
    title: "Section 2: Fees, Invoicing, and Payment Terms",
    content:
      "Customer agrees to pay all undisputed invoices within thirty (30) days of receipt. The monthly subscription fee shall be $12,500 USD payable in advance on the first day of each calendar month. Customer shall notify Provider within thirty (30) days of any billing discrepancy, after which invoices are deemed accepted. Late payments shall accrue interest at 1.5% per month.",
    pageStart: 2,
    pageEnd: 2,
  },
  {
    id: "sec-3",
    orderIndex: 2,
    sectionNumber: 3,
    title: "Section 3: Governing Law and Dispute Resolution",
    content:
      "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles. Any dispute arising under this Agreement shall be resolved through binding arbitration in Wilmington, Delaware.",
    pageStart: 3,
    pageEnd: 3,
  },
];

const mockFindings: DocumentFinding[] = [
  {
    id: "finding-att-1",
    documentId: "test-doc-12345",
    sectionId: "sec-2",
    chunkId: null,
    findingType: "attention",
    importance: "needs_attention",
    label: "Short Notice for Billing Disputes",
    summary:
      "Customer has only 30 days to identify and dispute billing errors before waiver.",
    sourceText:
      "Customer shall notify Provider within thirty (30) days of any billing discrepancy",
    pageNumber: 2,
    metadata: {},
    createdAt: new Date("2026-09-20T10:05:00Z"),
    updatedAt: new Date("2026-09-20T10:05:00Z"),
  },
  {
    id: "finding-date-1",
    documentId: "test-doc-12345",
    sectionId: "sec-1",
    chunkId: null,
    findingType: "date",
    importance: "important",
    label: "Agreement Effective Date",
    summary: "Commencement date for all contractual obligations and billing terms.",
    sourceText: "This Agreement shall commence on September 30, 2026",
    pageNumber: 1,
    metadata: {
      dateValue: "2026-09-30",
      dateDescription: "Agreement Commencement",
    },
    createdAt: new Date("2026-09-20T10:06:00Z"),
    updatedAt: new Date("2026-09-20T10:06:00Z"),
  },
  {
    id: "finding-fin-1",
    documentId: "test-doc-12345",
    sectionId: "sec-2",
    chunkId: null,
    findingType: "financial_term",
    importance: "important",
    label: "Monthly Subscription Fee",
    summary: "Base recurring SaaS subscription fee payable monthly in advance.",
    sourceText:
      "The monthly subscription fee shall be $12,500 USD payable in advance",
    pageNumber: 2,
    metadata: {
      amount: "$12,500",
      currency: "USD",
      frequency: "monthly",
    },
    createdAt: new Date("2026-09-20T10:07:00Z"),
    updatedAt: new Date("2026-09-20T10:07:00Z"),
  },
  {
    id: "finding-miss-1",
    documentId: "test-doc-12345",
    sectionId: null,
    chunkId: null,
    findingType: "missing_information",
    importance: "needs_attention",
    label: "Absence of Indemnification Clause",
    summary:
      "Standard commercial software agreements typically contain mutual indemnification for third-party IP claims, but none was identified in this agreement.",
    sourceText: null,
    pageNumber: null,
    metadata: {
      expectedTopic: "Indemnification",
      ruleBasis:
        "Standard SaaS commercial contracts require mutual indemnification.",
    },
    createdAt: new Date("2026-09-20T10:08:00Z"),
    updatedAt: new Date("2026-09-20T10:08:00Z"),
  },
  {
    id: "finding-ob-1",
    documentId: "test-doc-12345",
    sectionId: "sec-1",
    chunkId: null,
    findingType: "obligation",
    importance: "informational",
    label: "Maintenance Notice Requirement",
    summary:
      "Provider must alert customer at least 72 hours prior to scheduled system maintenance.",
    sourceText:
      "Provider shall provide seventy-two (72) hours advance notice of scheduled maintenance",
    pageNumber: 1,
    metadata: {},
    createdAt: new Date("2026-09-20T10:09:00Z"),
    updatedAt: new Date("2026-09-20T10:09:00Z"),
  },
];

/**
 * Test Harness Route for Phase 4 E2E Browser Testing.
 * Protected against production deployment unless explicitly enabled for CI/testing.
 */
export default async function TestWorkspacePage({
  searchParams,
}: TestWorkspacePageProps) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_TEST_ROUTES !== "true"
  ) {
    notFound();
  }

  const { state, tab, findingId, sectionId } = await searchParams;

  if (state === "not-found") {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto w-full">
        <DocumentNotFoundState />
      </div>
    );
  }

  if (state === "error") {
    const errorData: DocumentWorkspaceData = {
      document: {
        ...mockDocument,
        status: "error",
        errorMessage: "Failed to parse document content. Please try re-uploading.",
      },
      sections: [],
    };
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <DocumentWorkspace data={errorData} findings={[]} />
      </div>
    );
  }

  if (state === "processing") {
    const processingData: DocumentWorkspaceData = {
      document: {
        ...mockDocument,
        status: "analyzing",
      },
      sections: [],
    };
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <DocumentWorkspace data={processingData} findings={[]} />
      </div>
    );
  }

  if (state === "empty") {
    const emptyData: DocumentWorkspaceData = {
      document: {
        ...mockDocument,
        status: "ready",
      },
      sections: [],
    };
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <DocumentWorkspace data={emptyData} findings={[]} />
      </div>
    );
  }

  const workspaceData: DocumentWorkspaceData = {
    document: mockDocument,
    sections: mockSections,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <DocumentWorkspace
        data={workspaceData}
        findings={mockFindings}
        initialTab={tab === "document" ? "document" : tab === "ask" ? "ask" : "analysis"}
        initialFindingId={findingId}
        initialSectionId={sectionId}
      />
    </div>
  );
}
