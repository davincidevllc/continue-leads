-- Migration 004: Site Pages, Generation Jobs, QA System
-- PRD Sections 7.4, 7.5, 7.6
BEGIN;

-- === SITE PAGES (7.4) ===
CREATE TABLE IF NOT EXISTS site_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_type VARCHAR(30) NOT NULL CHECK (page_type IN (
    'HOME','SERVICE','CITY','MONEY','LEGAL','BLOG_INDEX','BLOG_POST'
  )),
  service_id UUID REFERENCES services(id),
  city_id INTEGER REFERENCES cities(id),
  path VARCHAR(500) NOT NULL,
  title VARCHAR(500),
  meta_description VARCHAR(500),
  content_blocks JSONB NOT NULL DEFAULT '[]',
  meta JSONB DEFAULT '{}',
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft','generated','approved','rejected','published'
  )),
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id, path)
);

CREATE INDEX IF NOT EXISTS idx_site_pages_site ON site_pages(site_id);
CREATE INDEX IF NOT EXISTS idx_site_pages_type ON site_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_site_pages_status ON site_pages(status);
CREATE INDEX IF NOT EXISTS idx_site_pages_site_type ON site_pages(site_id, page_type);

-- === GENERATION JOBS (7.5) ===
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  job_type VARCHAR(30) NOT NULL CHECK (job_type IN (
    'DERIVE_CITIES','GENERATE_CONTENT','RENDER_PAGES','BUILD_BUNDLE','PUBLISH'
  )),
  status VARCHAR(30) DEFAULT 'queued' CHECK (status IN (
    'queued','running','completed','failed','cancelled'
  )),
  cap_config JSONB DEFAULT '{"max_cities": 25, "max_pages": 500}',
  total_items INTEGER DEFAULT 0,
  completed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  page_id UUID REFERENCES site_pages(id),
  item_type VARCHAR(50),
  item_ref VARCHAR(255),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending','processing','completed','failed','skipped'
  )),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gen_jobs_site ON generation_jobs(site_id);
CREATE INDEX IF NOT EXISTS idx_gen_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_gen_job_items_job ON generation_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_gen_job_items_status ON generation_job_items(status);

-- === QA SYSTEM (7.6) ===
CREATE TABLE IF NOT EXISTS qa_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  scope VARCHAR(30) DEFAULT 'all' CHECK (scope IN (
    'all','sample','money_pages','service_pages','city_pages'
  )),
  status VARCHAR(30) DEFAULT 'running' CHECK (status IN (
    'running','completed','failed'
  )),
  total_pages INTEGER DEFAULT 0,
  pages_passed INTEGER DEFAULT 0,
  pages_warned INTEGER DEFAULT 0,
  pages_failed INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}',
  override_approved BOOLEAN DEFAULT false,
  override_reason TEXT,
  override_at TIMESTAMP,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_run_id UUID NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_id UUID REFERENCES site_pages(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('TECH','CONTENT')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO','WARN','CRITICAL')),
  code VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_site ON qa_runs(site_id);
CREATE INDEX IF NOT EXISTS idx_qa_findings_run ON qa_findings(qa_run_id);
CREATE INDEX IF NOT EXISTS idx_qa_findings_severity ON qa_findings(severity);
CREATE INDEX IF NOT EXISTS idx_qa_findings_page ON qa_findings(page_id);

-- === SITES: add category_id FK if missing (one category per brand) ===
ALTER TABLE sites ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

COMMIT;
