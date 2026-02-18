import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'continueleads',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// ─── Metros ───

export interface MetroRow {
  id: string; name: string; state: string; slug: string;
  is_active: boolean; priority: number; facts: Record<string, unknown>;
  created_at: string; updated_at: string; site_count?: number;
}

export async function listMetros(): Promise<MetroRow[]> {
  return query<MetroRow>(`
    SELECT m.*, 
      (SELECT COUNT(*)::int FROM site_metros sm WHERE sm.metro_id = m.id) AS site_count
    FROM metros m ORDER BY m.priority ASC, m.name ASC
  `);
}

export async function getMetro(id: string): Promise<MetroRow | null> {
  return queryOne<MetroRow>('SELECT * FROM metros WHERE id = $1', [id]);
}

export async function createMetro(data: {
  name: string; state: string; slug: string; priority?: number; facts?: Record<string, unknown>;
}): Promise<MetroRow> {
  const rows = await query<MetroRow>(
    `INSERT INTO metros (name, state, slug, priority, facts) 
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.state, data.slug, data.priority ?? 0, JSON.stringify(data.facts ?? {})]
  );
  return rows[0];
}

export async function updateMetro(id: string, data: Partial<{
  name: string; state: string; slug: string; is_active: boolean; priority: number; facts: Record<string, unknown>;
}>): Promise<MetroRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.name !== undefined) { sets.push(`name = $${i++}`); vals.push(data.name); }
  if (data.state !== undefined) { sets.push(`state = $${i++}`); vals.push(data.state); }
  if (data.slug !== undefined) { sets.push(`slug = $${i++}`); vals.push(data.slug); }
  if (data.is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(data.is_active); }
  if (data.priority !== undefined) { sets.push(`priority = $${i++}`); vals.push(data.priority); }
  if (data.facts !== undefined) { sets.push(`facts = $${i++}`); vals.push(JSON.stringify(data.facts)); }
  if (sets.length === 0) return getMetro(id);
  sets.push(`updated_at = now()`);
  vals.push(id);
  return queryOne<MetroRow>(`UPDATE metros SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
}

// ─── Verticals ───

export interface VerticalRow {
  id: string; name: string; slug: string; dedupe_window_days: number;
  required_fields: Record<string, boolean>; is_active: boolean;
  created_at: string; updated_at: string; service_count?: number; lead_count?: number;
}

export async function listVerticals(): Promise<VerticalRow[]> {
  return query<VerticalRow>(`
    SELECT v.*,
      (SELECT COUNT(*)::int FROM services s JOIN categories c ON s.category_id = c.id WHERE c.vertical_id = v.id) AS service_count,
      (SELECT COUNT(*)::int FROM leads l JOIN categories c2 ON l.category_id = c2.id WHERE c2.vertical_id = v.id) AS lead_count
    FROM verticals v ORDER BY v.name ASC
  `);
}

export async function getVertical(id: string): Promise<VerticalRow | null> {
  return queryOne<VerticalRow>('SELECT * FROM verticals WHERE id = $1', [id]);
}

export async function updateVertical(id: string, data: Partial<{
  name: string; dedupe_window_days: number; required_fields: Record<string, boolean>; is_active: boolean;
}>): Promise<VerticalRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.name !== undefined) { sets.push(`name = $${i++}`); vals.push(data.name); }
  if (data.dedupe_window_days !== undefined) { sets.push(`dedupe_window_days = $${i++}`); vals.push(data.dedupe_window_days); }
  if (data.required_fields !== undefined) { sets.push(`required_fields = $${i++}`); vals.push(JSON.stringify(data.required_fields)); }
  if (data.is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(data.is_active); }
  if (sets.length === 0) return getVertical(id);
  sets.push(`updated_at = now()`);
  vals.push(id);
  return queryOne<VerticalRow>(`UPDATE verticals SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
}

// ─── Services ───

export interface ServiceRow {
  id: string; name: string; slug: string; category_id: string;
  vertical_name: string; vertical_slug: string; is_active: boolean;
}

export async function listServices(): Promise<ServiceRow[]> {
  return query<ServiceRow>(`
    SELECT s.*, v.name AS vertical_name, v.slug AS vertical_slug
    FROM services s
    JOIN categories c ON s.category_id = c.id
    JOIN verticals v ON c.vertical_id = v.id
    ORDER BY v.name, s.name
  `);
}

// ─── Sites ───

export interface SiteRow {
  id: string; domain: string; vertical_id: string; vertical_name?: string;
  template_id: string; template_name?: string; status: string;
  style_seed: string; config: Record<string, unknown>;
  created_at: string; updated_at: string; metro_count?: number; lead_count?: number;
}

export async function listSites(filters?: {
  status?: string; vertical_id?: string; search?: string; limit?: number; offset?: number;
}): Promise<{ rows: SiteRow[]; total: number }> {
  const wheres: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (filters?.status) { wheres.push(`s.status = $${i++}`); vals.push(filters.status); }
  if (filters?.vertical_id) { wheres.push(`s.vertical_id = $${i++}`); vals.push(filters.vertical_id); }
  if (filters?.search) { wheres.push(`s.domain ILIKE $${i++}`); vals.push(`%${filters.search}%`); }
  const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const countResult = await queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM sites s ${where}`, vals);
  const rows = await query<SiteRow>(
    `SELECT s.*, v.name AS vertical_name, t.name AS template_name,
      (SELECT COUNT(*)::int FROM site_metros sm WHERE sm.site_id = s.id) AS metro_count,
      (SELECT COUNT(*)::int FROM leads l WHERE l.site_id = s.id) AS lead_count
     FROM sites s
     LEFT JOIN verticals v ON s.vertical_id = v.id
     LEFT JOIN templates t ON s.template_id = t.id
     ${where}
     ORDER BY s.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...vals, limit, offset]
  );
  return { rows, total: countResult?.count ?? 0 };
}

export async function getSite(id: string): Promise<SiteRow | null> {
  return queryOne<SiteRow>(`
    SELECT s.*, v.name AS vertical_name, t.name AS template_name
    FROM sites s LEFT JOIN verticals v ON s.vertical_id = v.id LEFT JOIN templates t ON s.template_id = t.id
    WHERE s.id = $1
  `, [id]);
}

export async function createSite(data: {
  domain: string; vertical_id: string; template_id: string; metro_ids?: string[];
}): Promise<SiteRow> {
  const rows = await query<SiteRow>(
    `INSERT INTO sites (domain, vertical_id, template_id) VALUES ($1, $2, $3) RETURNING *`,
    [data.domain, data.vertical_id, data.template_id]
  );
  const site = rows[0];
  if (data.metro_ids?.length) {
    for (const metroId of data.metro_ids) {
      await query('INSERT INTO site_metros (site_id, metro_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [site.id, metroId]);
    }
  }
  return site;
}

export async function updateSite(id: string, data: Partial<{
  domain: string; status: string; vertical_id: string; template_id: string; config: Record<string, unknown>;
}>): Promise<SiteRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.domain !== undefined) { sets.push(`domain = $${i++}`); vals.push(data.domain); }
  if (data.status !== undefined) { sets.push(`status = $${i++}`); vals.push(data.status); }
  if (data.vertical_id !== undefined) { sets.push(`vertical_id = $${i++}`); vals.push(data.vertical_id); }
  if (data.template_id !== undefined) { sets.push(`template_id = $${i++}`); vals.push(data.template_id); }
  if (data.config !== undefined) { sets.push(`config = $${i++}`); vals.push(JSON.stringify(data.config)); }
  if (sets.length === 0) return getSite(id);
  sets.push(`updated_at = now()`);
  vals.push(id);
  return queryOne<SiteRow>(`UPDATE sites SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
}

