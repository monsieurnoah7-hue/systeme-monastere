import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Catalog, type MyOverview, type ScanResult } from '../lib/api';
import {
  Button, Card, Chip, EmptyState,
  PageHeader, SegmentedControl, Skeleton, StatCard,
} from '../components/ui';
import { IconAlert, IconBox, IconClock, IconHistory, IconUser, IconWrench } from '../components/Icons';
import { STATUS_LABEL, STATUS_TONE, formatDate } from '../lib/labels';
import type { User } from '../lib/api';

const SITUATION_LABEL: Record<string, string> = {
  present: 'Présent(e)',
  late: 'En retard',
  absent: 'Absent(e)',
  conge: 'En congé',
  permission: 'En permission',
};

export function Espace({ scan, user }: { scan?: ScanResult | null; user?: User | null }) {
  const [overview, setOverview] = useState<MyOverview | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'historique' | 'outils' | 'stock'>('historique');
  const [magasinFilter, setMagasinFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, cat] = await Promise.all([
        api<MyOverview>('/api/me/overview'),
        api<Catalog>('/api/me/catalog').catch(() => null),
      ]);
      setOverview(ov);
      setCatalog(cat);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur de chargement');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, scan]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (error || !overview) {
    return <EmptyState icon={<IconAlert size={28} />} title="Espace indisponible" hint={error ?? undefined} action={<Button onClick={load}>Réessayer</Button>} />;
  }

  const { employee, situation, situationNote, today, history, month, openLoans, leaves } = overview;
  // L'API renvoie punch_date ; le type local utilise date — normaliser
  const historyRows = (history as unknown as Record<string, unknown>[]).map((h) => ({
    date: (h.date as string) ?? (h.punch_date as string) ?? '',
    in_at: (h.in_at as string) ?? null,
    out_at: (h.out_at as string) ?? null,
    break_in: (h.break_in as string) ?? null,
    break_out: (h.break_out as string) ?? null,
    late_minutes: Number(h.late_minutes ?? 0),
    status: (h.status as string) ?? 'absent',
  }));

  if (!employee) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Espace personnel" title={`Bonjour, ${user?.display_name ?? 'utilisateur'}`} hint="Compte de gestion — non rattaché à une fiche travailleur" />
        <EmptyState
          icon={<IconUser size={28} />}
          title="Aucune fiche travailleur rattachée"
          hint="Votre compte de direction n’est pas lié à un salarié. L’espace personnel (historique de présence, outils en prêt) est réservé aux comptes rattachés à une fiche."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Jours ce mois" value={month.daysPresent} icon={<IconClock size={16} />} />
          <StatCard label="Retards" value={month.lateCount} tone={month.lateCount > 0 ? 'amber' : 'neutral'} icon={<IconAlert size={16} />} />
          <StatCard label="Outils en prêt" value={openLoans.length} tone={openLoans.length > 0 ? 'amber' : 'neutral'} icon={<IconWrench size={16} />} />
        </div>
      </div>
    );
  }
  const tools = catalog?.tools.filter((t) => magasinFilter === 'all' || t.magasin_id === magasinFilter) ?? [];
  const refs = catalog?.refs.filter((r) => magasinFilter === 'all' || r.magasin_id === magasinFilter) ?? [];
  const availableTools = tools.filter((t) => t.status === 'disponible');

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Espace personnel" title={`Bonjour, ${employee.full_name.split(' ')[0]}`} hint={employee.job_title} />

      <Card className="bg-gradient-to-br from-charcoal to-charcoal-2 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/50">Ma situation aujourd’hui</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{SITUATION_LABEL[situation] ?? situation}</p>
            {situationNote && <p className="mt-1 text-sm text-white/60">{situationNote}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-white/50">Pointages du jour</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber">
              {today?.in_at ?? '—'} → {today?.out_at ?? '—'}
            </p>
            {today?.break_in && <p className="text-xs text-white/50">Pause : {today.break_in} → {today.break_out ?? '…'}</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Jours ce mois" value={month.daysPresent} icon={<IconClock size={16} />} />
        <StatCard label="Retards" value={month.lateCount} tone={month.lateCount > 0 ? 'amber' : 'neutral'} icon={<IconAlert size={16} />} />
        <StatCard label="Outils en prêt" value={openLoans.length} tone={openLoans.length > 0 ? 'amber' : 'neutral'} icon={<IconWrench size={16} />} />
      </div>

      {openLoans.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-ink">Outils que je détient</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {openLoans.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{l.tool_name}</p>
                  <p className="text-xs text-ink-soft">{l.tool_id} · sorti le {formatDate(l.out_at)}{l.motive ? ` · ${l.motive}` : ''}</p>
                </div>
                <Chip tone="amber">En prêt</Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'historique', label: 'Historique', icon: <IconHistory size={14} /> },
          { value: 'outils', label: 'Outils', icon: <IconWrench size={14} /> },
          { value: 'stock', label: 'Stock', icon: <IconBox size={14} /> },
        ]}
      />

      {tab === 'historique' && (
        <Card padded={false}>
          {historyRows.length === 0 ? (
            <EmptyState icon={<IconHistory size={24} />} title="Aucun pointage récent" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Arrivée</th>
                    <th className="px-4 py-2.5">Pause</th>
                    <th className="px-4 py-2.5">Départ</th>
                    <th className="px-4 py-2.5">Retard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {historyRows.map((h) => (
                    <tr key={h.date} className="hover:bg-surface-2">
                      <td className="px-4 py-2.5 font-medium text-ink">{formatDate(h.date)}</td>
                      <td className="px-4 py-2.5 font-mono text-ink">{h.in_at ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-ink-soft">{h.break_in ? `${h.break_in}→${h.break_out ?? '…'}` : '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-ink">{h.out_at ?? '—'}</td>
                      <td className="px-4 py-2.5">{h.late_minutes > 0 ? <Chip tone="amber">{h.late_minutes} min</Chip> : <span className="text-ink-faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'outils' && (
        <div className="space-y-3">
          {catalog && catalog.magasins.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMagasinFilter('all')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${magasinFilter === 'all' ? 'bg-charcoal text-white' : 'bg-paper-2 text-ink-soft hover:bg-line'}`}>Tous</button>
              {catalog.magasins.map((m) => (
                <button key={m.id} onClick={() => setMagasinFilter(m.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${magasinFilter === m.id ? 'bg-charcoal text-white' : 'bg-paper-2 text-ink-soft hover:bg-line'}`}>{m.name}</button>
              ))}
            </div>
          )}
          {availableTools.length === 0 ? (
            <EmptyState icon={<IconWrench size={24} />} title="Aucun outil disponible" hint="Aucun outil disponible dans le filtre sélectionné." />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {availableTools.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="text-xs text-ink-soft">{t.id} · {t.category}{t.magasin_name ? ` · ${t.magasin_name}` : ''}</p>
                    {t.status_reason && <p className="text-xs text-red">{t.status_reason}</p>}
                  </div>
                  <Chip tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-3">
          {catalog && catalog.magasins.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMagasinFilter('all')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${magasinFilter === 'all' ? 'bg-charcoal text-white' : 'bg-paper-2 text-ink-soft hover:bg-line'}`}>Tous</button>
              {catalog.magasins.map((m) => (
                <button key={m.id} onClick={() => setMagasinFilter(m.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${magasinFilter === m.id ? 'bg-charcoal text-white' : 'bg-paper-2 text-ink-soft hover:bg-line'}`}>{m.name}</button>
              ))}
            </div>
          )}
          {refs.length === 0 ? (
            <EmptyState icon={<IconBox size={24} />} title="Aucune référence" hint="Aucune référence de stock dans le filtre sélectionné." />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {refs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-ink-soft">{r.category}{r.magasin_name ? ` · ${r.magasin_name}` : ''}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink num">{r.qty} {r.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {leaves.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-ink">Mes demandes de congé / permission</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {leaves.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink capitalize">{l.kind === 'conge' ? 'Congé' : l.kind === 'permission' ? 'Permission' : 'Absence'}</p>
                  <p className="text-xs text-ink-soft">{formatDate(l.from_date)} → {formatDate(l.to_date)}{l.note ? ` · ${l.note}` : ''}</p>
                </div>
                <Chip tone={l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : 'red'}>
                  {l.status === 'approved' ? 'Approuvé' : l.status === 'pending' ? 'En attente' : 'Refusé'}
                </Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
