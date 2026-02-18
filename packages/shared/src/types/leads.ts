import {
  LeadStatus,
  RejectionReason,
  Urgency,
  PropertyType,
  ProjectSizeBucket,
  BudgetRange,
  TargetingMode,
} from './enums';

// ─── Lead Record (application-layer read model) ───

export interface LeadRecord {
  id: string;
  siteId: string;
  idempotencyKey: string;
  status: LeadStatus;
  rejectionReason: RejectionReason | null;
  dedupeHit: boolean;

  // Routing / value drivers (normalized, indexed)
  categoryId: string;
  serviceId: string;
  serviceTypeId: string | null;
  questionSetId: string | null;
  questionSetVersionId: string | null;

  urgency: Urgency | null;
  propertyType: PropertyType | null;
  projectSizeBucket: ProjectSizeBucket | null;
  budgetRange: BudgetRange | null;
  timeframeDays: number | null;

  // Location
  targetingMode: TargetingMode;
  state: string | null;
  zip: string | null;
  radiusMiles: number | null;
  metroSlug: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Lead Contact (PII - encrypted at rest) ───

export interface LeadContact {
  id: string;
  leadId: string;

  // Encrypted fields (stored as bytes in DB)
  phoneEncrypted: Buffer;
  emailEncrypted: Buffer | null;
  firstNameEncrypted: Buffer | null;
  lastNameEncrypted: Buffer | null;

  // Hashes for dedupe lookups (salted SHA-256)
  phoneHash: string;
  emailHash: string | null;

  // Clear fields (V1)
  ipAddress: string | null;
  userAgent: string | null;

  createdAt: Date;
}

// ─── Decrypted contact (only used in-memory, never persisted) ───

export interface LeadContactDecrypted {
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// ─── Lead Attribution ───

export interface LeadAttribution {
  id: string;
  leadId: string;
  domain: string;
  pageUrl: string;
  pageType: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  createdAt: Date;
}

// ─── Lead Consent (TCPA snapshot) ───

export interface LeadConsent {
  id: string;
  leadId: string;
  tcpaConsent: boolean;
  consentText: string;
  consentTextVersion: string;
  consentTimestamp: Date;
  ipAddress: string | null;
  createdAt: Date;
}

// ─── Lead Details (JSONB responses snapshot) ───

export interface LeadDetails {
  id: string;
  leadId: string;
  questionSetId: string | null;
  questionSetVersionId: string | null;
  responses: Record<string, unknown>;
  createdAt: Date;
}

// ─── Lead Status Event (append-only audit log) ───

export interface LeadStatusEvent {
  id: string;
  leadId: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Form Submission Input (what the public form sends) ───

export interface FormSubmissionInput {
  // Required
  phone: string;
  zip: string;
  tcpaConsent: boolean;

  // Optional
  email?: string;
  firstName?: string;
  lastName?: string;

  // Attribution (injected by form)
  domain: string;
  pageUrl: string;
  pageType: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;

  // Anti-spam
  honeypot?: string;

  // Idempotency
  idempotencyKey?: string;

  // Vertical context
  verticalId: string;
  metroSlug: string;

  // Responses to qualifying questions
  responses?: Record<string, unknown>;
}

// ─── Form Submission Response ───

export interface FormSubmissionResponse {
  success: boolean;
  leadId: string | null;
  dedupeHit: boolean;
  message: string;
}
