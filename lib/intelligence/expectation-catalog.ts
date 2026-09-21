/**
 * Expectation Catalog for Missing Information Findings — ClauseWise
 *
 * Defines the authoritative catalog of standard expected core provisions
 * by document category.
 *
 * Contract Invariant:
 * The AI model must NEVER freely invent arbitrary checklists of "missing provisions".
 * A 'missing_information' finding is valid if and only if its expectedTopic
 * is grounded in this authoritative catalog for the resolved document type (or general fallback).
 */

export const CORE_PROVISION_CATALOG: Record<string, string[]> = {
  nda: [
    "definition_of_confidential_information",
    "confidentiality_duration_or_term",
    "obligations_of_recipient",
    "standard_exclusions_to_confidentiality",
    "return_or_destruction_of_information",
    "remedies_or_injunctive_relief",
  ],
  employment_agreement: [
    "job_title_and_responsibilities",
    "compensation_and_payment_terms",
    "termination_notice_period",
    "intellectual_property_assignment",
    "confidentiality_obligations",
    "governing_law",
  ],
  lease_agreement: [
    "premises_description",
    "rent_amount_and_payment_schedule",
    "lease_term_and_commencement_date",
    "security_deposit_terms",
    "maintenance_and_repair_obligations",
    "termination_or_default_conditions",
  ],
  service_agreement: [
    "scope_of_services_and_deliverables",
    "payment_terms_and_invoicing",
    "term_and_termination",
    "limitation_of_liability",
    "intellectual_property_rights",
    "confidentiality",
  ],
  commercial_contract: [
    "scope_of_obligations",
    "pricing_and_payment_terms",
    "term_and_termination",
    "warranties_and_representations",
    "limitation_of_liability",
    "governing_law_and_jurisdiction",
  ],
  general: [
    "identification_of_parties",
    "consideration_or_payment_terms",
    "term_or_duration",
    "termination_provision",
    "governing_law",
  ],
} as const;

/**
 * Normalizes document type string into a recognized catalog key.
 */
export function normalizeDocumentTypeKey(rawType: string | null | undefined): string {
  if (!rawType) return "general";
  const clean = rawType.toLowerCase().replace(/[\s-]+/g, "_");

  if (clean.includes("nda") || clean.includes("non_disclosure") || clean.includes("confidentiality")) {
    return "nda";
  }
  if (clean.includes("employ") || clean.includes("job") || clean.includes("work_agreement")) {
    return "employment_agreement";
  }
  if (clean.includes("lease") || clean.includes("tenan") || clean.includes("rent")) {
    return "lease_agreement";
  }
  if (clean.includes("service") || clean.includes("consult") || clean.includes("contractor")) {
    return "service_agreement";
  }
  if (clean.includes("commercial") || clean.includes("vendor") || clean.includes("supply")) {
    return "commercial_contract";
  }

  return "general";
}

/**
 * Returns the list of allowable expected topics for a given document type.
 * Always includes the general baseline provisions.
 */
export function getAllowableExpectedTopics(documentType: string | null | undefined): string[] {
  const key = normalizeDocumentTypeKey(documentType);
  const specificTopics = CORE_PROVISION_CATALOG[key] ?? [];
  const generalTopics = CORE_PROVISION_CATALOG.general;

  return Array.from(new Set([...specificTopics, ...generalTopics]));
}

/**
 * Validates whether an expected topic is permitted for the given document type.
 */
export function isExpectedTopicAllowed(
  documentType: string | null | undefined,
  topic: string
): boolean {
  if (!topic || typeof topic !== "string") return false;
  const normalizedTopic = topic.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const allowable = getAllowableExpectedTopics(documentType);

  return allowable.some(
    (allowed) =>
      allowed === normalizedTopic ||
      normalizedTopic.includes(allowed) ||
      allowed.includes(normalizedTopic)
  );
}