export async function getSiteMetros(siteId: string): Promise<MetroRow[]> {
  return query<MetroRow>(`
    SELECT m.* FROM metros m JOIN site_metros sm ON sm.metro_id = m.id WHERE sm.site_id = $1 ORDER BY m.priority
  `, [siteId]);
}

export async function setSiteMetros(siteId: string, metroIds: string[]): Promise<void> {
  await query('DELETE FROM site_metros WHERE site_id = $1', [siteId]);
  for (const metroId of metroIds) {
    await query('INSERT INTO site_metros (site_id, metro_id) VALUES ($1, $2)', [siteId, metroId]);
  }
}

// ─── Templates ───

export interface TemplateRow { id: string; name: string; description: string; is_active: boolean; }

export async function listTemplates(): Promise<TemplateRow[]> {
  return query<TemplateRow>('SELECT id, name, description, is_active FROM templates ORDER BY name');
}

// ─── Leads ───

export interface LeadRow {
  id: string; site_id: string | null; status: string; rejection_reason: string | null;
  dedupe_hit: boolean; category_id: string | null; service_id: string | null;
  urgency: string | null; property_type: string | null; metro_slug: string | null;
  zip: string | null; created_at: string; updated_at: string;
  domain?: string; vertical_name?: string; metro_name?: string; phone_last4?: string;
}

