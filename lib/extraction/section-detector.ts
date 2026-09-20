/**
 * Section Detector — ClauseWise
 *
 * Heuristically identifies factual section and clause boundaries in legal documents:
 * - Numbered clauses (e.g., "1. Definitions", "1.1 Defined Terms")
 * - Labeled legal clauses (e.g., "Section 1: Confidentiality", "Article II. Scope")
 * - Roman numeral headings (e.g., "I. Recitals", "II. Covenants")
 * - Uppercase standalone headings (e.g., "GOVERNING LAW", "MISCELLANEOUS")
 * - Preamble extraction for introductory contract text prior to first heading
 * - Neutral single-section fallback when no explicit headings exist (no invented semantics)
 *
 * Grounded in factual text: never synthesizes or alters original document wording.
 */

import type { ExtractedPage, ExtractedSection } from "./types";

interface HeadingMatch {
  index: number;
  length: number;
  title: string;
}

// 1. Explicit clause labels: "Section 1", "Clause 2.1", "Article III", etc.
const EXPLICIT_SECTION_REGEX =
  /^[ \t]*(?:SECTION|Section|CLAUSE|Clause|ARTICLE|Article)\s+([0-9IVXLCDM]+(?:\.[0-9]+)*)[:.-]?[ \t]*(.*)$/im;

// 2. Numbered clauses: "1. Definitions", "2.1 Scope of Work", "10. Termination"
const NUMBERED_CLAUSE_REGEX =
  /^[ \t]*([0-9]+(?:\.[0-9]+)*)\.?[ \t]+([A-Z][^\r\n]{1,80})$/m;

// 3. Roman numerals: "I. Recitals", "II. Terms"
const ROMAN_NUMERAL_REGEX =
  /^[ \t]*(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)\.[ \t]+([A-Z][^\r\n]{1,80})$/m;

// 4. Standalone uppercase headings (3 to 60 chars, uppercase letters, spaces, & / - ,)
// Must not end with a sentence period and must not be a common sentence.
const ALL_CAPS_HEADING_REGEX =
  /^[ \t]*([A-Z][A-Z0-9\s,&'\-\/]{2,60})[ \t]*$/m;

const COMMON_NON_HEADINGS = new Set([
  "THE",
  "AND",
  "FOR",
  "IN",
  "OF",
  "OR",
  "TO",
  "BY",
  "ON",
  "AT",
  "A",
  "AN",
  "YES",
  "NO",
  "TRUE",
  "FALSE",
]);

/**
 * Checks if a line qualifies as a heading and returns a clean title if so.
 */
function matchHeading(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 90) {
    return null;
  }

  // Check 1: Explicit "Section / Article / Clause"
  const explicitMatch = trimmed.match(EXPLICIT_SECTION_REGEX);
  if (explicitMatch) {
    return trimmed;
  }

  // Check 2: Numbered clause e.g. "1. Definitions" or "2. Term"
  const numberedMatch = trimmed.match(NUMBERED_CLAUSE_REGEX);
  if (numberedMatch) {
    return trimmed;
  }

  // Check 3: Roman numeral e.g. "I. Recitals"
  const romanMatch = trimmed.match(ROMAN_NUMERAL_REGEX);
  if (romanMatch) {
    return trimmed;
  }

  // Check 4: Standalone ALL CAPS heading (no lowercase, length between 4 and 60)
  if (
    trimmed.length >= 4 &&
    trimmed.length <= 60 &&
    trimmed === trimmed.toUpperCase() &&
    !trimmed.endsWith(".") &&
    !trimmed.includes(";") &&
    ALL_CAPS_HEADING_REGEX.test(trimmed)
  ) {
    // Avoid single common words being treated as headings
    if (!COMMON_NON_HEADINGS.has(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Finds all headings and their character offsets in the document text.
 */
function findHeadings(text: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  const lines = text.split("\n");
  let currentOffset = 0;

  for (const line of lines) {
    const headingTitle = matchHeading(line);
    if (headingTitle) {
      matches.push({
        index: currentOffset,
        length: line.length,
        title: headingTitle,
      });
    }
    // +1 for the newline character
    currentOffset += line.length + 1;
  }

  return matches;
}

/**
 * Maps a section's character range to page numbers based on ExtractedPage list.
 */
function resolvePageSpan(
  sectionStart: number,
  sectionEnd: number,
  pages?: ExtractedPage[]
): { pageStart?: number; pageEnd?: number } {
  if (!pages || pages.length === 0) {
    return {};
  }

  let pageStart: number | undefined;
  let pageEnd: number | undefined;
  let runningOffset = 0;

  for (const page of pages) {
    const pageLength = page.text.length;
    const pageStartOffset = runningOffset;
    const pageEndOffset = runningOffset + pageLength;

    if (
      pageStart === undefined &&
      sectionStart >= pageStartOffset &&
      sectionStart <= pageEndOffset
    ) {
      pageStart = page.pageNumber;
    }

    if (
      sectionEnd >= pageStartOffset &&
      sectionEnd <= pageEndOffset
    ) {
      pageEnd = page.pageNumber;
    }

    runningOffset = pageEndOffset + 1; // accounting for joined newline
  }

  // Fallbacks if section bounds extended to document edges
  if (pageStart === undefined) {
    pageStart = pages[0]?.pageNumber ?? 1;
  }
  if (pageEnd === undefined) {
    pageEnd = pages[pages.length - 1]?.pageNumber ?? pageStart;
  }

  return { pageStart, pageEnd: Math.max(pageStart, pageEnd) };
}

/**
 * Detects structured sections from extracted document text.
 *
 * @param text - The full extracted text
 * @param pages - Optional page array (PDF) for calculating page spans
 * @returns Array of ordered ExtractedSection objects
 */
export function detectSections(
  text: string,
  pages?: ExtractedPage[]
): ExtractedSection[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  const headings = findHeadings(text);

  // If no identifiable headings exist, return a single unified section without fabricating semantics
  if (headings.length === 0) {
    const pageSpan = resolvePageSpan(0, text.length, pages);
    return [
      {
        orderIndex: 0,
        title: "Document Content",
        text: trimmedText,
        ...pageSpan,
      },
    ];
  }

  const sections: ExtractedSection[] = [];
  let orderIndex = 0;

  // 1. Check for preamble / introductory text before the first heading
  const firstHeading = headings[0];
  if (firstHeading && firstHeading.index > 0) {
    const preambleText = text.substring(0, firstHeading.index).trim();
    if (preambleText.length > 0) {
      const pageSpan = resolvePageSpan(0, firstHeading.index, pages);
      sections.push({
        orderIndex: orderIndex++,
        title: "Preamble",
        text: preambleText,
        ...pageSpan,
      });
    }
  }

  // 2. Iterate through headings and partition text
  for (let i = 0; i < headings.length; i++) {
    const currentHeading = headings[i];
    const nextHeading = headings[i + 1];

    const sectionStartIndex = currentHeading.index;
    const sectionEndIndex = nextHeading ? nextHeading.index : text.length;

    // The section text starts after the heading line (or includes the heading)
    const rawSectionContent = text.substring(sectionStartIndex, sectionEndIndex).trim();

    const pageSpan = resolvePageSpan(sectionStartIndex, sectionEndIndex, pages);

    sections.push({
      orderIndex: orderIndex++,
      title: currentHeading.title,
      text: rawSectionContent,
      ...pageSpan,
    });
  }

  return sections;
}

