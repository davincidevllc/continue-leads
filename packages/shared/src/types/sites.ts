import { SiteStatus, PageType, Vertical } from '../enums';

// ─── Metro ───

export interface Metro {
  id: string;
  name: string;
  state: string;
  slug: string;
  isActive: boolean;
  priority: number;
  facts: MetroFacts | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetroFacts {
  population?: string;
  founded?: string;
  area?: string;
  nickname?: string;
  climate?: string;
  commonHomeStyles?: string[];
  neighborhoods?: string[];
}

// ─── Vertical Config ───

export interface VerticalConfig {
  id: string;
  name: string;
  slug: Vertical;
  dedupeWindowDays: number;
  requiredFields: RequiredFieldsConfig;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequiredFieldsConfig {
  phone: boolean;
  zip: boolean;
  email: boolean;
  firstName: boolean;
  lastName: boolean;
}

export const DEFAULT_REQUIRED_FIELDS: RequiredFieldsConfig = {
  phone: true,
  zip: true,
  email: false,
  firstName: false,
  lastName: false,
};

// ─── Template ───

export interface Template {
  id: string;
  name: string;
  description: string | null;
  pageTypes: PageType[];
  version: number;
  isActive: boolean;
  config: TemplateConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateConfig {
  colorScheme?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  favicon?: string;
  brandName?: string;
  modules: string[];
}

// ─── Site ───

export interface Site {
  id: string;
  domain: string;
  verticalId: string;
  templateId: string;
  metroIds: string[];
  status: SiteStatus;
  styleSeed: string;
  consentTextVersion: string;
  config: SiteConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteConfig {
  entityName: string;
  phoneNumber?: string;
  address?: string;
  brandColors?: {
    primary: string;
    secondary: string;
  };
  favicon?: string;
  customCss?: string;
}

// ─── Site Target (a site × metro combination for deployment) ───

export interface SiteTarget {
  id: string;
  siteId: string;
  metroId: string;
  domain: string;
  vertical: Vertical;
  metroSlug: string;
  metroName: string;
  state: string;
  status: SiteStatus;
}

// ─── Generated Page ───

export interface GeneratedPage {
  id: string;
  siteId: string;
  metroId: string | null;
  pageType: PageType;
  urlPath: string;
  title: string;
  metaDescription: string;
  contentBlocks: string; // JSON string of ContentBlock[]
  contentHash: string;
  promptVersion: string;
  providerModel: string;
  status: SiteStatus;
  generatedAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
