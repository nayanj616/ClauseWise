import { describe, it, expect } from "vitest";
import {
  CORE_PROVISION_CATALOG,
  normalizeDocumentTypeKey,
  getAllowableExpectedTopics,
  isExpectedTopicAllowed,
} from "@/lib/intelligence/expectation-catalog";

describe("Expectation Catalog — Phase 3", () => {
  it("defines core expected provisions for all major document categories", () => {
    expect(CORE_PROVISION_CATALOG.nda).toContain("definition_of_confidential_information");
    expect(CORE_PROVISION_CATALOG.nda).toContain("confidentiality_duration_or_term");
    expect(CORE_PROVISION_CATALOG.employment_agreement).toContain("compensation_and_payment_terms");
    expect(CORE_PROVISION_CATALOG.lease_agreement).toContain("premises_description");
    expect(CORE_PROVISION_CATALOG.service_agreement).toContain("scope_of_services_and_deliverables");
    expect(CORE_PROVISION_CATALOG.general).toContain("identification_of_parties");
  });

  it("normalizes diverse document type strings to catalog keys", () => {
    expect(normalizeDocumentTypeKey("Non-Disclosure Agreement")).toBe("nda");
    expect(normalizeDocumentTypeKey("Mutual NDA")).toBe("nda");
    expect(normalizeDocumentTypeKey("Confidentiality Agreement")).toBe("nda");
    expect(normalizeDocumentTypeKey("Executive Employment Agreement")).toBe("employment_agreement");
    expect(normalizeDocumentTypeKey("Job Offer Contract")).toBe("employment_agreement");
    expect(normalizeDocumentTypeKey("Commercial Lease Agreement")).toBe("lease_agreement");
    expect(normalizeDocumentTypeKey("Consulting Services Agreement")).toBe("service_agreement");
    expect(normalizeDocumentTypeKey("Software Vendor Agreement")).toBe("commercial_contract");
    expect(normalizeDocumentTypeKey("Unknown Document")).toBe("general");
    expect(normalizeDocumentTypeKey(null)).toBe("general");
    expect(normalizeDocumentTypeKey(undefined)).toBe("general");
  });

  it("always includes general baseline provisions in allowable topics", () => {
    const ndaTopics = getAllowableExpectedTopics("nda");
    expect(ndaTopics).toContain("definition_of_confidential_information");
    expect(ndaTopics).toContain("governing_law");
    expect(ndaTopics).toContain("identification_of_parties");

    const generalTopics = getAllowableExpectedTopics("general");
    expect(generalTopics).toContain("termination_provision");
  });

  it("permits allowed expected topics for a classified document type", () => {
    expect(isExpectedTopicAllowed("nda", "definition_of_confidential_information")).toBe(true);
    expect(isExpectedTopicAllowed("nda", "confidentiality_duration_or_term")).toBe(true);
    expect(isExpectedTopicAllowed("employment_agreement", "compensation_and_payment_terms")).toBe(true);
    expect(isExpectedTopicAllowed("lease_agreement", "rent_amount_and_payment_schedule")).toBe(true);
    expect(isExpectedTopicAllowed("nda", "governing_law")).toBe(true); // From general baseline
  });

  it("rejects arbitrary or invented missing topics not in the catalog", () => {
    expect(isExpectedTopicAllowed("nda", "arbitrary_invented_provision")).toBe(false);
    expect(isExpectedTopicAllowed("nda", "mandatory_arbitration_in_paris")).toBe(false);
    expect(isExpectedTopicAllowed("employment_agreement", "free_lunch_stipend")).toBe(false);
    expect(isExpectedTopicAllowed("lease_agreement", "pet_policy_restriction")).toBe(false);
    expect(isExpectedTopicAllowed("general", "")).toBe(false);
  });
});

