import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

export const fleetRoutes = new Hono();

export type VehicleRow = {
  id: string;
  registration_number: string;
  brand_model: string;
  vehicle_type: 'camionnette' | 'pickup' | 'camion' | 'moto_coursier' | 'voiture_liaison';
  assigned_role: 'coursier' | 'responsable_livraisons' | 'direction' | 'chauffeur' | 'autre';
  assigned_worker_id?: string | null;
  assigned_worker_name?: string | null;
  insurance_company?: string | null;
  insurance_policy_number?: string | null;
  insurance_start_date?: string | null;
  insurance_end_date?: string | null;
  technical_visit_last_date?: string | null;
  technical_visit_due_date?: string | null;
  current_mileage: number;
  last_oil_change_date?: string | null;
  last_oil_change_mileage: number;
  next_oil_change_mileage: number;
  status: 'operationnel' | 'en_maintenance' | 'immobilise' | 'reforme';
  photo_path?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Computed alert flags
  insurance_status?: 'valide' | 'warning_30j' | 'urgent_15j' | 'expire';
  insurance_days_left?: number | null;
  tech_visit_status?: 'a_jour' | 'urgent_15j' | 'expire';
  tech_visit_days_left?: number | null;
  oil_change_status?: 'ok' | 'proche' | 'depasse';
  mileage_to_oil_change?: number;
};

export type GeneratorRow = {
  id: string;
  name_code: string;
  brand_model: string;
  power_kva: number;
  location: string;
  assigned_manager_id?: string | null;
  assigned_manager_name?: string | null;
  running_hours: number;
  last_oil_change_date?: string | null;
  last_oil_change_hours: number;
  oil_change_interval_hours: number;
  next_oil_change_hours: number;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  status: 'en_fonction' | 'en_veille' | 'en_maintenance' | 'hors_service';
  fuel_level_pct: number;
  photo_path?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Computed alert flags
  oil_change_status?: 'ok' | 'proche' | 'depasse';
  hours_to_oil_change?: number;
};

function computeVehicleAlerts(v: VehicleRow): VehicleRow {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Assurances
  if (v.insurance_end_date) {
    const end = new Date(v.insurance_end_date);
    const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    v.insurance_days_left = diffDays;
    if (diffDays < 0) {
      v.insurance_status = 'expire';
    } else if (diffDays <= 15) {
      v.insurance_status = 'urgent_15j';
    } else if (diffDays <= 30) {
      v.insurance_status = 'warning_30j';
    } else {
      v.insurance_status = 'valide';
    }
  } else {
    v.insurance_status = 'warning_30j';
    v.insurance_days_left = null;
  }

  // 2. Visite Technique
  if (v.technical_visit_due_date) {
    const due = new Date(v.technical_visit_due_date);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    v.tech_visit_days_left = diffDays;
    if (diffDays < 0) {
      v.tech_visit_status = 'expire';
    } else if (diffDays <= 15) {
      v.tech_visit_status = 'urgent_15j';
    } else {
      v.tech_visit_status = 'a_jour';
    }
  } else {
    v.tech_visit_status = 'a_jour';
    v.tech_visit_days_left = null;
  }

  // 3. Vidange
  const remainingKm = v.next_oil_change_mileage - v.current_mileage;
  v.mileage_to_oil_change = remainingKm;
  if (v.next_oil_change_mileage > 0) {
    if (remainingKm <= 0) {
      v.oil_change_status = 'depasse';
    } else if (remainingKm <= 1000) {
      v.oil_change_status = 'proche';
    } else {
      v.oil_change_status = 'ok';
    }
  } else {
    v.oil_change_status = 'ok';
  }

  return v;
}

function computeGeneratorAlerts(g: GeneratorRow): GeneratorRow {
  // PostgreSQL renvoie les colonnes NUMERIC sous forme de chaînes. Le client
  // réutilise ces valeurs dans le formulaire PATCH : normaliser ici garantit
  // un contrat JSON numérique stable pour la création et les modifications.
  g.power_kva = Number(g.power_kva) || 0;
  g.running_hours = Number(g.running_hours) || 0;
  g.last_oil_change_hours = Number(g.last_oil_change_hours) || 0;
  g.oil_change_interval_hours = Number(g.oil_change_interval_hours) || 0;
  g.next_oil_change_hours = Number(g.next_oil_change_hours) || 0;
  g.fuel_level_pct = Number(g.fuel_level_pct) || 0;
  const remainingHours = Number(g.next_oil_change_hours) - Number(g.running_hours);
  g.hours_to_oil_change = remainingHours;
  if (remainingHours <= 0) {
    g.oil_change_status = 'depasse';
  } else if (remainingHours <= 40) {
    g.oil_change_status = 'proche';
  } else {
    g.oil_change_status = 'ok';
  }
  return g;
}

