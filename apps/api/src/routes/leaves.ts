import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { generateCameroonLegalHolidays, type CameroonHoliday } from '../lib/cameroon-holidays.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

const LEAVE_KINDS = ['conge', 'permission', 'absence'] as const;
const LEAVE_STATUS = ['pending', 'approved', 'rejected'] as const;

const listQuery = z.object({
  employee_id: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const createBody = z.object({
  employee_id: z.string().min(1, 'Veuillez sélectionner un travailleur.'),
  kind: z.enum(LEAVE_KINDS, { message: 'Type de congé/permission invalide.' }),
  from_date: z.string().min(1, 'Date de début requise.'),
  to_date: z.string().min(1, 'Date de fin requise.'),
  note: z.string().nullish(),
  status: z.enum(['pending', 'approved']).optional(),
}).refine((data) => data.from_date <= data.to_date, {
  message: 'La date de début doit être antérieure ou égale à la date de fin.',
  path: ['to_date'],
});

const updateBody = z.object({
  kind: z.enum(LEAVE_KINDS).optional(),
  from_date: z.string().min(1).optional(),
  to_date: z.string().min(1).optional(),
  note: z.string().nullable().optional(),
  status: z.enum(LEAVE_STATUS).optional(),
});

const workerPermissionBody = z.object({
  from_date: z.string().min(1),
  to_date: z.string().min(1),
  note: z.string().min(3, 'Veuillez préciser le motif de votre permission exceptionnelle.'),
  employee_id: z.string().optional(),
});

const reviewBody = z.object({
  status: z.enum(['approved', 'rejected']),
  review_note: z.string().optional(),
});

const decreeBody = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date requis: AAAA-MM-JJ'),
  name: z.string().min(3, 'Intitulé du jour férié ou motif requis.'),
  decree_ref: z.string().optional(),
  kind: z.enum(['religious', 'presidential_decree', 'legal_national']).default('presidential_decree'),
});

export type LeaveRow = {
  id: number;
  employee_id: string;
  full_name?: string;
  job_title?: string;
  photo_path?: string | null;
  kind: string;
  from_date: string;
  to_date: string;
  note: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  actor: string;
  created_at: string;
};

export const leavesRoutes = new Hono();

leavesRoutes.use('*', requireAuth);

// 1. Liste des congés & permissions
leavesRoutes.get('/', requirePerm('leaves.view'), async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Filtres invalides.' }, 400);
  const { employee_id, status, kind, from, to } = parsed.data;
  const where: string[] = [];
  const params: unknown[] = [];
  if (employee_id && employee_id !== 'all') { params.push(employee_id); where.push(`ab.employee_id = $${params.length}`); }
  if (status && status !== 'all') { params.push(status); where.push(`ab.status = $${params.length}`); }
  if (kind && kind !== 'all') { params.push(kind); where.push(`ab.kind = $${params.length}`); }
  if (from) { params.push(from); where.push(`ab.to_date >= $${params.length}`); }
  if (to) { params.push(to); where.push(`ab.from_date <= $${params.length}`); }
  const sql = `SELECT ab.id, ab.employee_id, ab.kind, ab.from_date::text AS from_date, ab.to_date::text AS to_date,
                      ab.note, ab.status, ab.reviewed_by, ab.reviewed_at, ab.review_note, ab.actor, ab.created_at,
                      e.full_name, coalesce(r.name, e.job_title) as job_title, e.photo_path
                 FROM absences ab
                 JOIN employees e ON e.id = ab.employee_id
                 LEFT JOIN users u ON u.employee_id = e.id
                 LEFT JOIN roles r ON r.id = u.role
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY ab.created_at DESC
               LIMIT 300`;
  const leaves = await getDb().query<LeaveRow>(sql, params);
  return c.json({ leaves });
});

// 2. Mes congés (Travailleur connecté)
leavesRoutes.get('/mine', requireAuth, async (c) => {
  const auth = c.get('auth');
  const employeeId = auth?.user?.employee_id;
  if (!employeeId) return c.json({ leaves: [] });
  const leaves = await getDb().query<LeaveRow>(
    `SELECT ab.id, ab.employee_id, ab.kind, ab.from_date::text AS from_date, ab.to_date::text AS to_date,
            ab.note, ab.status, ab.reviewed_by, ab.reviewed_at, ab.review_note, ab.actor, ab.created_at
       FROM absences ab
      WHERE ab.employee_id = $1
      ORDER BY ab.created_at DESC
      LIMIT 50`,
    [employeeId],
  );
  return c.json({ leaves });
});

