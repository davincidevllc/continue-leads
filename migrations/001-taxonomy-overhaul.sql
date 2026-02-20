-- ============================================================================
-- Migration 001: Taxonomy Overhaul
-- Continue Leads — Milestone 3A
-- 
-- What this does:
--   1. Renames the existing "verticals" table → "categories" (these were always categories)
--   2. Creates a new "verticals" table for industries (Home Improvement, etc.)
--   3. Creates "services" table under categories
--   4. Creates "service_types" table (optional, future use)
--   5. Creates "question_sets" + "question_set_versions" tables
--   6. Creates "blog_posts" table
--   7. Adds new columns to "sites" (brand, geo, blog, indexing)
--   8. Seeds all V1 data
--
-- Safe to run multiple times — uses IF NOT EXISTS / IF EXISTS checks
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Rename "verticals" table → "categories"
-- ============================================================================

-- Rename the table itself
ALTER TABLE IF EXISTS verticals RENAME TO categories;

-- Rename the primary key column: id → category_id (if it's named "id")
-- Note: If M2 used "id" as column name, we rename for clarity
-- We'll keep "id" as-is to avoid breaking existing queries, but add an alias view later
-- Actually, let's check — M2 likely uses "id" as UUID PK. We'll leave column names
-- and just rename the table. The admin code references will be updated in the app.

-- Rename sequences and constraints if they reference "verticals"
-- PostgreSQL auto-renames most constraints with ALTER TABLE RENAME

-- ============================================================================
-- STEP 2: Create new "verticals" table (Industry layer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP 3: Add vertical_id FK to categories
-- ============================================================================

-- Add the column
ALTER TABLE categories ADD COLUMN IF NOT EXISTS vertical_id UUID;

-- We'll set the FK after seeding the vertical, so the reference exists

-- ============================================================================
-- STEP 4: Create "services" table
-- ============================================================================

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP 5: Create "service_types" table (optional, future use)
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL,
    slug VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, slug)
);

-- ============================================================================
-- STEP 6: Create "question_sets" + "question_set_versions"
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL,
    service_id UUID,
    service_type_id UUID,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_set_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_set_id UUID NOT NULL,
    version_num INTEGER NOT NULL DEFAULT 1,
    schema_json JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(question_set_id, version_num)
);

-- ============================================================================
-- STEP 7: Create "blog_posts" table
-- ============================================================================

CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    slug VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    excerpt TEXT,
    content_blocks JSONB NOT NULL DEFAULT '[]',
    meta_description VARCHAR(500),
    status VARCHAR(50) DEFAULT 'draft',
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site_id, slug)
);

-- ============================================================================
-- STEP 8: Add new columns to "sites" table
-- ============================================================================

-- Rename vertical_id → category_id on sites
-- First check if vertical_id exists and category_id doesn't
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sites' AND column_name = 'vertical_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sites' AND column_name = 'category_id'
    ) THEN
        ALTER TABLE sites RENAME COLUMN vertical_id TO category_id;
    END IF;
END $$;

-- Add category_id if it doesn't exist (safety net)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS category_id UUID;

-- Brand identity columns
ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_seed JSONB DEFAULT '{}';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}';

-- Geo targeting
ALTER TABLE sites ADD COLUMN IF NOT EXISTS target_geo_config JSONB DEFAULT '{"type": "metro"}';

-- Blog config
ALTER TABLE sites ADD COLUMN IF NOT EXISTS blog_config JSONB DEFAULT '{"enabled": true, "post_frequency": "weekly"}';

-- Indexing mode (ChatGPT feedback — noindex by default, flip when ready)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS indexing_mode VARCHAR(20) DEFAULT 'noindex';

-- ============================================================================
-- STEP 9: Seed V1 Data
-- ============================================================================