// -------------------------------------------------------------------------
// Initial Seed Helper
// -------------------------------------------------------------------------
async function ensureFleetBootstrap() {
  const db = getDb();
  const bootstrapName = '018_fleet_bootstrap_once';
  const bootstrap = await db.one<{ name: string }>(
    'SELECT name FROM _migrations WHERE name = $1',
    [bootstrapName],
  );
  if (bootstrap) return;

  const existingVehicles = await db.query<{ count: string }>('SELECT count(*)::text as count FROM vehicles');
  if (Number(existingVehicles[0]?.count ?? 0) === 0) {
    // Insérer les véhicules initiaux de la flotte CFTM
    await db.query(`
      INSERT INTO vehicles (
        id, registration_number, brand_model, vehicle_type, assigned_role,
        assigned_worker_name, insurance_company, insurance_policy_number,
        insurance_start_date, insurance_end_date, technical_visit_last_date,
        technical_visit_due_date, current_mileage, last_oil_change_date,
        last_oil_change_mileage, next_oil_change_mileage, status, notes
      ) VALUES
      (
        'veh-01', 'LT 842 BJ', 'Hyundai H100 Plateau Bois', 'camionnette', 'responsable_livraisons',
        'Responsable des Livraisons & Chantiers', 'Chanas Assurances', 'POL-2026-H100-842',
        '2026-01-10', '2026-12-31', '2026-01-15',
        '2026-07-15', 68400, '2026-02-10',
        65000, 70000, 'operationnel', 'Camionnette dédiée au transport des ouvrages finis et pose sur chantiers.'
      ),
      (
        'veh-02', 'CE 519 AB', 'Toyota Hilux Double Cabine 4x4', 'pickup', 'responsable_livraisons',
        'Responsable des Livraisons', 'Activa Assurances', 'POL-2026-HIL-519',
        '2026-02-01', '2026-11-20', '2025-11-10',
        '2026-11-10', 114250, '2026-01-05',
        110000, 115000, 'operationnel', 'Véhicule de liaison, transport d''équipe de montage et outillage lourd.'
      ),
      (
        'veh-03', 'CE 204 MC', 'Yamaha YBR 125', 'moto_coursier', 'coursier',
        'Coursier Général CFTM', 'Saar Assurances', 'POL-2026-MOT-204',
        '2026-03-01', '2027-02-28', '2026-03-01',
        '2027-03-01', 19800, '2026-03-15',
        18000, 21000, 'operationnel', 'Moto de liaison rapide pour démarches administratives, quincaillerie urgente et courriers.'
      )
      ON CONFLICT (registration_number) DO NOTHING;
    `);
  }

  const existingGenerators = await db.query<{ count: string }>('SELECT count(*)::text as count FROM generators');
  if (Number(existingGenerators[0]?.count ?? 0) === 0) {
    await db.query(`
      INSERT INTO generators (
        id, name_code, brand_model, power_kva, location,
        assigned_manager_name, running_hours, last_oil_change_date,
        last_oil_change_hours, oil_change_interval_hours, next_oil_change_hours,
        status, fuel_level_pct, notes
      ) VALUES
      (
        'gen-01', 'GE-01 Principal', 'Cummins PowerCommand 110 kVA', 110, 'Local Technique Central Mont Fébé',
        'M. Aristide (Maintenance)', 1465, '2026-01-20',
        1250, 250, 1500,
        'en_fonction', 85, 'Alimentation générale sécurisée pour tout le Monastère et machines triphasées.'
      ),
      (
        'gen-02', 'GE-02 Menuiserie', 'Perkins Soundproof 60 kVA', 60, 'Atelier Central CFTM',
        'M. Aristide (Maintenance)', 880, '2026-02-15',
        750, 250, 1000,
        'en_fonction', 70, 'Groupe dédié à l''aspiration centralisée et machines lourdes de menuiserie.'
      ),
      (
        'gen-03', 'GE-03 Chantier', 'SDMO Portable 15 kVA', 15, 'Dépôt Matériel & Chantiers',
        'Responsable des Livraisons', 325, '2026-03-10',
        250, 100, 350,
        'en_veille', 90, 'Groupe mobile transportable pour chantiers sans raccordement Enéo direct.'
      )
      ON CONFLICT (name_code) DO NOTHING;
    `);
  }

  // Le bootstrap ne doit s'exécuter qu'une fois : vider volontairement la
  // flotte ne doit jamais réinsérer ces exemples au prochain chargement.
  await db.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [bootstrapName]);
}