export async function listLeads(filters?: {
  status?: string; vertical_id?: string; metro_slug?: string;
  date_from?: string; date_to?: string; search?: string; limit?: number; offset?: number;
}): Promise<{ rows: LeadRow[]; total: number }> {
  const wheres: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (filters?.status) { wheres.push(`l.status = $${i++}`); vals.push(filters.status); }
  if (filters?.vertical_id) { wheres.push(`c.vertical_id = $${i++}`); vals.push(filters.vertical_id); }
  if (filters?.metro_slug) { wheres.push(`l.metro_slug = $${i++}`); vals.push(filters.metro_slug); }
  if (filters?.date_from) { wheres.push(`l.created_at >= $${i++}`); vals.push(filters.date_from); }
  if (filters?.date_to) { wheres.push(`l.created_at <= $${i++}`); vals.push(filters.date_to + 'T23:59:59Z'); }
  if (filters?.search) { wheres.push(`(s.domain ILIKE $${i} OR l.zip ILIKE $${i})`); vals.push(`%${filters.search}%`); i++; }
  const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const countResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM leads l 
     LEFT JOIN sites s ON l.site_id = s.id
     LEFT JOIN categories c ON l.category_id = c.id ${where}`, vals
  );
  const rows = await query<LeadRow>(
    `SELECT l.*, s.domain, v.name AS vertical_name, m.name AS metro_name,
      RIGHT(lc.phone_hash, 4) AS phone_last4
     FROM leads l
     LEFT JOIN sites s ON l.site_id = s.id
     LEFT JOIN categories c ON l.category_id = c.id
     LEFT JOIN verticals v ON c.vertical_id = v.id
     LEFT JOIN metros m ON m.slug = l.metro_slug
     LEFT JOIN lead_contacts lc ON lc.lead_id = l.id
     ${where}
     ORDER BY l.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...vals, limit, offset]
  );
  return { rows, total: countResult?.count ?? 0 };
}

export async function getLead(id: string): Promise<LeadRow | null> {
  return queryOne<LeadRow>(`
    SELECT l.*, s.domain, v.name AS vertical_name, m.name AS metro_name
    FROM leads l LEFT JOIN sites s ON l.site_id = s.id
    LEFT JOIN categories c ON l.category_id = c.id LEFT JOIN verticals v ON c.vertical_id = v.id
    LEFT JOIN metros m ON m.slug = l.metro_slug WHERE l.id = $1
  `, [id]);
}

export interface LeadDetailRow { responses: Record<string, unknown>; }
export async function getLeadDetails(leadId: string): Promise<LeadDetailRow | null> {
  return queryOne<LeadDetailRow>('SELECT responses FROM lead_details WHERE lead_id = $1', [leadId]);
}

export interface LeadEventRow {
  id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string;
}
export async function getLeadEvents(leadId: string): Promise<LeadEventRow[]> {
  return query<LeadEventRow>('SELECT * FROM lead_status_events WHERE lead_id = $1 ORDER BY created_at ASC', [leadId]);
}

// ─── Dashboard ───

export interface DashboardStats {
  total_leads: number; leads_today: number; total_sites: number; active_metros: number;
  leads_by_status: { status: string; count: number }[];
  leads_by_vertical: { name: string; count: number }[];
  recent_leads: LeadRow[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalLeads] = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM leads');
  const [leadsToday] = await query<{ count: number }>("SELECT COUNT(*)::int AS count FROM leads WHERE created_at >= CURRENT_DATE");
  const [totalSites] = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM sites');
  const [activeMetros] = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM metros WHERE is_active = true');
  const leadsByStatus = await query<{ status: string; count: number }>('SELECT status, COUNT(*)::int AS count FROM leads GROUP BY status ORDER BY count DESC');
  const leadsByVertical = await query<{ name: string; count: number }>(
    `SELECT v.name, COUNT(l.id)::int AS count FROM leads l JOIN categories c ON l.category_id = c.id JOIN verticals v ON c.vertical_id = v.id GROUP BY v.name ORDER BY count DESC`
  );
  const recentLeads = await query<LeadRow>(`SELECT l.*, s.domain FROM leads l LEFT JOIN sites s ON l.site_id = s.id ORDER BY l.created_at DESC LIMIT 10`);
  return {
    total_leads: totalLeads?.count ?? 0, leads_today: leadsToday?.count ?? 0,
    total_sites: totalSites?.count ?? 0, active_metros: activeMetros?.count ?? 0,
    leads_by_status: leadsByStatus, leads_by_vertical: leadsByVertical, recent_leads: recentLeads,
  };
}