-- 9a. Seed the industry vertical
INSERT INTO verticals (id, slug, name, status)
VALUES ('a1b2c3d4-0001-4000-8000-000000000001', 'home-improvement', 'Home Improvement', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 9b. Update all existing categories to reference the Home Improvement vertical
UPDATE categories 
SET vertical_id = 'a1b2c3d4-0001-4000-8000-000000000001'
WHERE vertical_id IS NULL;

-- 9c. Seed services for Painting category
-- First, get the Painting category ID dynamically
DO $$
DECLARE
    v_painting_id UUID;
    v_cleaning_id UUID;
    v_siding_id UUID;
BEGIN
    -- Get category IDs by slug
    SELECT id INTO v_painting_id FROM categories WHERE slug = 'painting';
    SELECT id INTO v_cleaning_id FROM categories WHERE slug = 'cleaning';
    SELECT id INTO v_siding_id FROM categories WHERE slug = 'siding';

    -- Painting services
    IF v_painting_id IS NOT NULL THEN
        INSERT INTO services (category_id, slug, name) VALUES
            (v_painting_id, 'interior-painting', 'Interior Painting'),
            (v_painting_id, 'exterior-painting', 'Exterior Painting'),
            (v_painting_id, 'commercial-painting', 'Commercial Painting'),
            (v_painting_id, 'popcorn-ceiling-removal', 'Popcorn Ceiling Removal'),
            (v_painting_id, 'specialty-painting-faux-finishes', 'Specialty Painting - Faux Finishes'),
            (v_painting_id, 'wallpaper-install', 'Wallpaper Install'),
            (v_painting_id, 'wallpaper-removal', 'Wallpaper Removal')
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Cleaning services
    IF v_cleaning_id IS NOT NULL THEN
        INSERT INTO services (category_id, slug, name) VALUES
            (v_cleaning_id, 'house-cleaning', 'House Cleaning'),
            (v_cleaning_id, 'office-cleaning', 'Office Cleaning'),
            (v_cleaning_id, 'upholstery-cleaning', 'Upholstery Cleaning')
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    -- Siding services
    IF v_siding_id IS NOT NULL THEN
        INSERT INTO services (category_id, slug, name) VALUES
            (v_siding_id, 'vinyl-siding', 'Vinyl Siding'),
            (v_siding_id, 'stucco-siding', 'Stucco Siding'),
            (v_siding_id, 'composite-wood-siding', 'Composite Wood Siding'),
            (v_siding_id, 'brick-or-stone-siding', 'Brick or Stone Siding'),
            (v_siding_id, 'stone-siding', 'Stone Siding'),
            (v_siding_id, 'aluminium-siding', 'Aluminium Siding')
        ON CONFLICT (slug) DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- STEP 10: Add Foreign Key Constraints
-- ============================================================================

-- categories → verticals
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_categories_vertical' AND table_name = 'categories'
    ) THEN
        ALTER TABLE categories 
        ADD CONSTRAINT fk_categories_vertical 
        FOREIGN KEY (vertical_id) REFERENCES verticals(id);
    END IF;
END $$;

-- services → categories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_services_category' AND table_name = 'services'
    ) THEN
        ALTER TABLE services 
        ADD CONSTRAINT fk_services_category 
        FOREIGN KEY (category_id) REFERENCES categories(id);
    END IF;
END $$;

-- service_types → services
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_service_types_service' AND table_name = 'service_types'
    ) THEN
        ALTER TABLE service_types 
        ADD CONSTRAINT fk_service_types_service 
        FOREIGN KEY (service_id) REFERENCES services(id);
    END IF;
END $$;

-- question_sets → categories, services, service_types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_question_sets_category' AND table_name = 'question_sets'
    ) THEN
        ALTER TABLE question_sets 
        ADD CONSTRAINT fk_question_sets_category 
        FOREIGN KEY (category_id) REFERENCES categories(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_question_sets_service' AND table_name = 'question_sets'
    ) THEN
        ALTER TABLE question_sets 
        ADD CONSTRAINT fk_question_sets_service 
        FOREIGN KEY (service_id) REFERENCES services(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_question_sets_service_type' AND table_name = 'question_sets'
    ) THEN
        ALTER TABLE question_sets 
        ADD CONSTRAINT fk_question_sets_service_type 
        FOREIGN KEY (service_type_id) REFERENCES service_types(id);
    END IF;
END $$;

-- question_set_versions → question_sets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_qsv_question_set' AND table_name = 'question_set_versions'
    ) THEN
        ALTER TABLE question_set_versions 
        ADD CONSTRAINT fk_qsv_question_set 
        FOREIGN KEY (question_set_id) REFERENCES question_sets(id);
    END IF;
END $$;

-- blog_posts → sites
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_blog_posts_site' AND table_name = 'blog_posts'
    ) THEN
        ALTER TABLE blog_posts 
        ADD CONSTRAINT fk_blog_posts_site 
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- STEP 11: Create Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_categories_vertical_id ON categories(vertical_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug);
CREATE INDEX IF NOT EXISTS idx_service_types_service_id ON service_types(service_id);
CREATE INDEX IF NOT EXISTS idx_question_sets_category_id ON question_sets(category_id);
CREATE INDEX IF NOT EXISTS idx_question_sets_service_id ON question_sets(service_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_site_id ON blog_posts(site_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_sites_category_id ON sites(category_id);
CREATE INDEX IF NOT EXISTS idx_sites_indexing_mode ON sites(indexing_mode);

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to confirm)
-- ============================================================================

-- Check verticals (industry)
-- SELECT * FROM verticals;

-- Check categories now reference vertical
-- SELECT c.name as category, v.name as vertical 
-- FROM categories c JOIN verticals v ON c.vertical_id = v.id;

-- Check services seeded correctly
-- SELECT s.name as service, c.name as category 
-- FROM services s JOIN categories c ON s.category_id = c.id 
-- ORDER BY c.name, s.name;

-- Check sites table has new columns
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'sites' ORDER BY ordinal_position;