// -------------------------------------------------------------------------
// 1. Vue Synthèse & Compteurs d'alertes
// -------------------------------------------------------------------------
fleetRoutes.get('/summary', requireAuth, requirePerm('tools.view'), async (c) => {
  await ensureFleetBootstrap();
  const db = getDb();

  const vehiclesRaw = await db.query<VehicleRow>(`
    SELECT id, registration_number, brand_model, vehicle_type, assigned_role,
           assigned_worker_id, assigned_worker_name, insurance_company,
           insurance_policy_number, insurance_start_date::text AS insurance_start_date,
           insurance_end_date::text AS insurance_end_date,
           technical_visit_last_date::text AS technical_visit_last_date,
           technical_visit_due_date::text AS technical_visit_due_date,
           current_mileage, last_oil_change_date::text AS last_oil_change_date,
           last_oil_change_mileage, next_oil_change_mileage, status, photo_path, notes,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM vehicles ORDER BY registration_number ASC
  `);

  const generatorsRaw = await db.query<GeneratorRow>(`
    SELECT id, name_code, brand_model, power_kva, location,
           assigned_manager_id, assigned_manager_name, running_hours,
           last_oil_change_date::text AS last_oil_change_date,
           last_oil_change_hours, oil_change_interval_hours, next_oil_change_hours,
           last_maintenance_date::text AS last_maintenance_date,
           next_maintenance_date::text AS next_maintenance_date,
           status, fuel_level_pct, photo_path, notes,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM generators ORDER BY name_code ASC
  `);

  const vehicles = vehiclesRaw.map(computeVehicleAlerts);
  const generators = generatorsRaw.map(computeGeneratorAlerts);

  // Calcul des alertes globales
  const insuranceUrgentCount = vehicles.filter((v) => v.insurance_status === 'urgent_15j' || v.insurance_status === 'expire').length;
  const techVisitUrgentCount = vehicles.filter((v) => v.tech_visit_status === 'urgent_15j' || v.tech_visit_status === 'expire').length;
  const oilChangeUrgentCount = vehicles.filter((v) => v.oil_change_status === 'depasse' || v.oil_change_status === 'proche').length;
  const generatorOilUrgentCount = generators.filter((g) => g.oil_change_status === 'depasse' || g.oil_change_status === 'proche').length;

  return c.json({
    vehicles_count: vehicles.length,
    generators_count: generators.length,
    alerts: {
      insurance_urgent: insuranceUrgentCount,
      tech_visit_urgent: techVisitUrgentCount,
      oil_change_urgent: oilChangeUrgentCount,
      generator_oil_urgent: generatorOilUrgentCount,
      total_urgent: insuranceUrgentCount + techVisitUrgentCount + oilChangeUrgentCount + generatorOilUrgentCount,
    },
    vehicles,
    generators,
  });
});

