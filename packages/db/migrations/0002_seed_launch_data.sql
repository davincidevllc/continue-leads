-- Continue Leads - Seed Data
-- Seed: 0002_seed_launch_data.sql
-- Description: Launch metros, verticals, categories, services, and initial template

-- ============================================================
-- Launch Metros (5 confirmed)
-- ============================================================

INSERT INTO metros (name, state, slug, is_active, priority, facts) VALUES
('Boston', 'MA', 'boston-ma', true, 1, '{
  "population": "675,647",
  "founded": "1630",
  "area": "89.63 sq mi",
  "nickname": "The Hub",
  "climate": "Four distinct seasons with cold winters and warm summers",
  "commonHomeStyles": ["Colonial", "Triple-decker", "Victorian", "Cape Cod"],
  "neighborhoods": ["Back Bay", "South End", "Beacon Hill", "Jamaica Plain", "Dorchester", "Cambridge", "Somerville", "Brookline"]
}'::jsonb),
('Dallas', 'TX', 'dallas-tx', true, 2, '{
  "population": "1,304,379",
  "founded": "1841",
  "area": "385.8 sq mi",
  "nickname": "Big D",
  "climate": "Hot summers with mild winters and occasional ice storms",
  "commonHomeStyles": ["Ranch", "Contemporary", "Mediterranean", "Tudor"],
  "neighborhoods": ["Uptown", "Highland Park", "Lakewood", "Bishop Arts", "Deep Ellum", "Plano", "Frisco", "Richardson"]
}'::jsonb),
('Houston', 'TX', 'houston-tx', true, 3, '{
  "population": "2,304,580",
  "founded": "1836",
  "area": "671.7 sq mi",
  "nickname": "Space City",
  "climate": "Hot and humid subtropical climate with mild winters",
  "commonHomeStyles": ["Ranch", "Colonial", "Contemporary", "Bungalow"],
  "neighborhoods": ["The Heights", "Montrose", "River Oaks", "Memorial", "Katy", "Sugar Land", "Pearland", "The Woodlands"]
}'::jsonb),
('Atlanta', 'GA', 'atlanta-ga', true, 4, '{
  "population": "498,715",
  "founded": "1837",
  "area": "134.0 sq mi",
  "nickname": "The ATL",
  "climate": "Humid subtropical with hot summers and mild winters",
  "commonHomeStyles": ["Ranch", "Colonial", "Craftsman", "Split-level"],
  "neighborhoods": ["Buckhead", "Midtown", "Virginia-Highland", "Decatur", "East Atlanta", "Marietta", "Roswell", "Alpharetta"]
}'::jsonb),
('Miami', 'FL', 'miami-fl', true, 5, '{
  "population": "442,241",
  "founded": "1896",
  "area": "55.25 sq mi",
  "nickname": "The Magic City",
  "climate": "Tropical monsoon climate with hot, humid summers and warm winters",
  "commonHomeStyles": ["Mediterranean Revival", "Art Deco", "Contemporary", "Spanish Colonial"],
  "neighborhoods": ["Brickell", "Coconut Grove", "Coral Gables", "Wynwood", "Little Havana", "Miami Beach", "Hialeah", "Kendall"]
}'::jsonb);

-- ============================================================
-- Verticals
-- ============================================================

INSERT INTO verticals (name, slug, dedupe_window_days, required_fields, is_active) VALUES
('Interior Painting', 'interior_painting', 7,
  '{"phone": true, "zip": true, "email": false, "firstName": false, "lastName": false}'::jsonb, true),
('Residential Cleaning', 'residential_cleaning', 7,
  '{"phone": true, "zip": true, "email": false, "firstName": false, "lastName": false}'::jsonb, true),
('Siding', 'siding', 7,
  '{"phone": true, "zip": true, "email": false, "firstName": false, "lastName": false}'::jsonb, true);

-- ============================================================
-- Categories (1:1 with verticals in V1)
-- ============================================================

INSERT INTO categories (name, slug, vertical_id) 
SELECT v.name, v.slug, v.id FROM verticals v;

-- ============================================================
-- Services (specific services per vertical)
-- ============================================================

-- Interior Painting services
INSERT INTO services (name, slug, category_id) VALUES
('Interior House Painting', 'interior-house-painting',
  (SELECT id FROM categories WHERE slug = 'interior_painting')),
('Room Painting', 'room-painting',
  (SELECT id FROM categories WHERE slug = 'interior_painting')),
('Cabinet Painting', 'cabinet-painting',
  (SELECT id FROM categories WHERE slug = 'interior_painting')),
('Ceiling Painting', 'ceiling-painting',
  (SELECT id FROM categories WHERE slug = 'interior_painting')),
('Trim and Molding Painting', 'trim-molding-painting',
  (SELECT id FROM categories WHERE slug = 'interior_painting'));

-- Residential Cleaning services
INSERT INTO services (name, slug, category_id) VALUES
('Standard House Cleaning', 'standard-house-cleaning',
  (SELECT id FROM categories WHERE slug = 'residential_cleaning')),
('Deep Cleaning', 'deep-cleaning',
  (SELECT id FROM categories WHERE slug = 'residential_cleaning')),
('Move-In/Move-Out Cleaning', 'move-in-out-cleaning',
  (SELECT id FROM categories WHERE slug = 'residential_cleaning')),
('Recurring Cleaning', 'recurring-cleaning',
  (SELECT id FROM categories WHERE slug = 'residential_cleaning')),
('Post-Construction Cleaning', 'post-construction-cleaning',
  (SELECT id FROM categories WHERE slug = 'residential_cleaning'));

-- Siding services
INSERT INTO services (name, slug, category_id) VALUES
('Vinyl Siding Installation', 'vinyl-siding',
  (SELECT id FROM categories WHERE slug = 'siding')),
('Fiber Cement Siding', 'fiber-cement-siding',
  (SELECT id FROM categories WHERE slug = 'siding')),
('Wood Siding', 'wood-siding',
  (SELECT id FROM categories WHERE slug = 'siding')),
('Siding Repair', 'siding-repair',
  (SELECT id FROM categories WHERE slug = 'siding')),
('Siding Replacement', 'siding-replacement',
  (SELECT id FROM categories WHERE slug = 'siding'));

-- ============================================================
-- Default Template
-- ============================================================

INSERT INTO templates (name, description, page_types, version, is_active, config) VALUES
('Lead Gen Standard', 'Standard lead generation template with hero, services, trust section, and form',
  '["SERVICE_HUB", "CITY_SERVICE", "PRIVACY", "TERMS", "THANK_YOU", "FAQ", "NOT_FOUND"]'::jsonb,
  1, true,
  '{
    "colorScheme": {"primary": "#1B4F72", "secondary": "#2E86C1", "accent": "#F39C12"},
    "modules": ["hero", "service_explainer", "local_context", "faq", "trust_section", "process_steps", "cta", "form"]
  }'::jsonb);

-- Seed migration tracking
INSERT INTO schema_migrations (version) VALUES ('0002_seed_launch_data')
ON CONFLICT (version) DO NOTHING;
