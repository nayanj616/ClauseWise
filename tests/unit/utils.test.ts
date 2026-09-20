/**
 * Unit tests — lib/utils
 *
 * Tests the small utility functions: cn(), formatDate(), truncate()
 */
import { describe, it, expect } from "vitest";
import { cn, formatDate, truncate } from "@/lib/utils";

describe("cn()", () => {
  it("merges class names", () => {
    expect(cn("flex", "gap-4")).toBe("flex gap-4");
  });

  it("merges with Tailwind conflict resolution (latter wins)", () => {
    expect(cn("p-4", "p-6")).toBe("p-6");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    expect(cn("base", isActive && "active")).toBe("base active");
    expect(cn("base", !isActive && "active")).toBe("base");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});

describe("formatDate()", () => {
  it("formats a Date object", () => {
    // Use a fixed date to avoid flakiness across locales
    const date = new Date("2024-03-15T00:00:00.000Z");
    const result = formatDate(date);
    // Should contain the year
    expect(result).toContain("2024");
  });

  it("formats a date string", () => {
    const result = formatDate("2024-01-01");
    expect(result).toContain("2024");
  });

  it("returns — for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("truncate()", () => {
  it("returns the original string if shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the original string if exactly maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis", () => {
    const result = truncate("Hello, World!", 8);
    // slices to maxLength-1 chars (7) then appends '…' = total 8 chars
    expect(result).toBe("Hello, …");
    expect(result.length).toBe(8);
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});
