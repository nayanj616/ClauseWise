/**
 * Date and Financial Formatters — ClauseWise (Phase 4 Slice 4.4)
 *
 * Pure utilities for formatting persisted finding metadata without
 * inventing values, changing original semantics, or calculating risk.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Formats a date value from finding metadata into a consistent, readable string.
 *
 * - If matches ISO YYYY-MM-DD, formats as "Mon DD, YYYY" using UTC to avoid timezone shifts.
 * - If already formatted or non-ISO (e.g. "September 30, 2026" or "Within 30 days"), preserves string.
 * - If null, empty, or whitespace, returns null.
 */
export function formatFindingDate(rawDate: string | null | undefined): string | null {
  if (!rawDate || typeof rawDate !== "string") return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // Check for ISO format YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return `${MONTH_NAMES[month]} ${day}, ${year}`;
    }
  }

  return trimmed;
}

/**
 * Formats financial terms from finding metadata into a concise, readable string.
 *
 * - Combines amount, currency (if not already included in amount), and frequency.
 * - Does not invent missing amounts or calculate legal significance.
 * - If amount is null/empty, returns null.
 */
export function formatFinancialTerm(
  amount: string | null | undefined,
  currency?: string | null,
  frequency?: string | null
): string | null {
  if (!amount || typeof amount !== "string") return null;
  const trimmedAmount = amount.trim();
  if (!trimmedAmount) return null;

  let result = trimmedAmount;

  // Append currency if provided and not already present in amount (e.g. "$", "€", "USD")
  if (currency && typeof currency === "string") {
    const trimmedCurrency = currency.trim();
    if (
      trimmedCurrency &&
      !result.includes(trimmedCurrency) &&
      !result.startsWith("$") &&
      !result.startsWith("€") &&
      !result.startsWith("£")
    ) {
      result = `${result} ${trimmedCurrency}`;
    }
  }

  // Append frequency if provided (e.g. "per month", "annually")
  if (frequency && typeof frequency === "string") {
    const trimmedFreq = frequency.trim().replace(/_/g, " ");
    if (trimmedFreq) {
      result = `${result} (${trimmedFreq})`;
    }
  }

  return result;
}

