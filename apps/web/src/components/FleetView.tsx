import { useState, useMemo } from 'react';
import {
  Car,
  Truck,
  Bike,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Gauge,
  Plus,
  Wrench,
  Search,
  CheckCircle2,
  Fuel,
  MapPin,
  User,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { Vehicle, Generator, FleetSummary } from '../lib/api';
import {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  createGenerator,
  updateGenerator,
  deleteGenerator,
} from '../lib/api';
import { Button, Card, Drawer, Modal, Banner, Spinner, cx } from './ui';

type FleetAlertKind = 'insurance' | 'technical_visit' | 'vehicle_oil' | 'generator_oil' | 'vehicles' | 'generators';

export function FleetView({
  summary,
  canManage,
  onRefresh,
}: {
  summary: FleetSummary | null;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'generators'>('vehicles');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAlertOnly, setFilterAlertOnly] = useState(false);
  const [alertDrawer, setAlertDrawer] = useState<FleetAlertKind | null>(null);

  // Modals state
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState<Partial<Vehicle>>({});
  const [vehicleBusy, setVehicleBusy] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  const [generatorModalOpen, setGeneratorModalOpen] = useState(false);
  const [editingGenerator, setEditingGenerator] = useState<Generator | null>(null);
  const [generatorForm, setGeneratorForm] = useState<Partial<Generator>>({});
  const [generatorBusy, setGeneratorBusy] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);

  const [quickOilModal, setQuickOilModal] = useState<{
    kind: 'vehicle' | 'generator';
    item: Vehicle | Generator;
  } | null>(null);
  const [quickOilValue, setQuickOilValue] = useState<string>('');
  const [quickOilBusy, setQuickOilBusy] = useState(false);

  const vehicles = summary?.vehicles ?? [];
  const generators = summary?.generators ?? [];
  const alerts = summary?.alerts;

  function openAlertList(kind: FleetAlertKind) {
    const isGeneratorAlert = kind === 'generator_oil' || kind === 'generators';
    setActiveTab(isGeneratorAlert ? 'generators' : 'vehicles');
    setFilterType('all');
    setFilterAlertOnly(true);
    setAlertDrawer(kind);
  }

  // Filtrage des véhicules
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        v.registration_number.toLowerCase().includes(q) ||
        v.brand_model.toLowerCase().includes(q) ||
        (v.assigned_worker_name && v.assigned_worker_name.toLowerCase().includes(q));

      const matchesType = filterType === 'all' || v.vehicle_type === filterType;
      const hasAlert =
        v.insurance_status === 'urgent_15j' ||
        v.insurance_status === 'expire' ||
        v.tech_visit_status === 'urgent_15j' ||
        v.tech_visit_status === 'expire' ||
        v.oil_change_status === 'depasse' ||
        v.oil_change_status === 'proche';

      const matchesAlert = !filterAlertOnly || hasAlert;
      return matchesSearch && matchesType && matchesAlert;
    });
  }, [vehicles, search, filterType, filterAlertOnly]);

  // Filtrage des générateurs
  const filteredGenerators = useMemo(() => {
    return generators.filter((g) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        g.name_code.toLowerCase().includes(q) ||
        g.brand_model.toLowerCase().includes(q) ||
        g.location.toLowerCase().includes(q) ||
        (g.assigned_manager_name && g.assigned_manager_name.toLowerCase().includes(q));

      const hasAlert = g.oil_change_status === 'depasse' || g.oil_change_status === 'proche';
      const matchesAlert = !filterAlertOnly || hasAlert;
      return matchesSearch && matchesAlert;
    });
  }, [generators, search, filterAlertOnly]);

  const drawerVehicles = alertDrawer === 'insurance'
    ? vehicles.filter((v) => v.insurance_status === 'urgent_15j' || v.insurance_status === 'expire')
    : alertDrawer === 'technical_visit'
      ? vehicles.filter((v) => v.tech_visit_status === 'urgent_15j' || v.tech_visit_status === 'expire')
      : alertDrawer === 'vehicle_oil'
        ? vehicles.filter((v) => v.oil_change_status === 'depasse' || v.oil_change_status === 'proche')
        : alertDrawer === 'vehicles'
          ? vehicles.filter((v) => v.insurance_status === 'urgent_15j' || v.insurance_status === 'expire' || v.tech_visit_status === 'urgent_15j' || v.tech_visit_status === 'expire' || v.oil_change_status === 'depasse' || v.oil_change_status === 'proche')
          : [];
  const drawerGenerators = alertDrawer === 'generator_oil' || alertDrawer === 'generators'
    ? generators.filter((g) => g.oil_change_status === 'depasse' || g.oil_change_status === 'proche')
    : [];
  const drawerTitle = alertDrawer === 'insurance'
    ? 'Assurances à vérifier'
    : alertDrawer === 'technical_visit'
      ? 'Visites techniques à effectuer'
      : alertDrawer === 'vehicle_oil'
        ? 'Vidanges véhicules à effectuer'
        : alertDrawer === 'generator_oil'
          ? 'Vidanges groupes à effectuer'
          : alertDrawer === 'vehicles'
            ? 'Alertes du parc automobile'
            : 'Alertes groupes électrogènes';

  // Handlers Véhicules
  function openCreateVehicle() {
    setEditingVehicle(null);
    setVehicleForm({
      registration_number: '',
      brand_model: '',
      vehicle_type: 'camionnette',
      assigned_role: 'responsable_livraisons',
      assigned_worker_name: 'Responsable des Livraisons & Chantiers',
      insurance_company: '',
      insurance_policy_number: '',
      insurance_start_date: new Date().toISOString().slice(0, 10),
      insurance_end_date: '',
      technical_visit_due_date: '',
      current_mileage: 0,
      next_oil_change_mileage: 5000,
      status: 'operationnel',
    });
    setVehicleError(null);
    setVehicleModalOpen(true);
  }

  function openEditVehicle(v: Vehicle) {
    setEditingVehicle(v);
    setVehicleForm({ ...v });
    setVehicleError(null);
    setVehicleModalOpen(true);
  }

  async function handleSaveVehicle() {
    if (!vehicleForm.registration_number?.trim() || !vehicleForm.brand_model?.trim()) {
      setVehicleError("Numéro d'immatriculation et marque/modèle obligatoires.");
      return;
    }
    setVehicleBusy(true);
    setVehicleError(null);
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, vehicleForm);
      } else {
        await createVehicle(vehicleForm);
      }
      setVehicleModalOpen(false);
      onRefresh();
    } catch (e) {
      setVehicleError(e instanceof Error ? e.message : 'Erreur enregistrement véhicule');
    } finally {
      setVehicleBusy(false);
    }
  }

  async function handleDeleteVehicle(v: Vehicle) {
    if (!confirm(`Supprimer définitivement le véhicule ${v.brand_model} (${v.registration_number}) ?`)) return;
    try {
      await deleteVehicle(v.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur suppression');
    }
  }

  // Handlers Générateurs
  function openCreateGenerator() {
    setEditingGenerator(null);
    setGeneratorForm({
      name_code: '',
      brand_model: '',
      power_kva: 45,
      location: 'Atelier Central CFTM',
      assigned_manager_name: 'M. Aristide (Maintenance Machines)',
      running_hours: 0,
      oil_change_interval_hours: 250,
      next_oil_change_hours: 250,
      status: 'en_fonction',
      fuel_level_pct: 100,
    });
    setGeneratorError(null);
    setGeneratorModalOpen(true);
  }

  function openEditGenerator(g: Generator) {
    setEditingGenerator(g);
    setGeneratorForm({ ...g });
    setGeneratorError(null);
    setGeneratorModalOpen(true);
  }

  async function handleSaveGenerator() {
    if (!generatorForm.name_code?.trim() || !generatorForm.brand_model?.trim()) {
      setGeneratorError('Nom de code et marque/modèle obligatoires.');
      return;
    }
    setGeneratorBusy(true);
    setGeneratorError(null);
    try {
      if (editingGenerator) {
        await updateGenerator(editingGenerator.id, generatorForm);
      } else {
        await createGenerator(generatorForm);
      }
      setGeneratorModalOpen(false);
      onRefresh();
    } catch (e) {
      setGeneratorError(e instanceof Error ? e.message : 'Erreur enregistrement groupe');
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function handleDeleteGenerator(g: Generator) {
    if (!confirm(`Supprimer définitivement le groupe électrogène ${g.name_code} ?`)) return;
    try {
      await deleteGenerator(g.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur suppression');
    }
  }

  // Quick Oil Change
  async function submitQuickOil() {
    if (!quickOilModal) return;
    setQuickOilBusy(true);
    try {
      if (quickOilModal.kind === 'vehicle') {
        const v = quickOilModal.item as Vehicle;
        const km = Number(quickOilValue) || v.current_mileage;
        await updateVehicle(v.id, {
          current_mileage: km,
          last_oil_change_date: new Date().toISOString().slice(0, 10),
          last_oil_change_mileage: km,
          next_oil_change_mileage: km + 5000,
        });
      } else {
        const g = quickOilModal.item as Generator;
        const hours = Number(quickOilValue) || g.running_hours;
        await updateGenerator(g.id, {
          running_hours: hours,
          last_oil_change_date: new Date().toISOString().slice(0, 10),
          last_oil_change_hours: hours,
          next_oil_change_hours: hours + g.oil_change_interval_hours,
        });
      }
      setQuickOilModal(null);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur vidange');
    } finally {
      setQuickOilBusy(false);
    }
  }

  function vehicleAlertReasons(v: Vehicle) {
    const reasons: string[] = [];
    if ((alertDrawer === 'insurance' || alertDrawer === 'vehicles') && (v.insurance_status === 'urgent_15j' || v.insurance_status === 'expire')) {
      reasons.push(v.insurance_status === 'expire' ? 'Assurance expirée' : `Assurance à renouveler dans ${v.insurance_days_left} j`);
    }
    if ((alertDrawer === 'technical_visit' || alertDrawer === 'vehicles') && (v.tech_visit_status === 'urgent_15j' || v.tech_visit_status === 'expire')) {
      reasons.push(v.tech_visit_status === 'expire' ? 'Visite technique dépassée' : `Visite technique dans ${v.tech_visit_days_left} j`);
    }
    if ((alertDrawer === 'vehicle_oil' || alertDrawer === 'vehicles') && (v.oil_change_status === 'depasse' || v.oil_change_status === 'proche')) {
      reasons.push(v.oil_change_status === 'depasse'
        ? `Vidange dépassée de ${Math.abs(v.mileage_to_oil_change ?? 0).toLocaleString()} km`
        : `Vidange à prévoir dans ${v.mileage_to_oil_change?.toLocaleString()} km`);
    }
    return reasons;
  }

  return (
    <div className="space-y-6">
      {/* Bannière de Vigie Alertes Opérationnelles Flotte */}
      {alerts && alerts.total_urgent > 0 && (
        <div className="rounded-2xl border border-amber/40 bg-amber-wash/40 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber text-white shrink-0 shadow-xs">
              <AlertTriangle size={18} />
            </span>
            <div>
              <p className="text-xs font-bold text-ink">
                Vigie Échéances Flotte &amp; Groupes : {alerts.total_urgent} alerte(s) critique(s)
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-ink-soft">
                {alerts.insurance_urgent > 0 && (
                  <button type="button" onClick={() => openAlertList('insurance')} className="rounded-md bg-red-500/10 text-red-600 dark:text-red-400 font-semibold px-2 py-0.5 border border-red-500/20 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                    {alerts.insurance_urgent} assurance(s) expirée(s) ou &lt; 15j
                  </button>
                )}
                {alerts.tech_visit_urgent > 0 && (
                  <button type="button" onClick={() => openAlertList('technical_visit')} className="rounded-md bg-amber-500/10 text-amber font-semibold px-2 py-0.5 border border-amber-500/20 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
                    {alerts.tech_visit_urgent} visite(s) technique(s) due(s)
                  </button>
                )}
                {alerts.oil_change_urgent > 0 && (
                  <button type="button" onClick={() => openAlertList('vehicle_oil')} className="rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 border border-blue-500/20 hover:bg-blue-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    {alerts.oil_change_urgent} vidange(s) véhicule à effectuer
                  </button>
                )}
                {alerts.generator_oil_urgent > 0 && (
                  <button type="button" onClick={() => openAlertList('generator_oil')} className="rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold px-2 py-0.5 border border-purple-500/20 hover:bg-purple-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
                    {alerts.generator_oil_urgent} vidange(s) groupe électrogène
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilterAlertOnly((v) => !v)}
            className={cx(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border shrink-0',
              filterAlertOnly
                ? 'bg-amber text-white border-amber shadow-xs'
                : 'bg-surface text-ink hover:bg-surface-2 border-line'
            )}
          >
            {filterAlertOnly ? 'Afficher tout le parc' : 'Filtrer les urgences'}
          </button>
        </div>
      )}

      {/* Navigation Onglets Flotte : Véhicules vs Groupes Électrogènes */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('vehicles');
                setFilterType('all');
              }}
              className={cx(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border',
                activeTab === 'vehicles'
                  ? 'bg-amber text-white border-amber shadow-xs'
                  : 'bg-surface text-ink-soft hover:bg-surface-2 border-line'
              )}
            >
              <Truck size={15} />
              <span>Parc Automobile ({vehicles.length})</span>
            </button>
            {alerts && (alerts.insurance_urgent + alerts.tech_visit_urgent + alerts.oil_change_urgent) > 0 && (
              <button type="button" aria-label="Afficher les alertes du parc automobile" onClick={() => openAlertList('vehicles')} className="rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 font-extrabold hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                {alerts.insurance_urgent + alerts.tech_visit_urgent + alerts.oil_change_urgent}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('generators');
                setFilterType('all');
              }}
              className={cx(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border',
                activeTab === 'generators'
                  ? 'bg-amber text-white border-amber shadow-xs'
                  : 'bg-surface text-ink-soft hover:bg-surface-2 border-line'
              )}
            >
              <Zap size={15} />
              <span>Groupes Électrogènes ({generators.length})</span>
            </button>
            {alerts && alerts.generator_oil_urgent > 0 && (
              <button type="button" aria-label="Afficher les alertes des groupes électrogènes" onClick={() => openAlertList('generators')} className="rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 font-extrabold hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                {alerts.generator_oil_urgent}
              </button>
            )}
          </div>
        </div>

        {/* Boutons d'Action Création */}
        {canManage && (
          <div>
            {activeTab === 'vehicles' ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={14} />}
                onClick={openCreateVehicle}
                className="bg-amber hover:bg-amber-2 text-white font-bold"
              >
                Nouveau Véhicule
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={14} />}
                onClick={openCreateGenerator}
                className="bg-amber hover:bg-amber-2 text-white font-bold"
              >
                Nouveau Groupe Électrogène
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Barre de Recherche & Sous-Filtres */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-60 flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder={
              activeTab === 'vehicles'
                ? 'Rechercher immatriculation, marque, chauffeur...'
                : 'Rechercher groupe, puissance, lieu...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-xs text-ink focus:border-amber focus:outline-none"
          />
        </div>

        {activeTab === 'vehicles' && (
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-thin">
            {[
              { id: 'all', label: 'Tous' },
              { id: 'camionnette', label: 'Camionnettes' },
              { id: 'pickup', label: 'Pick-ups' },
              { id: 'moto_coursier', label: 'Motos Coursier' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterType(t.id)}
                className={cx(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border',
                  filterType === t.id
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-surface text-ink-soft hover:bg-surface-2 border-line'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================================
          CONTENU : VÉHICULES
      ========================================================================= */}
      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          {filteredVehicles.length === 0 ? (
            <Card className="p-8 text-center text-xs text-ink-soft">
              <Truck size={32} className="mx-auto text-ink-faint mb-2" />
              <p className="font-bold text-ink">Aucun véhicule trouvé</p>
              <p className="mt-1">Modifiez vos filtres ou ajoutez un véhicule au parc automobile du CFTM.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredVehicles.map((v) => {
                const isInsuranceUrgent = v.insurance_status === 'urgent_15j' || v.insurance_status === 'expire';
                const isVisitUrgent = v.tech_visit_status === 'urgent_15j' || v.tech_visit_status === 'expire';
                const isOilUrgent = v.oil_change_status === 'depasse' || v.oil_change_status === 'proche';

                return (
                  <div
                    key={v.id}
                    className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-amber/40 transition-all space-y-3"
                  >
                    <div>
                      {/* Top Row : Plaque + Type Icon + Statut */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 place-items-center rounded-xl bg-surface-2 border border-line text-ink">
                            {v.vehicle_type === 'moto_coursier' ? (
                              <Bike size={16} />
                            ) : v.vehicle_type === 'pickup' ? (
                              <Car size={16} />
                            ) : (
                              <Truck size={16} />
                            )}
                          </span>
                          <div>
                            <span className="inline-block px-2 py-0.5 rounded font-mono font-black text-xs bg-ink text-paper tracking-wider border border-line">
                              {v.registration_number}
                            </span>
                            <h4 className="font-bold text-xs text-ink mt-0.5 truncate">{v.brand_model}</h4>
                          </div>
                        </div>

                        <span
                          className={cx(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                            v.status === 'operationnel'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : v.status === 'en_maintenance'
                              ? 'bg-amber-500/10 text-amber border-amber-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                          )}
                        >
                          {v.status === 'operationnel'
                            ? 'En service'
                            : v.status === 'en_maintenance'
                            ? 'Révision'
                            : 'Immobilisé'}
                        </span>
                      </div>

                      {/* Responsable assigné (Coursier ou Resp. Livraisons) */}
                      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-surface-2/60 p-2 text-xs">
                        <User size={13} className="text-amber shrink-0" />
                        <div className="min-w-0 flex-1 leading-tight">
                          <span className="block text-[10px] font-semibold text-ink-faint uppercase">
                            {v.assigned_role === 'coursier'
                              ? 'Coursier CFTM'
                              : v.assigned_role === 'responsable_livraisons'
                              ? 'Resp. Livraisons & Chantiers'
                              : 'Chauffeur / Direction'}
                          </span>
                          <span className="block font-bold text-ink truncate text-[11px]">
                            {v.assigned_worker_name || 'Non attribué nominativement'}
                          </span>
                        </div>
                      </div>

                      {/* Indicateurs : Assurance, Visite Technique, Vidange */}
                      <div className="mt-3 space-y-2 text-xs">
                        {/* 1. Assurance */}
                        <div className="flex items-center justify-between rounded-lg border border-line/60 bg-paper/60 p-2">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className={isInsuranceUrgent ? 'text-red' : 'text-emerald'} />
                            <div>
                              <p className="font-semibold text-ink text-[11px]">Assurance</p>
                              <p className="text-[10px] text-ink-faint truncate max-w-36">
                                {v.insurance_company || 'Cie non renseignée'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={cx(
                                'inline-block rounded px-1.5 py-0.5 font-bold text-[10px]',
                                v.insurance_status === 'expire'
                                  ? 'bg-red text-white'
                                  : v.insurance_status === 'urgent_15j'
                                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-extrabold'
                                  : v.insurance_status === 'warning_30j'
                                  ? 'bg-amber-500/15 text-amber'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              {v.insurance_status === 'expire'
                                ? 'EXPIRÉE'
                                : v.insurance_days_left != null
                                ? `${v.insurance_days_left} j restants`
                                : 'Non définie'}
                            </span>
                            <span className="block text-[9px] text-ink-faint font-mono mt-0.5">
                              Échéance : {v.insurance_end_date || 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* 2. Visite Technique */}
                        <div className="flex items-center justify-between rounded-lg border border-line/60 bg-paper/60 p-2">
                          <div className="flex items-center gap-1.5">
                            <Wrench size={14} className={isVisitUrgent ? 'text-red' : 'text-ink-soft'} />
                            <div>
                              <p className="font-semibold text-ink text-[11px]">Visite Technique</p>
                              <p className="text-[10px] text-ink-faint">Centre agréé</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={cx(
                                'inline-block rounded px-1.5 py-0.5 font-bold text-[10px]',
                                v.tech_visit_status === 'expire'
                                  ? 'bg-red text-white'
                                  : v.tech_visit_status === 'urgent_15j'
                                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-extrabold'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              {v.tech_visit_status === 'expire'
                                ? 'DÉPASSÉE'
                                : v.tech_visit_days_left != null
                                ? `${v.tech_visit_days_left} j restants`
                                : 'À jour'}
                            </span>
                            <span className="block text-[9px] text-ink-faint font-mono mt-0.5">
                              Due le : {v.technical_visit_due_date || 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* 3. Vidange & Compteur Kilométrique */}
                        <div className="flex items-center justify-between rounded-lg border border-line/60 bg-paper/60 p-2">
                          <div className="flex items-center gap-1.5">
                            <Gauge size={14} className={isOilUrgent ? 'text-amber' : 'text-ink-soft'} />
                            <div>
                              <p className="font-semibold text-ink text-[11px]">Compteur Kilométrage</p>
                              <p className="text-[10px] font-mono text-ink-soft font-bold">
                                {v.current_mileage.toLocaleString()} km
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={cx(
                                'inline-block rounded px-1.5 py-0.5 font-bold text-[10px]',
                                v.oil_change_status === 'depasse'
                                  ? 'bg-red text-white'
                                  : v.oil_change_status === 'proche'
                                  ? 'bg-amber-500/15 text-amber font-extrabold'
                                  : 'bg-surface-2 text-ink-soft'
                              )}
                            >
                              {v.oil_change_status === 'depasse'
                                ? 'VIDANGE DUE'
                                : v.mileage_to_oil_change != null
                                ? `${v.mileage_to_oil_change.toLocaleString()} km avant vidange`
                                : 'OK'}
                            </span>
                            <span className="block text-[9px] text-ink-faint font-mono mt-0.5">
                              Seuil : {v.next_oil_change_mileage.toLocaleString()} km
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Card */}
                    <div className="border-t border-line/60 pt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickOilModal({ kind: 'vehicle', item: v });
                          setQuickOilValue(String(v.current_mileage));
                        }}
                        className="flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-amber-wash hover:text-amber transition-colors cursor-pointer"
                      >
                        <Wrench size={12} />
                        <span>Noter Vidange</span>
                      </button>

                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditVehicle(v)}
                            className="p-1.5 rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
                            title="Modifier"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVehicle(v)}
                            className="p-1.5 rounded-lg text-red/70 hover:bg-red-wash hover:text-red transition-colors cursor-pointer"
                            title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          CONTENU : GROUPES ÉLECTROGÈNES
      ========================================================================= */}
      {activeTab === 'generators' && (
        <div className="space-y-4">
          {filteredGenerators.length === 0 ? (
            <Card className="p-8 text-center text-xs text-ink-soft">
              <Zap size={32} className="mx-auto text-ink-faint mb-2" />
              <p className="font-bold text-ink">Aucun groupe électrogène trouvé</p>
              <p className="mt-1">Ajoutez un groupe électrogène de secours ou de chantier au CFTM.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredGenerators.map((g) => {
                const isOilUrgent = g.oil_change_status === 'depasse' || g.oil_change_status === 'proche';

                return (
                  <div
                    key={g.id}
                    className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-amber/40 transition-all space-y-3"
                  >
                    <div>
                      {/* Top Row : Nom de code + Puissance kVA + Statut */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-wash text-amber border border-amber/20">
                            <Zap size={16} />
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-black text-xs text-ink truncate">{g.name_code}</h4>
                              <span className="rounded bg-surface-2 px-1.5 py-0.2 font-mono font-bold text-[10px] text-amber border border-line">
                                {g.power_kva} kVA
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-faint truncate mt-0.5">{g.brand_model}</p>
                          </div>
                        </div>

                        <span
                          className={cx(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                            g.status === 'en_fonction'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : g.status === 'en_veille'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                          )}
                        >
                          {g.status === 'en_fonction'
                            ? 'En service'
                            : g.status === 'en_veille'
                            ? 'En veille'
                            : 'En panne'}
                        </span>
                      </div>

                      {/* Emplacement & Responsable maintenance */}
                      <div className="mt-3 space-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5 text-ink-soft text-[11px]">
                          <MapPin size={12} className="text-amber shrink-0" />
                          <span className="truncate">{g.location}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-ink-soft text-[11px]">
                          <User size={12} className="text-ink-faint shrink-0" />
                          <span className="truncate">{g.assigned_manager_name || 'Chef maintenance atelier'}</span>
                        </div>
                      </div>

                      {/* Compteur horaire & Vidange */}
                      <div className="mt-3 rounded-xl border border-line bg-paper/60 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-ink-faint font-medium">Heures de marche cumulées</span>
                          <span className="font-mono text-base font-extrabold text-ink tabular-nums">
                            {Number(g.running_hours).toLocaleString()} h
                          </span>
                        </div>

                        <div className="flex items-center justify-between border-t border-line/60 pt-2">
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className={isOilUrgent ? 'text-amber' : 'text-emerald'} />
                            <span className="text-[11px] font-semibold text-ink">Prochaine Vidange</span>
                          </div>
                          <div className="text-right">
                            <span
                              className={cx(
                                'inline-block rounded px-1.5 py-0.5 font-bold text-[10px]',
                                g.oil_change_status === 'depasse'
                                  ? 'bg-red text-white'
                                  : g.oil_change_status === 'proche'
                                  ? 'bg-amber-500/15 text-amber font-extrabold'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              {g.oil_change_status === 'depasse'
                                ? 'DÉPASSÉE'
                                : `${g.hours_to_oil_change} h restantes`}
                            </span>
                            <span className="block text-[9px] text-ink-faint font-mono mt-0.5">
                              Seuil : {g.next_oil_change_hours} h (toutes les {g.oil_change_interval_hours}h)
                            </span>
                          </div>
                        </div>

                        {/* Niveau de carburant */}
                        <div className="border-t border-line/60 pt-2 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1 text-ink-faint">
                            <Fuel size={12} className="text-amber" />
                            Réservoir carburant
                          </span>
                          <span className="font-bold text-ink">{g.fuel_level_pct}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Card */}
                    <div className="border-t border-line/60 pt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickOilModal({ kind: 'generator', item: g });
                          setQuickOilValue(String(g.running_hours));
                        }}
                        className="flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-amber-wash hover:text-amber transition-colors cursor-pointer"
                      >
                        <Wrench size={12} />
                        <span>Valider Vidange ({g.running_hours}h)</span>
                      </button>

                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditGenerator(g)}
                            className="p-1.5 rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
                            title="Modifier"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGenerator(g)}
                            className="p-1.5 rounded-lg text-red/70 hover:bg-red-wash hover:text-red transition-colors cursor-pointer"
                            title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL VÉHICULE (Création / Modification)
      ========================================================================= */}
      <Drawer
        open={alertDrawer !== null}
        title={drawerTitle}
        subtitle={`${drawerVehicles.length + drawerGenerators.length} élément(s) à vérifier`}
        onClose={() => setAlertDrawer(null)}
      >
        <div className="space-y-2.5">
          {drawerVehicles.map((v) => (
            <article key={v.id} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-ink">{v.registration_number}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-ink">{v.brand_model}</p>
                </div>
                <span className="shrink-0 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-600 dark:text-red-400">Véhicule</span>
              </div>
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-soft">
                {vehicleAlertReasons(v).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              {alertDrawer === 'insurance' && v.insurance_end_date && <p className="mt-2 text-[11px] text-ink-faint">Échéance : {v.insurance_end_date}</p>}
              {alertDrawer === 'technical_visit' && v.technical_visit_due_date && <p className="mt-2 text-[11px] text-ink-faint">Échéance : {v.technical_visit_due_date}</p>}
            </article>
          ))}
          {drawerGenerators.map((g) => (
            <article key={g.id} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-ink">{g.name_code}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-ink">{g.brand_model}</p>
                </div>
                <span className="shrink-0 rounded-md bg-amber-wash px-2 py-1 text-[10px] font-bold text-amber">Groupe</span>
              </div>
              <p className="mt-2 border-t border-line pt-2 text-xs text-ink-soft">
                {g.oil_change_status === 'depasse'
                  ? `Vidange dépassée de ${Math.abs(g.hours_to_oil_change ?? 0).toLocaleString()} h`
                  : `Vidange à prévoir dans ${g.hours_to_oil_change?.toLocaleString()} h`}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">Compteur : {Number(g.running_hours).toLocaleString()} h · Seuil : {Number(g.next_oil_change_hours).toLocaleString()} h</p>
            </article>
          ))}
          {drawerVehicles.length + drawerGenerators.length === 0 && (
            <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">Aucune alerte dans cette catégorie.</p>
          )}
        </div>
      </Drawer>

      <Modal
        open={vehicleModalOpen}
        title={editingVehicle ? `Modifier Véhicule : ${editingVehicle.brand_model}` : 'Ajouter un Véhicule au Parc'}
        onClose={() => setVehicleModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVehicleModalOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={vehicleBusy}
              onClick={() => void handleSaveVehicle()}
              className="bg-amber hover:bg-amber-2 text-white font-bold"
            >
              {vehicleBusy ? <Spinner /> : 'Enregistrer Véhicule'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {vehicleError && <Banner tone="error">{vehicleError}</Banner>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Immatriculation</label>
              <input
                type="text"
                value={vehicleForm.registration_number || ''}
                onChange={(e) => setVehicleForm((f) => ({ ...f, registration_number: e.target.value.toUpperCase() }))}
                placeholder="Ex : LT 842 BJ"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono font-bold text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Type de véhicule</label>
              <select
                value={vehicleForm.vehicle_type || 'camionnette'}
                onChange={(e) => setVehicleForm((f) => ({ ...f, vehicle_type: e.target.value as any }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              >
                <option value="camionnette">Camionnette de livraison</option>
                <option value="pickup">Pick-up Chantier 4x4</option>
                <option value="moto_coursier">Moto Coursier</option>
                <option value="camion">Camion Poids Lourd</option>
                <option value="voiture_liaison">Véhicule de liaison</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-ink">Marque &amp; Modèle</label>
            <input
              type="text"
              value={vehicleForm.brand_model || ''}
              onChange={(e) => setVehicleForm((f) => ({ ...f, brand_model: e.target.value }))}
              placeholder="Ex : Hyundai H100 Plateau Bois"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Rôle responsable assigné</label>
              <select
                value={vehicleForm.assigned_role || 'responsable_livraisons'}
                onChange={(e) => setVehicleForm((f) => ({ ...f, assigned_role: e.target.value as any }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              >
                <option value="responsable_livraisons">Responsable des Livraisons</option>
                <option value="coursier">Coursier Général</option>
                <option value="chauffeur">Chauffeur Dédié</option>
                <option value="direction">Direction / Monastère</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Nom du chauffeur / travailleur</label>
              <input
                type="text"
                value={vehicleForm.assigned_worker_name || ''}
                onChange={(e) => setVehicleForm((f) => ({ ...f, assigned_worker_name: e.target.value }))}
                placeholder="Ex : M. Ahanga Sylvain"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          {/* Section Suivi Assurance */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2.5">
            <p className="font-bold text-ink flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-amber" />
              Contrat d'Assurance
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Compagnie d'Assurance</label>
                <input
                  type="text"
                  value={vehicleForm.insurance_company || ''}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, insurance_company: e.target.value }))}
                  placeholder="Ex : Chanas, Activa, Saar..."
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">N° de Police</label>
                <input
                  type="text"
                  value={vehicleForm.insurance_policy_number || ''}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, insurance_policy_number: e.target.value }))}
                  placeholder="Ex : POL-2026-..."
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Date Début Assurance</label>
                <input
                  type="date"
                  value={vehicleForm.insurance_start_date || ''}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, insurance_start_date: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft font-bold text-amber">Date Expiration Assurance</label>
                <input
                  type="date"
                  value={vehicleForm.insurance_end_date || ''}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, insurance_end_date: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-amber/40 bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section Visite Technique & Kilométrage */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2.5">
            <p className="font-bold text-ink flex items-center gap-1.5">
              <Wrench size={14} className="text-amber" />
              Visite Technique &amp; Vidange
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Date Prochaine Visite Technique</label>
                <input
                  type="date"
                  value={vehicleForm.technical_visit_due_date || ''}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, technical_visit_due_date: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Kilométrage Actuel</label>
                <input
                  type="number"
                  value={vehicleForm.current_mileage || 0}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, current_mileage: Number(e.target.value) }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Seuil Prochaine Vidange (km)</label>
                <input
                  type="number"
                  value={vehicleForm.next_oil_change_mileage || 0}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, next_oil_change_mileage: Number(e.target.value) }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-soft">Statut du Véhicule</label>
                <select
                  value={vehicleForm.status || 'operationnel'}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, status: e.target.value as any }))}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="operationnel">Opérationnel / En service</option>
                  <option value="en_maintenance">En maintenance / Révision</option>
                  <option value="immobilise">Immobilisé</option>
                  <option value="reforme">Réformé</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL GROUPE ÉLECTROGÈNE (Création / Modification)
      ========================================================================= */}
      <Modal
        open={generatorModalOpen}
        title={editingGenerator ? `Modifier Groupe : ${editingGenerator.name_code}` : 'Ajouter un Groupe Électrogène'}
        onClose={() => setGeneratorModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGeneratorModalOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={generatorBusy}
              onClick={() => void handleSaveGenerator()}
              className="bg-amber hover:bg-amber-2 text-white font-bold"
            >
              {generatorBusy ? <Spinner /> : 'Enregistrer Groupe'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {generatorError && <Banner tone="error">{generatorError}</Banner>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Code / Nom du Groupe</label>
              <input
                type="text"
                value={generatorForm.name_code || ''}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, name_code: e.target.value }))}
                placeholder="Ex : GE-01 Principal"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-bold text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Puissance (kVA)</label>
              <input
                type="number"
                value={generatorForm.power_kva || 0}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, power_kva: Number(e.target.value) }))}
                placeholder="Ex : 110"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono font-bold text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-ink">Marque &amp; Modèle</label>
            <input
              type="text"
              value={generatorForm.brand_model || ''}
              onChange={(e) => setGeneratorForm((f) => ({ ...f, brand_model: e.target.value }))}
              placeholder="Ex : Cummins PowerCommand 110 kVA"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Emplacement</label>
              <input
                type="text"
                value={generatorForm.location || ''}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Ex : Local Technique Central"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Responsable Technique</label>
              <input
                type="text"
                value={generatorForm.assigned_manager_name || ''}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, assigned_manager_name: e.target.value }))}
                placeholder="Ex : M. Aristide"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Heures actuelles</label>
              <input
                type="number"
                value={generatorForm.running_hours || 0}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, running_hours: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Intervalle (h)</label>
              <input
                type="number"
                value={generatorForm.oil_change_interval_hours || 250}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, oil_change_interval_hours: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Prochaine vidange (h)</label>
              <input
                type="number"
                value={generatorForm.next_oil_change_hours || 250}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, next_oil_change_hours: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Statut</label>
              <select
                value={generatorForm.status || 'en_fonction'}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, status: e.target.value as any }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              >
                <option value="en_fonction">En service normal</option>
                <option value="en_veille">En veille (Secours)</option>
                <option value="en_maintenance">En maintenance</option>
                <option value="hors_service">Hors service</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Niveau Carburant (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={generatorForm.fuel_level_pct || 100}
                onChange={(e) => setGeneratorForm((f) => ({ ...f, fuel_level_pct: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL SAISIE RAPIDE DE VIDANGE
      ========================================================================= */}
      <Modal
        open={!!quickOilModal}
        title={
          quickOilModal?.kind === 'vehicle'
            ? `Enregistrer Vidange Véhicule (${(quickOilModal.item as Vehicle).registration_number})`
            : `Enregistrer Vidange Groupe (${(quickOilModal?.item as Generator)?.name_code})`
        }
        onClose={() => setQuickOilModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuickOilModal(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={quickOilBusy}
              onClick={() => void submitQuickOil()}
              className="bg-emerald hover:bg-emerald-2 text-white font-bold"
            >
              {quickOilBusy ? <Spinner /> : 'Valider la Vidange'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          <div className="rounded-xl border border-emerald/30 bg-emerald-wash/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={18} className="text-emerald shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-ink">Validation de l'Entretien &amp; Vidange</p>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Cette action enregistre la date du jour comme dernière vidange et recalcule automatiquement le prochain seuil d'échéance.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-ink">
              {quickOilModal?.kind === 'vehicle'
                ? 'Nouveau Kilométrage au compteur'
                : 'Heures de marche actuelles au compteur'}
            </label>
            <input
              type="number"
              value={quickOilValue}
              onChange={(e) => setQuickOilValue(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono font-bold text-xs text-ink focus:border-emerald focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
