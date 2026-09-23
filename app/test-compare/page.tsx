import { notFound } from "next/navigation";
import { ComparisonWorkspace } from "@/components/compare/ComparisonWorkspace";
import type {
  UserDocumentListItem,
  DocumentComparisonResult,
} from "@/types";

export default async function TestComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    docA?: string;
    docB?: string;
    state?: string;
  }>;
}) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_TEST_ROUTES !== "true"
  ) {
    notFound();
  }

  const { docA, docB, state } = await searchParams;

  const mockUserDocuments: UserDocumentListItem[] = [
    {
      id: "doc-nda-v1",
      title: "Non-Disclosure Agreement 2024",
      originalFilename: "NDA_2024.pdf",
      status: "ready",
      documentType: "Non-Disclosure Agreement",
      pageCount: 3,
      createdAt: new Date("2024-01-15T10:00:00Z"),
    },
    {
      id: "doc-nda-v2",
      title: "Non-Disclosure Agreement 2026",
      originalFilename: "NDA_2026.pdf",
      status: "ready",
      documentType: "Non-Disclosure Agreement",
      pageCount: 4,
      createdAt: new Date("2026-02-20T10:00:00Z"),
    },
    {
      id: "doc-draft-1",
      title: "Draft Consulting Contract",
      originalFilename: "Draft_Consulting.pdf",
      status: "extracting",
      documentType: "Consulting Agreement",
      pageCount: 2,
      createdAt: new Date("2026-03-01T10:00:00Z"),
    },
  ];

  const mockComparisonResult: DocumentComparisonResult = {
    documentA: {
      id: "doc-nda-v1",
      title: "Non-Disclosure Agreement 2024",
      filename: "NDA_2024.pdf",
      documentType: "Non-Disclosure Agreement",
      pageCount: 3,
      governingLaw: "State of New York",
      jurisdiction: "New York County, NY",
      parties: [
        { name: "Acme Innovations Inc.", role: "Disclosing Party" },
        { name: "Beta Global Ltd.", role: "Receiving Party" },
      ],
    },
    documentB: {
      id: "doc-nda-v2",
      title: "Non-Disclosure Agreement 2026",
      filename: "NDA_2026.pdf",
      documentType: "Non-Disclosure Agreement",
      pageCount: 4,
      governingLaw: "State of Delaware",
      jurisdiction: "Wilmington, DE",
      parties: [
        { name: "Acme Innovations Inc.", role: "Disclosing Party" },
        { name: "Beta Global Ltd.", role: "Receiving Party" },
      ],
    },
    metadataDifferences: [
      {
        field: "governing_law",
        label: "Governing Law",
        valueA: "State of New York",
        valueB: "State of Delaware",
        isDifferent: true,
      },
      {
        field: "jurisdiction",
        label: "Jurisdiction",
        valueA: "New York County, NY",
        valueB: "Wilmington, DE",
        isDifferent: true,
      },
      {
        field: "document_type",
        label: "Document Type",
        valueA: "Non-Disclosure Agreement",
        valueB: "Non-Disclosure Agreement",
        isDifferent: false,
      },
    ],
    differences: [
      {
        id: "diff-sec-1",
        title: "Definition of Confidential Information",
        differenceType: "modified",
        description: "Definition expanded to include proprietary source code and algorithmic weights.",
        sectionAId: "sec-nda1-1",
        sectionANumber: 1,
        sectionATitle: "1. Confidential Information",
        sectionAPageStart: 1,
        sectionAPageEnd: 1,
        excerptA: "Confidential Information means all non-public technical and financial data.",
        findingAId: "finding-att-1",
        sectionBId: "sec-nda2-1",
        sectionBNumber: 1,
        sectionBTitle: "1. Confidential Information Scope",
        sectionBPageStart: 1,
        sectionBPageEnd: 1,
        excerptB: "Confidential Information means all non-public technical, algorithmic weights, and financial data.",
        findingBId: "finding-att-2",
        changeSummary: "Wording differs between documents.",
      },
      {
        id: "diff-sec-2",
        title: "Term and Survival Duration",
        differenceType: "modified",
        description: "Survival period for confidentiality obligations increased from 2 years to 5 years.",
        sectionAId: "sec-nda1-2",
        sectionANumber: 2,
        sectionATitle: "2. Term and Survival",
        sectionAPageStart: 2,
        sectionAPageEnd: 2,
        excerptA: "The confidentiality obligations herein shall survive for a period of two (2) years.",
        findingAId: null,
        sectionBId: "sec-nda2-2",
        sectionBNumber: 2,
        sectionBTitle: "2. Duration & Post-Termination Obligations",
        sectionBPageStart: 2,
        sectionBPageEnd: 2,
        excerptB: "The confidentiality obligations herein shall survive for a period of five (5) years.",
        findingBId: null,
        changeSummary: "Wording differs between documents.",
      },
      {
        id: "diff-sec-3",
        title: "Non-Solicitation of Personnel",
        differenceType: "added",
        description: "New restrictive covenant prohibiting employee solicitation added in Document B.",
        sectionAId: null,
        sectionANumber: null,
        sectionATitle: null,
        sectionAPageStart: null,
        sectionAPageEnd: null,
        excerptA: null,
        findingAId: null,
        sectionBId: "sec-nda2-3",
        sectionBNumber: 3,
        sectionBTitle: "3. Non-Solicitation",
        sectionBPageStart: 3,
        sectionBPageEnd: 3,
        excerptB: "Neither party shall solicit or recruit any employee of the other party for twelve (12) months.",
        findingBId: "finding-ob-3",
        changeSummary: "Provision present in Document B only.",
      },
      {
        id: "diff-sec-4",
        title: "Arbitration and Dispute Resolution",
        differenceType: "removed",
        description: "Mandatory AAA arbitration requirement in Document A was removed in Document B.",
        sectionAId: "sec-nda1-4",
        sectionANumber: 4,
        sectionATitle: "4. Dispute Resolution & Arbitration",
        sectionAPageStart: 3,
        sectionAPageEnd: 3,
        excerptA: "Any controversy or claim arising out of this Agreement shall be settled by arbitration in NY.",
        findingAId: null,
        sectionBId: null,
        sectionBNumber: null,
        sectionBTitle: null,
        sectionBPageStart: null,
        sectionBPageEnd: null,
        excerptB: null,
        findingBId: null,
        changeSummary: "Provision present in Document A only.",
      },
      {
        id: "diff-sec-5",
        title: "Severability and Construction",
        differenceType: "unchanged",
        description: "Standard severability language is identical across both documents.",
        sectionAId: "sec-nda1-5",
        sectionANumber: 5,
        sectionATitle: "5. Severability",
        sectionAPageStart: 3,
        sectionAPageEnd: 3,
        excerptA: "If any provision of this Agreement is held to be invalid, the remaining provisions remain valid.",
        findingAId: null,
        sectionBId: "sec-nda2-5",
        sectionBNumber: 5,
        sectionBTitle: "5. Severability",
        sectionBPageStart: 4,
        sectionBPageEnd: 4,
        excerptB: "If any provision of this Agreement is held to be invalid, the remaining provisions remain valid.",
        findingBId: null,
        changeSummary: "Normalized text is identical across both documents.",
      },
    ],
    summary: {
      totalDifferences: 4,
      addedCount: 1,
      removedCount: 1,
      modifiedCount: 2,
      unchangedCount: 1,
    },
    comparedAt: new Date("2026-09-23T20:00:00Z"),
  };

  // Allow testing empty states via ?state query param
  let userDocs = mockUserDocuments;
  let initialComparison: DocumentComparisonResult | null = mockComparisonResult;
  let initialDocA = docA || "doc-nda-v1";
  let initialDocB = docB || "doc-nda-v2";

  if (state === "fewer_than_two_docs") {
    userDocs = [mockUserDocuments[0]];
    initialComparison = null;
    initialDocA = "";
    initialDocB = "";
  } else if (state === "no_selection") {
    initialComparison = null;
    initialDocA = "";
    initialDocB = "";
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      <ComparisonWorkspace
        userDocuments={userDocs}
        initialComparison={initialComparison}
        initialDocAId={initialDocA}
        initialDocBId={initialDocB}
      />
    </div>
  );
}

