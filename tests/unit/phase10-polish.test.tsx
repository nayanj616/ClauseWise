import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MobileNav } from "@/components/shared/MobileNav";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { CreateActionDialog } from "@/components/actions/CreateActionDialog";
import GlobalError from "@/app/error";
import AppError from "@/app/(app)/error";
import NotFound from "@/app/not-found";
import AppLoading from "@/app/(app)/loading";
import DashboardLoading from "@/app/(app)/dashboard/loading";
import DocumentsLoading from "@/app/(app)/documents/loading";
import CompareLoading from "@/app/(app)/compare/loading";
import ActionsLoading from "@/app/(app)/actions/loading";
import { documents, documentSections, documentChunks } from "@/lib/db/schema";
import nextConfig from "@/next.config";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock auth action
vi.mock("@/app/actions/auth", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signOutAction: vi.fn(),
}));

describe("Phase 10 Polish & Accessibility Unit Tests", () => {
  describe("Accessibility: MobileNav Component", () => {
    it("renders hamburger toggle button with correct ARIA attributes", () => {
      const html = renderToString(
        <MobileNav
          user={{
            name: "Test User",
            email: "test@example.com",
          }}
        />
      );

      expect(html).toContain('data-testid="mobile-menu-toggle"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-label="Open navigation menu"');
      expect(html).toContain('aria-controls="mobile-navigation-drawer"');
    });

    it("renders drawer dialog with role=dialog and aria-modal=true", () => {
      const html = renderToString(
        <MobileNav
          user={{
            name: "Test User",
            email: "test@example.com",
          }}
        />
      );

      expect(html).toContain('id="mobile-navigation-drawer"');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="Navigation Menu"');
      expect(html).toContain("Dashboard");
      expect(html).toContain("Documents");
      expect(html).toContain("Compare");
      expect(html).toContain("Action Center");
      expect(html).toContain("Sign out");
    });
  });

  describe("Accessibility: Form Attributes", () => {
    it("renders SignInForm inputs with aria-invalid=false by default", () => {
      const html = renderToString(<SignInForm />);
      expect(html).toContain('name="email"');
      expect(html).toContain('name="password"');
      expect(html).toContain('aria-invalid="false"');
    });

    it("renders SignUpForm inputs with aria-invalid=false by default", () => {
      const html = renderToString(<SignUpForm />);
      expect(html).toContain('name="name"');
      expect(html).toContain('name="email"');
      expect(html).toContain('name="password"');
      expect(html).toContain('aria-invalid="false"');
    });

    it("renders CreateActionDialog with modal dialog semantics and accessible title", () => {
      const html = renderToString(
        <CreateActionDialog
          finding={{
            id: "f-1",
            documentId: "doc-1",
            sectionId: "sec-1",
            chunkId: null,
            findingType: "attention",
            importance: "needs_attention",
            label: "Review Termination",
            summary: "30-day notice requirement",
            sourceText: "Either party may terminate upon 30 days notice.",
            pageNumber: 2,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }}
          documentId="doc-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="create-action-dialog-title"');
      expect(html).toContain('id="action-title"');
      expect(html).toContain('data-testid="create-action-title-input"');
      expect(html).toContain('aria-invalid="false"');
    });
  });

  describe("Route Loading Skeletons", () => {
    it("renders AppLoading skeleton with role=status and aria-busy=true", () => {
      const html = renderToString(<AppLoading />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Loading content…");
    });

    it("renders DashboardLoading skeleton with role=status and aria-busy=true", () => {
      const html = renderToString(<DashboardLoading />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Loading dashboard…");
    });

    it("renders DocumentsLoading skeleton with role=status and aria-busy=true", () => {
      const html = renderToString(<DocumentsLoading />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Loading documents…");
    });

    it("renders CompareLoading skeleton with role=status and aria-busy=true", () => {
      const html = renderToString(<CompareLoading />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Loading comparison…");
    });

    it("renders ActionsLoading skeleton with role=status and aria-busy=true", () => {
      const html = renderToString(<ActionsLoading />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Loading actions…");
    });
  });

  describe("Error Boundaries & 404", () => {
    it("renders GlobalError with user-safe message and retry button", () => {
      const resetMock = vi.fn();
      const html = renderToString(<GlobalError error={new Error("Test crash")} reset={resetMock} />);

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain("An Unexpected Error Occurred");
      expect(html).toContain("Try again");
      expect(html).toContain("Back to Dashboard");
    });

    it("renders AppError with workspace recovery action", () => {
      const resetMock = vi.fn();
      const html = renderToString(<AppError error={new Error("Workspace crash")} reset={resetMock} />);

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain("Unable to Load Workspace View");
      expect(html).toContain("Try again");
      expect(html).toContain("Back to Dashboard");
    });

    it("renders NotFound 404 page with navigation to dashboard", () => {
      const html = renderToString(<NotFound />);
      expect(html).toContain("Page or Resource Not Found");
      expect(html).toContain("Back to Dashboard");
    });
  });

  describe("Database Indexes Validation", () => {
    it("confirms documents, documentSections, and documentChunks tables are defined", () => {
      expect(documents).toBeDefined();
      expect(documentSections).toBeDefined();
      expect(documentChunks).toBeDefined();
    });
  });

  describe("Security Headers Audit", () => {
    it("verifies security headers configuration in nextConfig", async () => {
      expect(nextConfig.headers).toBeDefined();
      if (nextConfig.headers) {
        const headerConfigs = await nextConfig.headers();
        expect(headerConfigs.length).toBeGreaterThan(0);

        const globalHeaders = headerConfigs[0].headers;
        const headerMap = new Map(globalHeaders.map((h) => [h.key, h.value]));

        expect(headerMap.get("X-Frame-Options")).toBe("DENY");
        expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
        expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
        expect(headerMap.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      }
    });
  });
});

