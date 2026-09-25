/**
 * Unit Tests — Public Landing Page (`app/page.tsx`)
 *
 * Verifies:
 * 1. Public accessibility without requiring an authenticated session
 * 2. Hero section, value proposition, and EVIDENCE -> MEANING -> ACTION workflow
 * 3. Clear entry points for Sign In (/sign-in), Sign Up (/sign-up), and Dashboard (/dashboard)
 * 4. Feature highlights for extraction, citations, Q&A, comparison, actions, and prep
 * 5. Privacy statement and mandatory non-lawyer legal-information disclaimer
 * 6. Semantic HTML and keyboard accessibility (skip link, landmark roles, headings)
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import LandingPage, { metadata } from "@/app/page";

describe("Public Landing Page (app/page.tsx)", () => {
  it("exports appropriate page metadata", () => {
    expect(metadata.title).toContain("ClauseWise");
    expect(metadata.description).toContain("plain English");
  });

  it("renders the landing page without requiring authentication", () => {
    const html = renderToString(<LandingPage />);

    expect(html).toContain('data-testid="landing-page"');
    expect(html).toContain('data-testid="landing-hero-section"');
    expect(html).toContain(
      "Navigate complex legal documents in plain English — grounded in verbatim evidence."
    );
  });

  it("includes clear Sign In, Sign Up, and Dashboard entry points", () => {
    const html = renderToString(<LandingPage />);

    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Create free account");
    expect(html).toContain("Sign in to workspace");
  });

  it("explains the EVIDENCE -> MEANING -> ACTION workflow and core features", () => {
    const html = renderToString(<LandingPage />);

    expect(html).toContain('data-testid="landing-workflow-section"');
    expect(html).toContain("EVIDENCE");
    expect(html).toContain("MEANING");
    expect(html).toContain("ACTION");

    expect(html).toContain('data-testid="landing-features-section"');
    expect(html).toContain("Key Obligations, Dates &amp; Financial Terms");
    expect(html).toContain("Click-to-Source Evidence Highlighting");
    expect(html).toContain("Contextual Document &amp; Section Assistant");
    expect(html).toContain("Side-by-Side Contract Diffs");
    expect(html).toContain("Structured Review Checklist");
    expect(html).toContain("Professional Review Preparation");
  });

  it("includes a privacy statement and mandatory non-lawyer legal disclaimer", () => {
    const html = renderToString(<LandingPage />);

    expect(html).toContain('data-testid="landing-privacy-card"');
    expect(html).toContain("Privacy &amp; Strict Document Isolation");

    expect(html).toContain('data-testid="landing-legal-disclaimer"');
    expect(html).toContain('aria-label="Legal Disclaimer"');
    expect(html).toContain("not a law firm, lawyer, legal advisor");
    expect(html).toContain("not a substitute for professional legal advice");
  });

  it("includes accessible skip-to-content navigation and semantic landmarks", () => {
    const html = renderToString(<LandingPage />);

    expect(html).toContain('href="#main-content"');
    expect(html).toContain("Skip to main content");
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
  });
});
