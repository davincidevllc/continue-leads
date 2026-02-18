import { ContentBlockType, ContentProvider, PageType, Vertical } from '../enums';

// ─── Content Generation Request ───

export interface ContentGenerationRequest {
  vertical: Vertical;
  serviceName: string;
  metroName: string;
  metroState: string;
  metroSlug: string;
  pageType: PageType;
  requiredBlocks: ContentBlockType[];
  styleSeed: string;
  domain: string;
  metroFacts?: Record<string, string>;
}

// ─── Content Generation Response ───

export interface ContentGenerationResponse {
  blocks: ContentBlock[];
  provider: ContentProvider;
  model: string;
  promptVersion: string;
  generatedAt: Date;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  };
}

// ─── Content Block (discriminated union) ───

export type ContentBlock =
  | HeroBlock
  | ServiceExplainerBlock
  | LocalContextBlock
  | FaqBlock
  | TrustSectionBlock
  | ProcessStepsBlock
  | CtaBlock
  | MetaBlock
  | FormBlock;

interface BaseBlock {
  blockType: ContentBlockType;
  contentHash: string;
}

export interface HeroBlock extends BaseBlock {
  blockType: ContentBlockType.HERO;
  content: {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaUrl: string;
    backgroundImageAlt?: string;
  };
}

export interface ServiceExplainerBlock extends BaseBlock {
  blockType: ContentBlockType.SERVICE_EXPLAINER;
  content: {
    title: string;
    introduction: string;
    services: Array<{
      name: string;
      description: string;
      icon?: string;
    }>;
  };
}

export interface LocalContextBlock extends BaseBlock {
  blockType: ContentBlockType.LOCAL_CONTEXT;
  content: {
    title: string;
    body: string;
    localFacts: Array<{
      label: string;
      value: string;
    }>;
    neighborhoods?: string[];
  };
}

export interface FaqBlock extends BaseBlock {
  blockType: ContentBlockType.FAQ;
  content: {
    title: string;
    items: Array<{
      question: string;
      answer: string;
    }>;
  };
}

export interface TrustSectionBlock extends BaseBlock {
  blockType: ContentBlockType.TRUST_SECTION;
  content: {
    title: string;
    items: Array<{
      title: string;
      description: string;
      icon?: string;
    }>;
    disclaimer?: string;
  };
}

export interface ProcessStepsBlock extends BaseBlock {
  blockType: ContentBlockType.PROCESS_STEPS;
  content: {
    title: string;
    steps: Array<{
      stepNumber: number;
      title: string;
      description: string;
    }>;
  };
}

export interface CtaBlock extends BaseBlock {
  blockType: ContentBlockType.CTA;
  content: {
    headline: string;
    body: string;
    buttonText: string;
    buttonUrl: string;
    urgencyText?: string;
  };
}

export interface MetaBlock extends BaseBlock {
  blockType: ContentBlockType.META;
  content: {
    title: string;
    metaDescription: string;
    ogTitle: string;
    ogDescription: string;
    ogType: string;
    canonicalUrl: string;
    keywords: string[];
    schemaMarkup: Record<string, unknown>;
  };
}

export interface FormBlock extends BaseBlock {
  blockType: ContentBlockType.FORM;
  content: {
    title: string;
    subtitle: string;
    submitButtonText: string;
    consentText: string;
    consentTextVersion: string;
    successRedirectUrl: string;
    fields: Array<{
      name: string;
      label: string;
      type: 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'checkbox' | 'hidden';
      required: boolean;
      placeholder?: string;
      options?: string[];
      validation?: string;
    }>;
  };
}

// ─── Content Provider Interface ───

export interface ContentProviderInterface {
  generateBlocks(request: ContentGenerationRequest): Promise<ContentGenerationResponse>;
  readonly providerName: ContentProvider;
}

// ─── Prompt Template ───

export interface PromptTemplate {
  id: string;
  vertical: Vertical;
  pageType: PageType;
  blockType: ContentBlockType;
  version: string;
  systemPrompt: string;
  userPromptTemplate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
