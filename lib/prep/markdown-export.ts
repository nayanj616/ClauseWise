/**
 * Markdown Briefing Export Formatter — ClauseWise (Phase 8)
 *
 * Formats structured ProfessionalPrepData into clean, readable Markdown
 * suitable for copying to clipboard or emailing to legal counsel.
 *
 * Safe for both server-side and client-side usage (zero DB dependencies).
 */

import type { ProfessionalPrepData } from "@/types";

/**
 * Formats the complete Professional Prep data into a clean, well-structured Markdown
 * document suitable for copying to clipboard or emailing to an attorney.
 */
export function formatBriefingAsMarkdown(data: ProfessionalPrepData): string {
  const {
    document: doc,
    keyClauses,
    findingsSummary,
    openActions,
    userQuestions,
    clarificationQuestions,
    generatedAt,
  } = data;

  const lines: string[] = [];

  // Header & Disclaimer
  lines.push(`# Legal Consultation Briefing: ${doc.filename}`);
  lines.push(`*Generated on ${new Date(generatedAt).toLocaleDateString()} via ClauseWise*`);
  lines.push("");
  lines.push(
    "> **NOTICE**: This briefing is an organizational document prepared for consultation with a qualified legal professional. It does not constitute legal advice, representation, or formal risk scoring."
  );
  lines.push("");

  // Section 1: Overview
  lines.push("## 1. Document Overview");
  lines.push(`- **Filename**: ${doc.filename}`);
  lines.push(`- **Document Type**: ${doc.documentType || "Unclassified"}`);
  if (doc.parties && doc.parties.length > 0) {
    const partyList = doc.parties
      .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
      .join("; ");
    lines.push(`- **Identified Parties**: ${partyList}`);
  }
  if (doc.governingLaw) {
    lines.push(`- **Governing Law**: ${doc.governingLaw}`);
  }
  if (doc.jurisdiction) {
    lines.push(`- **Jurisdiction**: ${doc.jurisdiction}`);
  }
  if (doc.pageCount) {
    lines.push(`- **Pages**: ${doc.pageCount}`);
  }
  if (doc.executiveSummary) {
    lines.push("");
    lines.push("### Executive Summary");
    lines.push(doc.executiveSummary);
  }
  lines.push("");

  // Section 2: Key Clauses
  if (keyClauses.length > 0) {
    lines.push("## 2. Key Clauses & Important Sections");
    keyClauses.forEach((kc, i) => {
      const pageRef = kc.pageStart ? ` (Page ${kc.pageStart})` : "";
      lines.push(`### ${i + 1}. ${kc.title}${pageRef}`);
      if (kc.importanceReason) {
        lines.push(`*Why it matters*: ${kc.importanceReason}`);
      }
      if (kc.verbatimExcerpt) {
        lines.push(`> ${kc.verbatimExcerpt.replace(/\n+/g, " ")}`);
      }
      lines.push("");
    });
  }

  // Section 3: Priority Review Items
  if (findingsSummary.attentionItems.length > 0) {
    lines.push("## 3. Items Requiring Special Attention");
    findingsSummary.attentionItems.forEach((f) => {
      const pageRef = f.pageNumber ? ` [Page ${f.pageNumber}]` : "";
      lines.push(`- **${f.label}**${pageRef}: ${f.summary}`);
      if (f.sourceText) {
        lines.push(`  > "${f.sourceText.replace(/\n+/g, " ").trim()}"`);
      }
    });
    lines.push("");
  }

  // Section 4: Ambiguities & Absent Provisions
  if (
    findingsSummary.ambiguitiesAndInconsistencies.length > 0 ||
    findingsSummary.missingProvisions.length > 0
  ) {
    lines.push("## 4. Potential Ambiguities & Absent Provisions");
    findingsSummary.missingProvisions.forEach((f) => {
      lines.push(`- **Absent Standard Provision — ${f.label}**: ${f.summary}`);
    });
    findingsSummary.ambiguitiesAndInconsistencies.forEach((f) => {
      const pageRef = f.pageNumber ? ` [Page ${f.pageNumber}]` : "";
      lines.push(`- **Ambiguity/Conflict — ${f.label}**${pageRef}: ${f.summary}`);
      if (f.sourceText) {
        lines.push(`  > "${f.sourceText.replace(/\n+/g, " ").trim()}"`);
      }
    });
    lines.push("");
  }

  // Section 5: Open Review Checklist Actions
  if (openActions.length > 0) {
    lines.push("## 5. Open Review Checklist Items");
    openActions.forEach((a) => {
      lines.push(`- [ ] **${a.title}**${a.description ? `: ${a.description}` : ""}`);
      if (a.finding?.sourceText) {
        lines.push(`  *Evidence excerpt*: "${a.finding.sourceText.replace(/\n+/g, " ").trim()}"`);
      }
    });
    lines.push("");
  }

  // Section 6: Questions for Counsel
  if (clarificationQuestions.length > 0) {
    lines.push("## 6. Suggested Questions for Counsel");
    clarificationQuestions.forEach((q, i) => {
      const location = q.pageNumber
        ? ` (Ref: Page ${q.pageNumber}${q.sectionTitle ? `, ${q.sectionTitle}` : ""})`
        : q.sectionTitle
        ? ` (Ref: ${q.sectionTitle})`
        : "";
      lines.push(`${i + 1}. ${q.question}${location}`);
    });
    lines.push("");
  }

  // Section 7: User Inquiries
  if (userQuestions.length > 0) {
    lines.push("## 7. Inquiries Explored During Review");
    userQuestions.forEach((uq) => {
      lines.push(`- "${uq.question}"`);
    });
    lines.push("");
  }

  // Footer Disclaimer
  lines.push("---");
  lines.push(
    "*Disclaimer: ClauseWise provides organizational tools and document intelligence for informational and preparation purposes only. It is not a substitute for professional legal advice from an attorney licensed in your jurisdiction.*"
  );

  return lines.join("\n");
}