// 3. Fêtes Légales Camerounaises & Décrets Présidentiels
leavesRoutes.get('/holidays', requireAuth, async (c) => {
  const queryYear = Number(c.req.query('year')) || new Date().getFullYear();
  const db = getDb();

  // Fêtes nationales calculées (Loi 73/5)
  const officialHolidays = generateCameroonLegalHolidays(queryYear);

  // Décrets présidentiels et compléments en base de données
  const dbHolidays = await db.query<CameroonHoliday>(
    `SELECT id, holiday_date::text AS holiday_date, name, kind, decree_ref, is_chome
       FROM holidays
      WHERE holiday_date >= $1 AND holiday_date <= $2
      ORDER BY holiday_date ASC`,
    [`${queryYear}-01-01`, `${queryYear}-12-31`],
  ).catch(() => []);

  // Fusionner en évitant les doublons de date (le décret DB prévaut)
  const map = new Map<string, CameroonHoliday>();
  for (const h of officialHolidays) {
    map.set(h.holiday_date, h);
  }
  for (const h of dbHolidays) {
    map.set(h.holiday_date, h);
  }

  const holidays = Array.from(map.values()).sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  return c.json({ holidays });
});

// 4. Déclaration d'un Férié Exceptionnel par Décret Présidentiel (Admin / Ayant droit)
leavesRoutes.post('/holidays/decree', requirePerm('leaves.manage'), async (c) => {
  const body = decreeBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données de décret invalides.' }, 400);
  }
  const db = getDb();
  const id = `decree-${body.data.holiday_date}-${Date.now()}`;
  const selectedKind = body.data.kind || 'presidential_decree';
  const defaultRef =
    selectedKind === 'religious'
      ? 'Solennité ou fête religieuse'
      : selectedKind === 'legal_national'
      ? 'Fête officielle d’État'
      : 'Décret du Président de la République';
  const ref = body.data.decree_ref?.trim() || defaultRef;

  const row = await db.one<CameroonHoliday>(
    `INSERT INTO holidays (id, holiday_date, name, kind, decree_ref, is_chome, created_by)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     ON CONFLICT (holiday_date) DO UPDATE
     SET name = EXCLUDED.name,
         decree_ref = EXCLUDED.decree_ref,
         kind = EXCLUDED.kind
     RETURNING id, holiday_date::text AS holiday_date, name, kind, decree_ref, is_chome`,
    [
      id,
      body.data.holiday_date,
      body.data.name.trim(),
      selectedKind,
      ref,
      actorName(c),
    ],
  );

  await writeAudit(db, {
    entity: 'holiday',
    entityId: row?.id ?? id,
    action: 'create',
    after: row,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: `Déclaration jour férié / fête (${selectedKind}) : ${body.data.name}`,
  });

  return c.json({ holiday: row }, 201);
});

// 5. Suppression d'un Décret Présidentiel enregistré
leavesRoutes.delete('/holidays/:id', requirePerm('leaves.manage'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Identifiant requis.' }, 400);
  const db = getDb();
  const before = await db.one<CameroonHoliday>('SELECT * FROM holidays WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Jour férié introuvable.' }, 404);
  await db.query('DELETE FROM holidays WHERE id = $1', [id]);
  await writeAudit(db, {
    entity: 'holiday',
    entityId: id,
    action: 'delete',
    before,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ ok: true });
});

// 6. Demande de Permission Exceptionnelle par le Travailleur
// (Les travailleurs ne peuvent demander qu'une permission exceptionnelle, pas de congé payé)
leavesRoutes.post('/request-permission', async (c) => {
  const auth = c.get('auth');
  const body = workerPermissionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message || 'Données invalides.' }, 400);
  }

  // Identifiant travailleur lié au compte
  const targetEmployeeId = auth?.user?.employee_id || body.data.employee_id;
  if (!targetEmployeeId) {
    return c.json({ error: 'Votre compte n’est associé à aucune fiche de travailleur.' }, 403);
  }

  const db = getDb();
  const emp = await db.one<{ id: string; full_name: string }>('SELECT id, full_name FROM employees WHERE id = $1', [targetEmployeeId]);
  if (!emp) return c.json({ error: 'Fiche travailleur introuvable.' }, 404);

  const leave = await db.one<LeaveRow>(
    `INSERT INTO absences (employee_id, kind, from_date, to_date, note, actor, status)
     VALUES ($1, 'permission', $2, $3, $4, $5, 'pending') RETURNING *`,
    [
      emp.id,
      body.data.from_date,
      body.data.to_date,
      body.data.note.trim(),
      actorName(c),
    ],
  );

  await writeAudit(db, {
    entity: 'absence',
    entityId: String(leave?.id ?? ''),
    action: 'request_permission',
    after: leave,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: body.data.note.trim(),
  });

  return c.json({ leave }, 201);
});

