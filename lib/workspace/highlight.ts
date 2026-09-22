/**
 * Source Text Highlighting Engine — ClauseWise (Phase 4 Slice 4.2)
 *
 * Pure domain utility for locating and extracting character offsets of evidence
 * excerpts within section content.
 *
 * Invariants:
 * 1. Text Preservation: The original section content is never modified or normalized.
 *    Offsets point into the verbatim original string.
 * 2. Whitespace Tolerance: Matches across layout variations (newlines, multiple spaces,
 *    tabs, surrounding whitespace) without fuzzy or semantic approximation.
 * 3. Absence Safety: missing_information (null/undefined/empty sourceText) deterministically
 *    returns null (no match, zero fabricated highlights).
 * 4. Determinism: Multiple occurrences target the first occurrence within the section.
 */

export interface HighlightRange {
  startIndex: number;
  endIndex: number;
  matchedText: string;
}

export interface HighlightSegments {
  hasMatch: boolean;
  before: string;
  highlighted: string;
  after: string;
  range: HighlightRange | null;
}

/**
 * Escapes regex special characters in a string token, while allowing flexible
 * matching between straight and typographic (curly) quotes.
 */
function escapeRegexToken(token: string): string {
  let escaped = token.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  // Allow straight and curly quotes to match interchangeably
  escaped = escaped
    .replace(/["“”]/g, '["“”]')
    .replace(/['‘’]/g, "['‘’]");
  return escaped;
}

/**
 * Locates the exact character offsets of an evidence excerpt within section content.
 *
 * 1. Checks for empty/null content or excerpt (returns null immediately).
 * 2. Tries direct exact substring search first (fast path).
 * 3. Falls back to tokenized whitespace-tolerant regex search.
 *
 * @param sectionContent - The original, verbatim text of the section
 * @param sourceText - The evidence excerpt to locate (null for missing_information)
 * @returns HighlightRange with exact original character offsets, or null if no match
 */
export function findHighlightRange(
  sectionContent: string | null | undefined,
  sourceText: string | null | undefined
): HighlightRange | null {
  if (!sectionContent || typeof sectionContent !== "string") {
    return null;
  }

  if (!sourceText || typeof sourceText !== "string") {
    return null;
  }

  const trimmedSource = sourceText.trim();
  if (trimmedSource.length === 0) {
    return null;
  }

  // 1. Direct exact substring search (fast path)
  const exactIndex = sectionContent.indexOf(trimmedSource);
  if (exactIndex !== -1) {
    return {
      startIndex: exactIndex,
      endIndex: exactIndex + trimmedSource.length,
      matchedText: sectionContent.slice(exactIndex, exactIndex + trimmedSource.length),
    };
  }

  // 2. Tokenize by whitespace to match across newlines, multiple spaces, tabs
  const tokens = trimmedSource.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  try {
    const pattern = tokens.map(escapeRegexToken).join("\\s+");
    const regex = new RegExp(pattern);
    const match = regex.exec(sectionContent);

    if (match && typeof match.index === "number") {
      const startIndex = match.index;
      const matchedText = match[0];
      const endIndex = startIndex + matchedText.length;

      return {
        startIndex,
        endIndex,
        matchedText,
      };
    }
  } catch {
    // If regex execution fails defensively, fall back to no match
    return null;
  }

  return null;
}

/**
 * Splits section content into [before, highlighted, after] segments based on
 * evidence source text matching.
 *
 * Invariant: before + highlighted + after === sectionContent exactly.
 *
 * @param sectionContent - The original, verbatim text of the section
 * @param sourceText - The evidence excerpt to locate
 * @returns HighlightSegments object
 */
export function getHighlightSegments(
  sectionContent: string | null | undefined,
  sourceText: string | null | undefined
): HighlightSegments {
  const content = sectionContent ?? "";
  const range = findHighlightRange(content, sourceText);

  if (!range) {
    return {
      hasMatch: false,
      before: content,
      highlighted: "",
      after: "",
      range: null,
    };
  }

  return {
    hasMatch: true,
    before: content.slice(0, range.startIndex),
    highlighted: content.slice(range.startIndex, range.endIndex),
    after: content.slice(range.endIndex),
    range,
  };
}

