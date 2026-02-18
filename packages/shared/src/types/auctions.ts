import { AuctionStatus, BidStatus, DeliveryStatus } from '../enums';

// ─── Buyer ───

export interface Buyer {
  id: string;
  name: string;
  isActive: boolean;
  endpointUrl: string;
  apiKeyHash: string;
  timeoutMs: number;
  requiredFields: string[];
  supportedVerticals: string[];
  supportedStates: string[];
  supportedMetros: string[];
  config: BuyerConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuyerConfig {
  maxDailyLeads?: number;
  maxDailySpendCents?: number;
  minBidCents?: number;
  postbackUrl?: string;
  customHeaders?: Record<string, string>;
  fieldMapping?: Record<string, string>;
}

// ─── Auction ───

export interface LeadAuction {
  id: string;
  leadId: string;
  status: AuctionStatus;
  attemptNumber: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  winningBidId: string | null;
  winningAmountCents: number | null;
  buyersPinged: number;
  bidsReceived: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

// ─── Bid Record ───

export interface LeadAuctionBid {
  id: string;
  auctionId: string;
  buyerId: string;
  status: BidStatus;
  bidAmountCents: number | null;
  responseTimeMs: number | null;
  httpStatusCode: number | null;
  errorMessage: string | null;
  rawResponse: Record<string, unknown> | null;
  deliveryStatus: DeliveryStatus;
  deliveryAttempts: number;
  buyerReceiptId: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
}