// 7. Allocation d'un Congé ou Octroi de Permission par la Direction / Superviseur Privilégié
leavesRoutes.post('/', requirePerm('leaves.manage'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message || 'Données de congé invalides.' }, 400);
  const db = getDb();
  const emp = await db.one('SELECT id FROM employees WHERE id = $1', [body.data.employee_id]);
  if (!emp) return c.json({ error: 'Travailleur introuvable.' }, 404);

  // Par défaut, quand l'admin / ayant droit pose un congé ou accorde une permission, il est directement approuvé
  const initialStatus = body.data.status || 'approved';

  const leave = await db.one<LeaveRow>(
    `INSERT INTO absences (employee_id, kind, from_date, to_date, note, actor, status, reviewed_by, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      body.data.employee_id,
      body.data.kind,
      body.data.from_date,
      body.data.to_date,
      body.data.note?.trim() || null,
      actorName(c),
      initialStatus,
      initialStatus === 'approved' ? actorName(c) : null,
      initialStatus === 'approved' ? new Date().toISOString() : null,
    ],
  );

  await writeAudit(db, {
    entity: 'absence',
    entityId: String(leave?.id ?? ''),
    action: 'create',
    after: leave,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: initialStatus === 'approved' ? 'Alloué directement par la Direction' : null,
  });

  return c.json({ leave }, 201);
});

// 8. Traitement (Approbation / Rejet) d'une Demande en attente
leavesRoutes.patch('/:id/review', requirePerm('leaves.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Demande invalide.' }, 400);
  const body = reviewBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Statut invalide.' }, 400);
  const db = getDb();
  const before = await db.one<LeaveRow>('SELECT * FROM absences WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Demande introuvable.' }, 404);
  if (before.status !== 'pending') return c.json({ error: 'Cette demande a déjà été traitée.' }, 409);

  const updated = await db.one<LeaveRow>(
    `UPDATE absences SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
      WHERE id = $1 RETURNING *`,
    [id, body.data.status, actorName(c), body.data.review_note?.trim() || null],
  );

  await writeAudit(db, {
    entity: 'absence',
    entityId: String(id),
    action: body.data.status === 'approved' ? 'approve' : 'reject',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: body.data.review_note?.trim() || null,
  });

  return c.json({ leave: updated });
});

// 9. Révocation ou Suppression d'un Congé / Permission par l'Admin
leavesRoutes.delete('/:id', requirePerm('leaves.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Demande invalide.' }, 400);
  const db = getDb();
  const before = await db.one<LeaveRow>('SELECT * FROM absences WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Demande introuvable.' }, 404);

  await db.query('DELETE FROM absences WHERE id = $1', [id]);
  await writeAudit(db, {
    entity: 'absence',
    entityId: String(id),
    action: 'delete',
    before,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: 'Révocation par la Direction',
  });

  return c.json({ ok: true });
});

// 10. Modification d'un Congé / Permission par l'Admin (Droit à l'erreur / Rectification)
leavesRoutes.put('/:id', requirePerm('leaves.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Demande invalide.' }, 400);
  const body = updateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de modification invalides.' }, 400);

  const db = getDb();
  const before = await db.one<LeaveRow>('SELECT * FROM absences WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Congé introuvable.' }, 404);

  const updated = await db.one<LeaveRow>(
    `UPDATE absences
        SET kind = coalesce($2, kind),
            from_date = coalesce($3, from_date),
            to_date = coalesce($4, to_date),
            note = $5,
            status = coalesce($6, status)
      WHERE id = $1 RETURNING *`,
    [
      id,
      body.data.kind || null,
      body.data.from_date || null,
      body.data.to_date || null,
      body.data.note !== undefined ? body.data.note : before.note,
      body.data.status || null,
    ],
  );

  await writeAudit(db, {
    entity: 'absence',
    entityId: String(id),
    action: 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: 'Modification administrative par la Direction',
  });

  return c.json({ leave: updated });
});

// 11. Remise à zéro complète des congés de test et décrets exceptionnels
leavesRoutes.post('/purge-test-data', requirePerm('leaves.manage'), async (c) => {
  const db = getDb();
  await db.query('DELETE FROM absences');
  await db.query("DELETE FROM holidays WHERE kind = 'presidential_decree'");
  await writeAudit(db, {
    entity: 'absence',
    entityId: 'all',
    action: 'purge',
    actorId: actorId(c),
    actorName: actorName(c),
    reason: 'Remise à zéro des congés et décrets exceptionnels',
  });
  return c.json({ ok: true });
});
