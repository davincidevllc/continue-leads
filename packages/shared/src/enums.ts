// ─── Lead Lifecycle ───

export enum LeadStatus {
  NEW = 'NEW',
  VALIDATED = 'VALIDATED',
  QUALIFIED = 'QUALIFIED',
  QUEUED = 'QUEUED',
  OFFERED = 'OFFERED',
  SOLD = 'SOLD',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  UNSOLD = 'UNSOLD',
}

export const TERMINAL_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set([
  LeadStatus.SOLD,
  LeadStatus.REJECTED,
  LeadStatus.EXPIRED,
  LeadStatus.UNSOLD,
]);

export enum RejectionReason {
  DEDUPE_HIT = 'DEDUPE_HIT',
  INVALID_PHONE = 'INVALID_PHONE',
  INVALID_EMAIL = 'INVALID_EMAIL',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  TCPA_CONSENT_MISSING = 'TCPA_CONSENT_MISSING',
  HONEYPOT_TRIGGERED = 'HONEYPOT_TRIGGERED',
  RATE_LIMITED = 'RATE_LIMITED',
  JUNK_DETECTED = 'JUNK_DETECTED',
  FRAUD_SCORE_HIGH = 'FRAUD_SCORE_HIGH',
  STALENESS_EXCEEDED = 'STALENESS_EXCEEDED',
}

// ─── Site & Publishing ───

export enum SiteStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum PageType {
  SERVICE_HUB = 'SERVICE_HUB',
  CITY_SERVICE = 'CITY_SERVICE',
  PRIVACY = 'PRIVACY',
  TERMS = 'TERMS',
  THANK_YOU = 'THANK_YOU',
  FAQ = 'FAQ',
  NOT_FOUND = 'NOT_FOUND',
}

// ─── Content Engine ───

export enum ContentBlockType {
  HERO = 'hero',
  SERVICE_EXPLAINER = 'service_explainer',
  LOCAL_CONTEXT = 'local_context',
  FAQ = 'faq',
  TRUST_SECTION = 'trust_section',
  PROCESS_STEPS = 'process_steps',
  CTA = 'cta',
  META = 'meta',
  FORM = 'form',
}

export enum ContentProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  STUB = 'stub',
}

// ─── Service Hierarchy ───

export enum Vertical {
  INTERIOR_PAINTING = 'interior_painting',
  RESIDENTIAL_CLEANING = 'residential_cleaning',
  SIDING = 'siding',
}

// ─── Location ───

export enum TargetingMode {
  NATIONWIDE = 'NATIONWIDE',
  STATE = 'STATE',
  ZIP_RADIUS = 'ZIP_RADIUS',
  METRO = 'METRO',
}

// ─── Auctions (Phase 3) ───

export enum AuctionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  NO_BIDS = 'NO_BIDS',
  FAILED = 'FAILED',
}

export enum BidStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR',
  REJECTED = 'REJECTED',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  DISPUTED = 'DISPUTED',
}

// ─── Outbox ───

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum OutboxEventType {
  LEAD_RECEIVED = 'LeadReceived',
}

// ─── Value Drivers (normalized for fast routing) ───

export enum Urgency {
  EMERGENCY = 'EMERGENCY',
  WITHIN_48H = 'WITHIN_48H',
  THIS_WEEK = 'THIS_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  FLEXIBLE = 'FLEXIBLE',
}

export enum PropertyType {
  SINGLE_FAMILY = 'SINGLE_FAMILY',
  MULTI_FAMILY = 'MULTI_FAMILY',
  CONDO = 'CONDO',
  TOWNHOUSE = 'TOWNHOUSE',
  COMMERCIAL = 'COMMERCIAL',
  OTHER = 'OTHER',
}

export enum ProjectSizeBucket {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  ENTERPRISE = 'ENTERPRISE',
}

export enum BudgetRange {
  UNDER_500 = 'UNDER_500',
  RANGE_500_1000 = 'RANGE_500_1000',
  RANGE_1000_2500 = 'RANGE_1000_2500',
  RANGE_2500_5000 = 'RANGE_2500_5000',
  RANGE_5000_10000 = 'RANGE_5000_10000',
  OVER_10000 = 'OVER_10000',
  NOT_SURE = 'NOT_SURE',
}