// -------------------------------------------------------------------------
// 2. Véhicules CRUD
// -------------------------------------------------------------------------
const vehicleBody = z.object({
  registration_number: z.string().min(2, "Numéro d'immatriculation requis"),
  brand_model: z.string().min(2, 'Marque et modèle requis'),
  vehicle_type: z.enum(['camionnette', 'pickup', 'camion', 'moto_coursier', 'voiture_liaison']).default('camionnette'),
  assigned_role: z.enum(['coursier', 'responsable_livraisons', 'direction', 'chauffeur', 'autre']).default('responsable_livraisons'),
  assigned_worker_id: z.string().nullable().optional(),
  assigned_worker_name: z.string().nullable().optional(),
  insurance_company: z.string().nullable().optional(),
  insurance_policy_number: z.string().nullable().optional(),
  insurance_start_date: z.string().nullable().optional(),
  insurance_end_date: z.string().nullable().optional(),
  technical_visit_last_date: z.string().nullable().optional(),
  technical_visit_due_date: z.string().nullable().optional(),
  current_mileage: z.number().int().min(0).default(0),
  last_oil_change_date: z.string().nullable().optional(),
  last_oil_change_mileage: z.number().int().min(0).default(0),
  next_oil_change_mileage: z.number().int().min(0).default(0),
  status: z.enum(['operationnel', 'en_maintenance', 'immobilise', 'reforme']).default('operationnel'),
  photo_path: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

fleetRoutes.get('/vehicles', requireAuth, requirePerm('tools.view'), async (c) => {
  await ensureFleetBootstrap();
  const db = getDb();
  const rows = await db.query<VehicleRow>(`
    SELECT id, registration_number, brand_model, vehicle_type, assigned_role,
           assigned_worker_id, assigned_worker_name, insurance_company,
           insurance_policy_number, insurance_start_date::text AS insurance_start_date,
           insurance_end_date::text AS insurance_end_date,
           technical_visit_last_date::text AS technical_visit_last_date,
           technical_visit_due_date::text AS technical_visit_due_date,
           current_mileage, last_oil_change_date::text AS last_oil_change_date,
           last_oil_change_mileage, next_oil_change_mileage, status, photo_path, notes,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM vehicles ORDER BY registration_number ASC
  `);
  return c.json({ vehicles: rows.map(computeVehicleAlerts) });
});

fleetRoutes.post('/vehicles', requireAuth, requirePerm('tools.create'), async (c) => {
  const body = vehicleBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données de véhicule invalides.' }, 400);
  }
  const db = getDb();
  const id = `veh-${Date.now()}`;
  const data = body.data;

  // Calcul automatique du prochain kilométrage de vidange si non spécifié (par défaut + 5000 km)
  const nextOil = data.next_oil_change_mileage > 0 ? data.next_oil_change_mileage : data.current_mileage + 5000;

  const row = await db.one<VehicleRow>(`
    INSERT INTO vehicles (
      id, registration_number, brand_model, vehicle_type, assigned_role,
      assigned_worker_id, assigned_worker_name, insurance_company, insurance_policy_number,
      insurance_start_date, insurance_end_date, technical_visit_last_date, technical_visit_due_date,
      current_mileage, last_oil_change_date, last_oil_change_mileage, next_oil_change_mileage,
      status, photo_path, notes
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, $20
    )
    RETURNING id, registration_number, brand_model, vehicle_type, assigned_role,
              assigned_worker_id, assigned_worker_name, insurance_company, insurance_policy_number,
              insurance_start_date::text AS insurance_start_date, insurance_end_date::text AS insurance_end_date,
              technical_visit_last_date::text AS technical_visit_last_date, technical_visit_due_date::text AS technical_visit_due_date,
              current_mileage, last_oil_change_date::text AS last_oil_change_date, last_oil_change_mileage, next_oil_change_mileage,
              status, photo_path, notes, created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    id, data.registration_number.trim().toUpperCase(), data.brand_model.trim(), data.vehicle_type, data.assigned_role,
    data.assigned_worker_id || null, data.assigned_worker_name || null, data.insurance_company || null, data.insurance_policy_number || null,
    data.insurance_start_date || null, data.insurance_end_date || null, data.technical_visit_last_date || null, data.technical_visit_due_date || null,
    data.current_mileage, data.last_oil_change_date || null, data.last_oil_change_mileage, nextOil,
    data.status, data.photo_path || null, data.notes || null,
  ]);

  await writeAudit(db, {
    entity: 'vehicle',
    entityId: id,
    action: 'create',
    after: row,
    actorId: actorId(c),
    actorName: actorName(c) || 'Utilisateur',
    reason: `Ajout véhicule ${data.brand_model} (${data.registration_number})`,
  });

  return c.json({ vehicle: computeVehicleAlerts(row!) }, 201);
});

fleetRoutes.patch('/vehicles/:id', requireAuth, requirePerm('tools.edit'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const body = vehicleBody.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données invalides.' }, 400);
  }
  const db = getDb();
  const existing = await db.one<VehicleRow>('SELECT * FROM vehicles WHERE id = $1', [id]);
  if (!existing) return c.json({ error: 'Véhicule introuvable.' }, 404);

  const d = body.data;
  const row = await db.one<VehicleRow>(`
    UPDATE vehicles SET
      registration_number = COALESCE($2, registration_number),
      brand_model = COALESCE($3, brand_model),
      vehicle_type = COALESCE($4, vehicle_type),
      assigned_role = COALESCE($5, assigned_role),
      assigned_worker_id = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE assigned_worker_id END,
      assigned_worker_name = CASE WHEN $7::text IS NOT NULL THEN $7 ELSE assigned_worker_name END,
      insurance_company = CASE WHEN $8::text IS NOT NULL THEN $8 ELSE insurance_company END,
      insurance_policy_number = CASE WHEN $9::text IS NOT NULL THEN $9 ELSE insurance_policy_number END,
      insurance_start_date = CASE WHEN $10::date IS NOT NULL THEN $10::date ELSE insurance_start_date END,
      insurance_end_date = CASE WHEN $11::date IS NOT NULL THEN $11::date ELSE insurance_end_date END,
      technical_visit_last_date = CASE WHEN $12::date IS NOT NULL THEN $12::date ELSE technical_visit_last_date END,
      technical_visit_due_date = CASE WHEN $13::date IS NOT NULL THEN $13::date ELSE technical_visit_due_date END,
      current_mileage = COALESCE($14, current_mileage),
      last_oil_change_date = CASE WHEN $15::date IS NOT NULL THEN $15::date ELSE last_oil_change_date END,
      last_oil_change_mileage = COALESCE($16, last_oil_change_mileage),
      next_oil_change_mileage = COALESCE($17, next_oil_change_mileage),
      status = COALESCE($18, status),
      photo_path = CASE WHEN $19::text IS NOT NULL THEN $19 ELSE photo_path END,
      notes = CASE WHEN $20::text IS NOT NULL THEN $20 ELSE notes END,
      updated_at = now()
    WHERE id = $1
    RETURNING id, registration_number, brand_model, vehicle_type, assigned_role,
              assigned_worker_id, assigned_worker_name, insurance_company, insurance_policy_number,
              insurance_start_date::text AS insurance_start_date, insurance_end_date::text AS insurance_end_date,
              technical_visit_last_date::text AS technical_visit_last_date, technical_visit_due_date::text AS technical_visit_due_date,
              current_mileage, last_oil_change_date::text AS last_oil_change_date, last_oil_change_mileage, next_oil_change_mileage,
              status, photo_path, notes, created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    id,
    d.registration_number ? d.registration_number.trim().toUpperCase() : null,
    d.brand_model?.trim() || null,
    d.vehicle_type || null,
    d.assigned_role || null,
    d.assigned_worker_id,
    d.assigned_worker_name,
    d.insurance_company,
    d.insurance_policy_number,
    d.insurance_start_date,
    d.insurance_end_date,
    d.technical_visit_last_date,
    d.technical_visit_due_date,
    d.current_mileage,
    d.last_oil_change_date,
    d.last_oil_change_mileage,
    d.next_oil_change_mileage,
    d.status || null,
    d.photo_path,
    d.notes,
  ]);

  await writeAudit(db, {
    entity: 'vehicle',
    entityId: id,
    action: 'update',
    before: existing,
    after: row,
    actorId: actorId(c),
    actorName: actorName(c) || 'Utilisateur',
    reason: `Mise à jour véhicule ${row?.brand_model}`,
  });

  return c.json({ vehicle: computeVehicleAlerts(row!) });
});

