/**
 * Unit Tests — Source Text Highlighting Engine (Phase 4 Slice 4.2)
 *
 * Covers:
 * 1. Matching (findHighlightRange & getHighlightSegments):
 *    - Exact single-line match
 *    - Match where source text contains a newline but document content contains a space
 *    - Match where document content contains multiple whitespace characters
 *    - Match with surrounding whitespace differences
 *    - Match near the beginning of a section
 *    - Match near the end of a section
 *    - No match when evidence is absent
 *    - No match when source text is empty, whitespace-only, null, or undefined
 *
 * 2. Rendering (DocumentViewer & HighlightSegments):
 *    - Matched excerpt renders inside the highlight <mark> element
 *    - Text before the match remains unchanged
 *    - Text after the match remains unchanged
 *    - Multiple occurrences handled deterministically (first occurrence contract)
 *    - Missing-information findings produce no highlight (zero fabricated text)
 *    - Existing viewer rendering remains intact when no active evidence exists
 *
 * 3. Safety & Correctness:
 *    - Evidence containing punctuation matched correctly ($1,000,000, colons, parentheses)
 *    - Evidence containing quotes and brackets matched correctly (straight vs curly quotes, [proprietary])
 *    - Unicode text is preserved (§, €, em-dashes, non-ASCII characters)
 *    - Whitespace normalization never alters displayed section text
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  findHighlightRange,
  getHighlightSegments,
} from "@/lib/workspace/highlight";
import { DocumentViewer } from "@/components/workspace/DocumentViewer";
import type { WorkspaceDocument, WorkspaceSection } from "@/types";

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

function createMockDocument(overrides?: Partial<WorkspaceDocument>): WorkspaceDocument {
  return {
    id: "doc-test-1111-2222-3333-444444444444",
    filename: "Non-Disclosure Agreement.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 204800,
    status: "ready",
    pageCount: 3,
    createdAt: new Date("2026-09-20T12:00:00Z"),
    updatedAt: new Date("2026-09-20T12:05:00Z"),
    errorMessage: null,
    ...overrides,
  };
}

function createMockSection(overrides?: Partial<WorkspaceSection>): WorkspaceSection {
  return {
    id: "sec-test-1",
    orderIndex: 0,
    sectionNumber: 1,
    title: "1. Confidentiality Obligations",
    content: "The Receiving Party shall hold all Confidential Information in strict confidence.",
    pageStart: 1,
    pageEnd: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Pure Highlighting Utility: Matching Tests
// ---------------------------------------------------------------------------

describe("Phase 4.2 Highlighting Engine — Matching", () => {
  it("1. matches exact single-line excerpt", () => {
    const content = "The Receiving Party shall hold all Confidential Information in strict confidence.";
    const sourceText = "Confidential Information in strict confidence";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.startIndex).toBe(35);
    expect(range?.endIndex).toBe(80);
    expect(range?.matchedText).toBe("Confidential Information in strict confidence");
    expect(content.slice(range!.startIndex, range!.endIndex)).toBe(sourceText);
  });

  it("2. matches where source text contains a newline but document content contains a space", () => {
    const content = "The Receiving Party shall maintain confidentiality of all proprietary information.";
    const sourceText = "maintain confidentiality\nof all proprietary";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.matchedText).toBe("maintain confidentiality of all proprietary");
    expect(content.slice(range!.startIndex, range!.endIndex)).toBe(
      "maintain confidentiality of all proprietary"
    );
  });

  it("3. matches where document content contains multiple whitespace characters", () => {
    const content = "The  Receiving   Party    shall   hold the information securely.";
    const sourceText = "Receiving Party shall hold";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    // Verbatim text in original content preserved exactly
    expect(range?.matchedText).toBe("Receiving   Party    shall   hold");
    expect(content.slice(range!.startIndex, range!.endIndex)).toBe(
      "Receiving   Party    shall   hold"
    );
  });

  it("4. matches with surrounding whitespace differences (leading/trailing whitespace)", () => {
    const content = "Term and Termination shall take effect on January 1, 2026.";
    const sourceText = "   Term and Termination shall take effect   \n\t";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.startIndex).toBe(0);
    expect(range?.matchedText).toBe("Term and Termination shall take effect");
  });

  it("5. matches near the beginning of a section", () => {
    const content = "This Agreement is entered into by and between Acme Corp and Beta LLC.";
    const sourceText = "This Agreement is entered into";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.startIndex).toBe(0);
    expect(range?.endIndex).toBe(30);

    const segments = getHighlightSegments(content, sourceText);
    expect(segments.hasMatch).toBe(true);
    expect(segments.before).toBe("");
    expect(segments.highlighted).toBe("This Agreement is entered into");
    expect(segments.after).toBe(" by and between Acme Corp and Beta LLC.");
  });

  it("6. matches near the end of a section", () => {
    const content = "All notices shall be delivered in writing to the address specified herein.";
    const sourceText = "address specified herein.";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.endIndex).toBe(content.length);

    const segments = getHighlightSegments(content, sourceText);
    expect(segments.hasMatch).toBe(true);
    expect(segments.before).toBe("All notices shall be delivered in writing to the ");
    expect(segments.highlighted).toBe("address specified herein.");
    expect(segments.after).toBe("");
  });

  it("7. returns null when evidence is absent from content", () => {
    const content = "Payment terms are net 30 days from receipt of invoice.";
    const sourceText = "Intellectual property rights shall belong exclusively to Provider.";

    const range = findHighlightRange(content, sourceText);
    expect(range).toBeNull();

    const segments = getHighlightSegments(content, sourceText);
    expect(segments.hasMatch).toBe(false);
    expect(segments.before).toBe(content);
    expect(segments.highlighted).toBe("");
    expect(segments.after).toBe("");
    expect(segments.range).toBeNull();
  });

  it("8. returns null when source text or content is empty/whitespace/null/undefined", () => {
    const content = "Some valid section content.";

    expect(findHighlightRange(content, "")).toBeNull();
    expect(findHighlightRange(content, "   \n\t  ")).toBeNull();
    expect(findHighlightRange(content, null)).toBeNull();
    expect(findHighlightRange(content, undefined)).toBeNull();
    expect(findHighlightRange("", "evidence")).toBeNull();
    expect(findHighlightRange("   ", "evidence")).toBeNull();
    expect(findHighlightRange(null, "evidence")).toBeNull();
    expect(findHighlightRange(undefined, "evidence")).toBeNull();

    const emptySegments = getHighlightSegments(content, "");
    expect(emptySegments.hasMatch).toBe(false);
    expect(emptySegments.before).toBe(content);
    expect(emptySegments.highlighted).toBe("");
    expect(emptySegments.after).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 2. Rendering Tests (DocumentViewer & HighlightSegments)
// ---------------------------------------------------------------------------

describe("Phase 4.2 Highlighting Engine — Rendering", () => {
  it("9. renders matched excerpt inside the highlight element", () => {
    const document = createMockDocument();
    const sections = [
      createMockSection({
        content: "The Receiving Party shall hold all Confidential Information in strict confidence.",
      }),
    ];

    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
        highlightExcerpt="Confidential Information"
      />
    );

    expect(html).toContain('data-testid="evidence-highlight"');
    expect(html).toContain('id="active-evidence-highlight"');
    expect(html).toContain("<mark");
    expect(html).toContain("Confidential Information");
  });

  it("10. ensures text before the match remains unchanged", () => {
    const content = "Prefix text before evidence. The target evidence excerpt. Suffix text.";
    const excerpt = "The target evidence excerpt.";

    const segments = getHighlightSegments(content, excerpt);
    expect(segments.before).toBe("Prefix text before evidence. ");
    expect(segments.highlighted).toBe("The target evidence excerpt.");

    const document = createMockDocument();
    const sections = [createMockSection({ content })];
    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
        highlightExcerpt={excerpt}
      />
    );

    expect(html).toContain("Prefix text before evidence. ");
  });

  it("11. ensures text after the match remains unchanged", () => {
    const content = "Prefix text before evidence. The target evidence excerpt. Suffix text following.";
    const excerpt = "The target evidence excerpt.";

    const segments = getHighlightSegments(content, excerpt);
    expect(segments.after).toBe(" Suffix text following.");

    const document = createMockDocument();
    const sections = [createMockSection({ content })];
    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
        highlightExcerpt={excerpt}
      />
    );

    expect(html).toContain(" Suffix text following.");
  });

  it("12. deterministically targets the first occurrence when multiple occurrences exist", () => {
    const content = "Notice: Notice must be delivered within 30 days. Later Notice also applies.";
    const excerpt = "Notice";

    const range = findHighlightRange(content, excerpt);
    expect(range).not.toBeNull();
    expect(range?.startIndex).toBe(0);
    expect(range?.endIndex).toBe(6);

    const segments = getHighlightSegments(content, excerpt);
    expect(segments.before).toBe("");
    expect(segments.highlighted).toBe("Notice");
    expect(segments.after).toBe(
      ": Notice must be delivered within 30 days. Later Notice also applies."
    );

    const document = createMockDocument();
    const sections = [createMockSection({ content })];
    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
        highlightExcerpt={excerpt}
      />
    );

    // Only one <mark data-testid="evidence-highlight"> must be rendered
    const markOccurrences = (html.match(/data-testid="evidence-highlight"/g) || []).length;
    expect(markOccurrences).toBe(1);
    expect(html).toContain(": Notice must be delivered within 30 days.");
  });

  it("13. missing-information findings produce no highlight or fabricated text", () => {
    const document = createMockDocument();
    const sectionContent = "Section 1 provides payment terms. No governing law clause is included.";
    const sections = [createMockSection({ content: sectionContent })];

    // Missing-information invariant: sourceText is null
    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
        highlightExcerpt={null}
      />
    );

    expect(html).not.toContain("data-testid=\"evidence-highlight\"");
    expect(html).not.toContain("<mark");
    expect(html).toContain(sectionContent);
  });

  it("14. existing viewer rendering remains completely intact when no active evidence exists", () => {
    const document = createMockDocument();
    const sectionContent = "Standard contract text without any highlight excerpt requested.";
    const sections = [createMockSection({ content: sectionContent })];

    // Omit highlightExcerpt (undefined)
    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
      />
    );

    expect(html).not.toContain("data-testid=\"evidence-highlight\"");
    expect(html).not.toContain("<mark");
    expect(html).toContain(sectionContent);
    expect(html).toContain("1. Confidentiality Obligations");
  });

  it("14b. multi-section view correctly highlights excerpt in the active section", () => {
    const document = createMockDocument();
    const sections = [
      createMockSection({
        id: "sec-1",
        orderIndex: 0,
        title: "Section 1",
        content: "First section content does not have the excerpt.",
      }),
      createMockSection({
        id: "sec-2",
        orderIndex: 1,
        title: "Section 2",
        content: "Second section contains important proprietary data to highlight.",
      }),
    ];

    // When viewing section index 1 with excerpt
    const html = renderToString(
      <DocumentViewer
        document={document}
        sections={sections}
        selectedIndex={1}
        highlightExcerpt="important proprietary data"
      />
    );

    expect(html).toContain('data-testid="multi-section-view"');
    expect(html).toContain('data-testid="evidence-highlight"');
    expect(html).toContain("<mark");
    expect(html).toContain("important proprietary data");
  });
});

// ---------------------------------------------------------------------------
// 3. Safety & Correctness Tests
// ---------------------------------------------------------------------------

describe("Phase 4.2 Highlighting Engine — Safety & Correctness", () => {
  it("15. matches evidence containing punctuation correctly without regex syntax errors", () => {
    const content = "Section 4.2(a): Under no circumstances, whatsoever, shall Liability exceed $1,000,000.00!";
    const sourceText = "Liability exceed $1,000,000.00!";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.matchedText).toBe("Liability exceed $1,000,000.00!");
    expect(content.slice(range!.startIndex, range!.endIndex)).toBe(sourceText);

    // Substring with parentheses and colon
    const punctSource = "Section 4.2(a): Under no circumstances";
    const punctRange = findHighlightRange(content, punctSource);
    expect(punctRange).not.toBeNull();
    expect(punctRange?.matchedText).toBe("Section 4.2(a): Under no circumstances");
  });

  it("16. matches evidence containing quotes and brackets correctly (straight vs curly quotes)", () => {
    // Content uses curly typographic quotes and square brackets
    const content = 'The term “Confidential Information” means any [proprietary] materials and (trade secrets).';
    // Source text uses straight quotes
    const sourceWithStraightQuotes = 'The term "Confidential Information" means any [proprietary] materials';

    const range = findHighlightRange(content, sourceWithStraightQuotes);
    expect(range).not.toBeNull();
    // Verbatim text from content preserved with curly quotes
    expect(range?.matchedText).toBe('The term “Confidential Information” means any [proprietary] materials');

    // Also test single straight quotes matching curly single quotes
    const singleContent = "The Contractor’s obligation shall remain in effect.";
    const singleStraight = "The Contractor's obligation";
    const singleRange = findHighlightRange(singleContent, singleStraight);
    expect(singleRange).not.toBeNull();
    expect(singleRange?.matchedText).toBe("The Contractor’s obligation");
  });

  it("17. preserves Unicode text and special legal symbols", () => {
    const content = "Under § 12.3, the penalty fee is €5,000 (five thousand euros) per diem — no exceptions.";
    const sourceText = "§ 12.3, the penalty fee is €5,000";

    const range = findHighlightRange(content, sourceText);
    expect(range).not.toBeNull();
    expect(range?.matchedText).toBe("§ 12.3, the penalty fee is €5,000");

    const segments = getHighlightSegments(content, sourceText);
    expect(segments.hasMatch).toBe(true);
    expect(segments.before + segments.highlighted + segments.after).toBe(content);
  });

  it("18. whitespace normalization never alters displayed text in content", () => {
    const content = "Clause 1:\n\n  The   Company    shall.\n\nEnd of clause.";
    const sourceText = "The Company shall.";

    const segments = getHighlightSegments(content, sourceText);
    expect(segments.hasMatch).toBe(true);
    // The highlighted segment contains the verbatim original whitespace
    expect(segments.highlighted).toBe("The   Company    shall.");
    // Complete text reconstruction is identical to original
    expect(segments.before + segments.highlighted + segments.after).toBe(content);
  });
});
