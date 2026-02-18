import {
  OutboxEventStatus,
  OutboxEventType,
  Urgency,
  PropertyType,
  ProjectSizeBucket,
  BudgetRange,
  TargetingMode,
} from '../enums';

// ─── SQS LeadReceived Message ───

export interface LeadReceivedMessage {
  schemaVersion: '1.0';
  eventType: OutboxEventType.LEAD_RECEIVED;
  eventId: string;
  occurredAt: string; // ISO 8601
  leadId: string;
  correlationId: string;
  createdAt: string; // ISO 8601 — lead capture timestamp

  service: {
    categoryId: string;
    serviceId: string;
    serviceTypeId: string | null;
    questionSetId: string | null;
    questionSetVersionId: string | null;
  };

  location: {
    targetingMode: TargetingMode;
    state: string | null;
    zip: string | null;
    radiusMiles: number | null;
    metroSlug: string | null;
  };

  value: {
    urgency: Urgency | null;
    propertyType: PropertyType | null;
    projectSizeBucket: ProjectSizeBucket | null;
    budgetRange: BudgetRange | null;
    timeframeDays: number | null;
  };

  attribution: {
    domain: string;
    pageUrl: string;
    pageType: string;
    utm: {
      source: string | null;
      medium: string | null;
      campaign: string | null;
      term: string | null;
      content: string | null;
    };
  };

  compliance: {
    tcpaConsent: boolean;
    consentTextVersion: string;
  };

  dedupe: {
    dedupeWindowSeconds: number;
    dedupeHit: boolean;
  };
}

// ─── Outbox Event ───

export interface OutboxEvent {
  id: string;
  eventType: OutboxEventType;
  eventId: string;
  aggregateId: string;
  payload: LeadReceivedMessage;
  status: OutboxEventStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextAvailableAt: Date;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Consumer Event Receipt (idempotency) ───

export interface ConsumerEventReceipt {
  id: string;
  eventId: string;
  leadId: string;
  consumerId: string;
  processedAt: Date;
  createdAt: Date;
}

// ─── Dedupe Claim ───

export interface DedupeClaim {
  id: string;
  leadId: string;
  claimHash: string;
  claimType: 'phone' | 'email';
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
}