fleetRoutes.delete('/vehicles/:id', requireAuth, requirePerm('tools.delete'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const db = getDb();
  const existing = await db.one<VehicleRow>('SELECT * FROM vehicles WHERE id = $1', [id]);
  if (!existing) return c.json({ error: 'Véhicule introuvable.' }, 404);

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM vehicles WHERE id = $1', [id]);
    await writeAudit(tx, {
      entity: 'vehicle',
      entityId: id,
      action: 'delete',
      before: existing,
      actorId: actorId(c),
      actorName: actorName(c) || 'Utilisateur',
      reason: `Suppression véhicule ${existing.brand_model} (${existing.registration_number})`,
    });
  });

  return c.json({ ok: true });
});

// -------------------------------------------------------------------------
// 3. Groupes Électrogènes CRUD
// -------------------------------------------------------------------------
function numberInput(min: number, max?: number) {
  const schema = max === undefined ? z.number().min(min) : z.number().min(min).max(max);
  return z.preprocess(
    (value) => typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
    schema,
  );
}

const generatorBody = z.object({
  name_code: z.string().min(2, 'Nom ou code du groupe requis'),
  brand_model: z.string().min(2, 'Marque et modèle requis'),
  power_kva: numberInput(0).default(0),
  location: z.string().default('Monastère Central'),
  assigned_manager_id: z.string().nullable().optional(),
  assigned_manager_name: z.string().nullable().optional(),
  running_hours: numberInput(0).default(0),
  last_oil_change_date: z.string().nullable().optional(),
  last_oil_change_hours: numberInput(0).default(0),
  oil_change_interval_hours: numberInput(10).default(250),
  next_oil_change_hours: numberInput(0).default(250),
  last_maintenance_date: z.string().nullable().optional(),
  next_maintenance_date: z.string().nullable().optional(),
  status: z.enum(['en_fonction', 'en_veille', 'en_maintenance', 'hors_service']).default('en_fonction'),
  fuel_level_pct: numberInput(0, 100).default(100),
  photo_path: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const generatorPatchBody = generatorBody.partial().extend({
  // Permet de préserver une ancienne valeur hors plage (ex. 1000 %) si elle
  // n'est pas modifiée, sans accepter d'enregistrer une nouvelle valeur invalide.
  fuel_level_pct: numberInput(0).optional(),
});

fleetRoutes.get('/generators', requireAuth, requirePerm('tools.view'), async (c) => {
  await ensureFleetBootstrap();
  const db = getDb();
  const rows = await db.query<GeneratorRow>(`
    SELECT id, name_code, brand_model, power_kva, location,
           assigned_manager_id, assigned_manager_name, running_hours,
           last_oil_change_date::text AS last_oil_change_date,
           last_oil_change_hours, oil_change_interval_hours, next_oil_change_hours,
           last_maintenance_date::text AS last_maintenance_date,
           next_maintenance_date::text AS next_maintenance_date,
           status, fuel_level_pct, photo_path, notes,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM generators ORDER BY name_code ASC
  `);
  return c.json({ generators: rows.map(computeGeneratorAlerts) });
});

fleetRoutes.post('/generators', requireAuth, requirePerm('tools.create'), async (c) => {
  const body = generatorBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données invalides.' }, 400);
  }
  const db = getDb();
  const id = `gen-${Date.now()}`;
  const data = body.data;

  const nextOil = data.next_oil_change_hours > 0 ? data.next_oil_change_hours : data.running_hours + data.oil_change_interval_hours;

  const row = await db.one<GeneratorRow>(`
    INSERT INTO generators (
      id, name_code, brand_model, power_kva, location,
      assigned_manager_id, assigned_manager_name, running_hours,
      last_oil_change_date, last_oil_change_hours, oil_change_interval_hours,
      next_oil_change_hours, last_maintenance_date, next_maintenance_date,
      status, fuel_level_pct, photo_path, notes
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17, $18
    )
    RETURNING id, name_code, brand_model, power_kva, location,
              assigned_manager_id, assigned_manager_name, running_hours,
              last_oil_change_date::text AS last_oil_change_date,
              last_oil_change_hours, oil_change_interval_hours, next_oil_change_hours,
              last_maintenance_date::text AS last_maintenance_date,
              next_maintenance_date::text AS next_maintenance_date,
              status, fuel_level_pct, photo_path, notes,
              created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    id, data.name_code.trim(), data.brand_model.trim(), data.power_kva, data.location.trim(),
    data.assigned_manager_id || null, data.assigned_manager_name || null, data.running_hours,
    data.last_oil_change_date || null, data.last_oil_change_hours, data.oil_change_interval_hours,
    nextOil, data.last_maintenance_date || null, data.next_maintenance_date || null,
    data.status, data.fuel_level_pct, data.photo_path || null, data.notes || null,
  ]);

  await writeAudit(db, {
    entity: 'generator',
    entityId: id,
    action: 'create',
    after: row,
    actorId: actorId(c),
    actorName: actorName(c) || 'Utilisateur',
    reason: `Ajout groupe électrogène ${data.name_code} (${data.power_kva} kVA)`,
  });

  return c.json({ generator: computeGeneratorAlerts(row!) }, 201);
});

fleetRoutes.patch('/generators/:id', requireAuth, requirePerm('tools.edit'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const body = generatorPatchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données invalides.' }, 400);
  }
  const db = getDb();
  const existing = await db.one<GeneratorRow>('SELECT * FROM generators WHERE id = $1', [id]);
  if (!existing) return c.json({ error: 'Groupe électrogène introuvable.' }, 404);

  const d = body.data;
  if (d.fuel_level_pct !== undefined && d.fuel_level_pct > 100) {
    if (d.fuel_level_pct === Number(existing.fuel_level_pct)) {
      d.fuel_level_pct = undefined;
    } else {
      return c.json({ error: 'Le niveau de carburant doit être compris entre 0 et 100 %.' }, 400);
    }
  }
  const row = await db.one<GeneratorRow>(`
    UPDATE generators SET
      name_code = COALESCE($2, name_code),
      brand_model = COALESCE($3, brand_model),
      power_kva = COALESCE($4, power_kva),
      location = COALESCE($5, location),
      assigned_manager_id = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE assigned_manager_id END,
      assigned_manager_name = CASE WHEN $7::text IS NOT NULL THEN $7 ELSE assigned_manager_name END,
      running_hours = COALESCE($8, running_hours),
      last_oil_change_date = CASE WHEN $9::date IS NOT NULL THEN $9::date ELSE last_oil_change_date END,
      last_oil_change_hours = COALESCE($10, last_oil_change_hours),
      oil_change_interval_hours = COALESCE($11, oil_change_interval_hours),
      next_oil_change_hours = COALESCE($12, next_oil_change_hours),
      last_maintenance_date = CASE WHEN $13::date IS NOT NULL THEN $13::date ELSE last_maintenance_date END,
      next_maintenance_date = CASE WHEN $14::date IS NOT NULL THEN $14::date ELSE next_maintenance_date END,
      status = COALESCE($15, status),
      fuel_level_pct = COALESCE($16, fuel_level_pct),
      photo_path = CASE WHEN $17::text IS NOT NULL THEN $17 ELSE photo_path END,
      notes = CASE WHEN $18::text IS NOT NULL THEN $18 ELSE notes END,
      updated_at = now()
    WHERE id = $1
    RETURNING id, name_code, brand_model, power_kva, location,
              assigned_manager_id, assigned_manager_name, running_hours,
              last_oil_change_date::text AS last_oil_change_date,
              last_oil_change_hours, oil_change_interval_hours, next_oil_change_hours,
              last_maintenance_date::text AS last_maintenance_date,
              next_maintenance_date::text AS next_maintenance_date,
              status, fuel_level_pct, photo_path, notes,
              created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    id,
    d.name_code?.trim() || null,
    d.brand_model?.trim() || null,
    d.power_kva,
    d.location?.trim() || null,
    d.assigned_manager_id,
    d.assigned_manager_name,
    d.running_hours,
    d.last_oil_change_date,
    d.last_oil_change_hours,
    d.oil_change_interval_hours,
    d.next_oil_change_hours,
    d.last_maintenance_date,
    d.next_maintenance_date,
    d.status || null,
    d.fuel_level_pct,
    d.photo_path,
    d.notes,
  ]);

  await writeAudit(db, {
    entity: 'generator',
    entityId: id,
    action: 'update',
    before: existing,
    after: row,
    actorId: actorId(c),
    actorName: actorName(c) || 'Utilisateur',
    reason: `Mise à jour groupe ${row?.name_code}`,
  });

  return c.json({ generator: computeGeneratorAlerts(row!) });
});

fleetRoutes.delete('/generators/:id', requireAuth, requirePerm('tools.delete'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const db = getDb();
  const existing = await db.one<GeneratorRow>('SELECT * FROM generators WHERE id = $1', [id]);
  if (!existing) return c.json({ error: 'Groupe électrogène introuvable.' }, 404);

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM generators WHERE id = $1', [id]);
    await writeAudit(tx, {
      entity: 'generator',
      entityId: id,
      action: 'delete',
      before: existing,
      actorId: actorId(c),
      actorName: actorName(c) || 'Utilisateur',
      reason: `Suppression groupe électrogène ${existing.name_code}`,
    });
  });

  return c.json({ ok: true });
});
