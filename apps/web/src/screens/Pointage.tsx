import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, type Dashboard as DashboardType, type Employee, type KioskIdentify, type PunchResult, type PunchType } from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { initials } from '../lib/labels';
import { Banner, Button, Card, Spinner, cx } from '../components/ui';
import {
  Camera,
  Check,
  Clock,
  FileSpreadsheet,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import { ModularKeyboard } from '../components/ModularKeyboard';

type Terminal = { id: string; name: string };
type Stage = 'terminal' | 'identify' | 'card' | 'capture' | 'confirm';

const TERMINAL_KEY = 'mf.terminal';
const AUTO_RETURN_SECONDS = 15;

const PUNCH_LABEL: Record<PunchType, string> = {
  in: 'Arrivée',
  out: 'Départ',
  break_in: 'Début de pause',
  break_out: 'Reprise de pause',
};

function PunchReceipt({ result }: { result: PunchResult }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void qrDataUrl(`${QR_PREFIX.punch}${result.employee.id}:${result.serverAt}`, 200).then((value) => {
      if (!cancelled) setSrc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  return (
    <div
      className="receipt-page"
      style={{ fontFamily: '"IBM Plex Sans", sans-serif', background: '#ffffff', color: '#111827' }}
    >
      <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '2mm', marginBottom: '3mm' }} className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: '10pt', fontWeight: 700, margin: 0, color: '#ff6603' }}>Menuiserie du Mont Fèbè</p>
          <p style={{ fontSize: '7pt', color: '#6b7280', margin: '0.5mm 0 0' }}>
            Ticket de pointage — {PUNCH_LABEL[result.punchType]}
          </p>
        </div>
        <img src="/logo.png" alt="Logo" style={{ height: '7mm', objectFit: 'contain' }} />
      </div>
      <table style={{ fontSize: '8pt', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ color: '#6b7280', padding: '1mm 0' }}>Travailleur</td>
            <td style={{ fontWeight: 600, padding: '1mm 0' }}>{result.employee.full_name}</td>
          </tr>
          <tr>
            <td style={{ color: '#6b7280', padding: '1mm 0' }}>Matricule</td>
            <td style={{ fontFamily: '"IBM Plex Mono", monospace', padding: '1mm 0' }}>{result.employee.id}</td>
          </tr>
          <tr>
            <td style={{ color: '#6b7280', padding: '1mm 0' }}>Heure officielle</td>
            <td style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, padding: '1mm 0' }}>
              {result.serverTime}
            </td>
          </tr>
          <tr>
            <td style={{ color: '#6b7280', padding: '1mm 0' }}>Statut</td>
            <td style={{ padding: '1mm 0' }}>
              {result.status === 'present' ? 'Présent' : result.lateMinutes > 0 ? 'En retard' : result.status}
              {result.lateMinutes > 0 ? ` — ${result.lateMinutes} min` : ''}
            </td>
          </tr>
        </tbody>
      </table>
      {src ? (
        <div style={{ marginTop: '3mm', textAlign: 'center' }}>
          <img src={src} alt="QR pointage" style={{ width: '18mm', height: '18mm' }} />
          <p style={{ fontSize: '6pt', color: '#6b7280', margin: '1mm 0 0' }}>Archive immuable du serveur</p>
        </div>
      ) : null}
    </div>
  );
}

function useStoredTerminal() {
  const [terminalId, setTerminalId] = useState<string | null>(() => localStorage.getItem(TERMINAL_KEY));
  const save = useCallback((id: string) => {
    localStorage.setItem(TERMINAL_KEY, id);
    setTerminalId(id);
  }, []);
  const clear = useCallback(() => {
    localStorage.removeItem(TERMINAL_KEY);
    setTerminalId(null);
  }, []);
  return { terminalId, save, clear };
}

function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    setReady(false);
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setError('Caméra indisponible : ce terminal n’expose aucune caméra.');
      return;
    }
    media
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            void video.play();
            setReady(true);
          };
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError') {
          setError('Accès caméra refusé : veuillez autoriser la caméra.');
        } else if (name === 'NotFoundError') {
          setError('Aucune caméra détectée.');
        } else {
          setError('Caméra indisponible.');
        }
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active]);

  return { videoRef, error, ready };
}

function captureSquare(video: HTMLVideoElement): string | null {
  const size = Math.min(video.videoWidth, video.videoHeight);
  if (!size) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const sx = (video.videoWidth - size) / 2;
  const sy = (video.videoHeight - size) / 2;
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 640, 640);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function BadgeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { videoRef, error, ready } = useCamera(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && ready && video.videoWidth) {
        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            const raw = code.data.trim();
            const cleaned = raw.includes(':') ? (raw.split(':').pop() ?? raw) : raw;
            stopped = true;
            onCode(cleaned);
            return;
          }
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
    };
  }, [ready, onCode, videoRef]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-charcoal text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-medium">Présentez le badge devant l'objectif</p>
        <button onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10" aria-label="Fermer">
          <X size={18} />
        </button>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-12">
          <div className="absolute inset-0 rounded-xl border-2 border-amber/60" />
          <div className="scan-laser absolute inset-x-3 top-2 h-0.5 rounded-full bg-amber shadow-[0_0_14px_var(--color-amber)]" />
        </div>
        {error ? (
          <div className="absolute inset-x-6 bottom-24">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
      </div>
      <footer className="border-t border-white/10 px-4 py-3 text-center text-xs text-white/60">
        Reconnaissance optique haute précision QR Code
      </footer>
    </div>
  );
}

const MAX_CODE_LENGTH = 10;


/**
 * COMPOSANT PRINCIPAL POINTAGE (JIBBLE CLONE + TABLEUR GOOGLE SHEETS)
 */
export function Pointage() {
  const [activeMainTab, setActiveMainTab] = useState<'timesheets' | 'kiosk'>('timesheets');

  // Timesheets Overview state
  const [attendanceDetail, setAttendanceDetail] = useState<NonNullable<DashboardType['das04']>['detail']>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tsLoading, setTsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Kiosk state
  const { terminalId, save, clear } = useStoredTerminal();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [stage, setStage] = useState<Stage>(() => (terminalId ? 'identify' : 'terminal'));
  const [code, setCode] = useState('');
  const [identified, setIdentified] = useState<KioskIdentify | null>(null);
  const [punchType, setPunchType] = useState<PunchType>('in');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [motifNote, setMotifNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [idle, setIdle] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const { print, portal } = usePrintSheet();

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const captureActive = stage === 'capture';
  const { videoRef, error: cameraError, ready } = useCamera(captureActive);

  // Fetch data for Timesheets Tableur
  const loadTimesheets = useCallback(() => {
    setTsLoading(true);
    Promise.all([
      api<DashboardType>('/api/dashboard').catch(() => null),
      api<{ employees: Employee[] }>('/api/employees').catch(() => ({ employees: [] })),
      api<{ terminals: Terminal[] }>('/api/kiosk/terminals').catch(() => ({ terminals: [] })),
    ])
      .then(([dashRes, empRes, termRes]) => {
        if (dashRes?.das04?.detail) {
          setAttendanceDetail(dashRes.das04.detail);
        }
        setEmployees(empRes.employees);
        setTerminals(termRes.terminals);
      })
      .finally(() => setTsLoading(false));
  }, []);

  useEffect(() => {
    loadTimesheets();
  }, [loadTimesheets]);

  useEffect(() => {
    if (stage !== 'terminal' && terminals.length > 0 && !terminalId) setStage('terminal');
  }, [terminals, terminalId, stage]);

  useEffect(() => {
    if (stage !== 'card') return;
    setIdle(AUTO_RETURN_SECONDS);
    const timer = window.setInterval(() => {
      setIdle((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          resetToIdentify();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'confirm') return;
    const timer = window.setTimeout(() => {
      resetToIdentify();
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  function resetToIdentify() {
    setIdentified(null);
    setSelfie(null);
    setMotif('');
    setMotifNote('');
    setCode('');
    setError(null);
    setStage(terminalId ? 'identify' : 'terminal');
    loadTimesheets();
  }

  async function identify(raw: string) {
    if (!terminalId) {
      setError('Sélectionnez d’abord un terminal enregistré.');
      return;
    }
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setLocked(false);
    try {
      const res = await api<KioskIdentify>('/api/kiosk/identify', {
        method: 'POST',
        body: JSON.stringify({ terminalId, code: value }),
      });
      setIdentified(res);
      setStage('card');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Identification impossible.';
      setError(message);
      if (message.toLowerCase().includes('verrouill')) setLocked(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function submitPunch() {
    if (!identified || !selfie) return;
    if (!terminalId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<PunchResult>('/api/kiosk/punch', {
        method: 'POST',
        body: JSON.stringify({
          terminalId,
          employeeId: identified.employee.id,
          punchType,
          idMode: 'manual',
          selfie,
          reason: motif && motif !== 'Autre' ? motif : motif === 'Autre' ? motifNote : undefined,
        }),
      });
      setResult(res);
      setStage('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pointage refusé.');
    } finally {
      setBusy(false);
    }
  }

  const situation = identified?.situation;
  const lateNeeded =
    punchType === 'in' && !!situation && situation.lateMinutes > situation.toleranceMinutes;
  const progress = stage === 'card' ? (idle / AUTO_RETURN_SECONDS) * 100 : 100;

  // Filtered rows for Timesheets
  const filteredAttendance = attendanceDetail.filter((row) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return row.fullName.toLowerCase().includes(q) || row.jobTitle.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPresent = attendanceDetail.filter((r) => r.status === 'present').length;
  const totalLate = attendanceDetail.filter((r) => r.status === 'late').length;

  return (
    <div className="space-y-6">
      {/* Top Header with Tab Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber">
            Jibble Timesheets &amp; Approvals
          </span>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Pointage &amp; Feuilles de temps</h1>
          <p className="text-xs text-ink-soft">
            Tableur de pointage en direct et mode borne d’atelier pour tablettes et smartphones.
          </p>
        </div>

        {/* Mode Toggle Switcher */}
        <div className="flex items-center rounded-xl border border-line bg-surface p-1 shadow-xs">
          <button
            onClick={() => setActiveMainTab('timesheets')}
            className={cx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              activeMainTab === 'timesheets'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            <FileSpreadsheet size={15} />
            <span>Feuilles de temps</span>
          </button>
          <button
            onClick={() => setActiveMainTab('kiosk')}
            className={cx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              activeMainTab === 'kiosk'
                ? 'bg-amber text-white shadow-xs'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            <Smartphone size={15} />
            <span>Mode Borne Kiosque</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MODE 1 : JIBBLE TIMESHEETS OVERVIEW (TABLEUR GOOGLE SHEETS STYLE)
      ========================================================================= */}
      {activeMainTab === 'timesheets' ? (
        <div className="space-y-5">
          {/* Timesheets KPI Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-4 shadow-card">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Présents à l'heure
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-green tabular-nums">{totalPresent}</p>
              <p className="text-[11px] text-ink-faint mt-0.5">Sur {employees.length || attendanceDetail.length} ouvriers</p>
            </Card>

            <Card className="p-4 shadow-card">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Retards constatés
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-amber tabular-nums">{totalLate}</p>
              <p className="text-[11px] text-ink-faint mt-0.5">Motif requis</p>
            </Card>

            <Card className="p-4 shadow-card">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Non pointés
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink-faint tabular-nums">
                {attendanceDetail.filter((r) => r.status === 'absent').length}
              </p>
              <p className="text-[11px] text-ink-faint mt-0.5">Absents ou non déclarés</p>
            </Card>

            <Card className="p-4 shadow-card">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Taux de présence
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
                {attendanceDetail.length > 0
                  ? `${Math.round(((totalPresent + totalLate) / attendanceDetail.length) * 100)}%`
                  : '—'}
              </p>
              <p className="text-[11px] text-ink-faint mt-0.5">Ponctualité globale</p>
            </Card>
          </div>

          {/* Tableur Toolbar */}
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom ou fonction…"
                className="h-9 w-full rounded-lg border border-line bg-paper-2/60 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:bg-surface focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-line bg-paper-2 p-0.5 text-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={cx(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    statusFilter === 'all' ? 'bg-surface font-semibold text-ink shadow-xs' : 'text-ink-soft',
                  )}
                >
                  Tous
                </button>
                <button
                  onClick={() => setStatusFilter('present')}
                  className={cx(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    statusFilter === 'present' ? 'bg-surface font-semibold text-green shadow-xs' : 'text-ink-soft',
                  )}
                >
                  À l'heure
                </button>
                <button
                  onClick={() => setStatusFilter('late')}
                  className={cx(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    statusFilter === 'late' ? 'bg-surface font-semibold text-amber shadow-xs' : 'text-ink-soft',
                  )}
                >
                  Retards
                </button>
                <button
                  onClick={() => setStatusFilter('absent')}
                  className={cx(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    statusFilter === 'absent' ? 'bg-surface font-semibold text-ink-faint shadow-xs' : 'text-ink-soft',
                  )}
                >
                  Absents
                </button>
              </div>

              {/* View Switcher on mobile/desktop */}
              <div className="flex items-center rounded-lg border border-line bg-paper-2 p-0.5 sm:hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={cx('rounded p-1', viewMode === 'table' ? 'bg-surface shadow-xs' : '')}
                  title="Vue Tableur"
                >
                  <FileSpreadsheet size={15} />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={cx('rounded p-1', viewMode === 'cards' ? 'bg-surface shadow-xs' : '')}
                  title="Vue Fiches"
                >
                  <Users size={15} />
                </button>
              </div>

              <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={loadTimesheets}>
                Actualiser
              </Button>
            </div>
          </div>

          {tsLoading && attendanceDetail.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
              <Spinner /> Chargement de la feuille de présence…
            </div>
          ) : null}

          {/* SPREADSHEET TABLEUR VIEW (GOOGLE SHEETS STYLE) */}
          <div className={cx('overflow-hidden rounded-xl border border-line bg-surface shadow-card', viewMode === 'cards' && 'hidden sm:block')}>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-left sheet-grid min-w-[760px]">
                <thead>
                  <tr>
                    <th className="sheet-th sticky-col min-w-[200px]">Travailleur / ID</th>
                    <th className="sheet-th w-28 text-center">Arrivée (In)</th>
                    <th className="sheet-th w-28 text-center">Départ (Out)</th>
                    <th className="sheet-th w-28 text-center">Pause</th>
                    <th className="sheet-th w-32 text-center">Durée travaillée</th>
                    <th className="sheet-th w-28 text-center">Tolérance / Écart</th>
                    <th className="sheet-th w-32 text-center">Statut</th>
                    <th className="sheet-th w-24 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-line">
                  {filteredAttendance.map((row) => {
                    const isPresent = row.status === 'present';
                    const isLate = row.status === 'late';
                    return (
                      <tr key={row.id} className="hover:bg-paper-2/40 transition-colors">
                        {/* Sticky Worker Column */}
                        <td className="sheet-cell sticky-col bg-surface">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper-2 text-[10px] font-bold text-ink-soft border border-line">
                              {initials(row.fullName)}
                            </span>
                            <div className="min-w-0">
                              <span className="truncate block font-semibold text-ink text-xs">{row.fullName}</span>
                              <span className="truncate block text-[10px] text-ink-faint">{row.jobTitle}</span>
                            </div>
                          </div>
                        </td>

                        {/* In time */}
                        <td className="sheet-cell text-center font-mono font-semibold tabular-nums">
                          {row.inAt ? (
                            <span className={cx(isLate ? 'text-amber' : 'text-green')}>{row.inAt}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>

                        {/* Out time */}
                        <td className="sheet-cell text-center font-mono tabular-nums text-ink-soft">
                          {row.outAt ?? (row.inAt ? <span className="text-green text-[11px] font-medium">En poste</span> : '—')}
                        </td>

                        {/* Break */}
                        <td className="sheet-cell text-center font-mono tabular-nums text-ink-faint">
                          {row.inAt ? '0h45' : '—'}
                        </td>

                        {/* Total Hours */}
                        <td className="sheet-cell text-center font-mono font-bold text-ink tabular-nums">
                          {row.inAt ? '7h45' : '0h00'}
                        </td>

                        {/* Ecart / Retard */}
                        <td className="sheet-cell text-center font-mono tabular-nums">
                          {row.lateMinutes > 0 ? (
                            <span className="inline-block rounded bg-surface-2 border border-line px-1.5 py-0.5 text-[10px] font-bold text-amber">
                              +{row.lateMinutes} min
                            </span>
                          ) : row.inAt ? (
                            <span className="text-green text-[11px]">À l'heure</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>

                        {/* Status Chip */}
                        <td className="sheet-cell text-center">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium text-ink-soft"
                          >
                            <span
                              className={cx(
                                'h-1.5 w-1.5 rounded-full shrink-0',
                                isPresent ? 'bg-green' : isLate ? 'bg-amber' : 'bg-ink-faint',
                              )}
                            />
                            {isPresent ? 'Validé' : isLate ? 'Retard' : 'Non pointé'}
                          </span>
                        </td>

                        {/* Quick Action */}
                        <td className="sheet-cell text-center">
                          <button
                            onClick={() => {
                              setActiveMainTab('kiosk');
                              setStage('identify');
                            }}
                            className="rounded px-2 py-1 text-[11px] font-medium text-amber hover:bg-amber-wash"
                          >
                            Pointer
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs text-ink-faint">
                        Aucun pointage ne correspond aux critères de filtre.
                      </td>
                    </tr>
                  ) : null}
                </tbody>

                {/* Spreadsheet Totals Footer */}
                <tfoot>
                  <tr className="bg-paper-2/80 font-bold text-xs text-ink">
                    <td className="sheet-cell sticky-col bg-paper-2 text-ink">
                      TOTAL ({filteredAttendance.length} collaborateurs)
                    </td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-green">
                      {totalPresent + totalLate} arrivées
                    </td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-ink-soft">—</td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-ink-faint">—</td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-ink font-bold">
                      {((totalPresent + totalLate) * 7.75).toFixed(1)}h
                    </td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-amber">
                      {totalLate} retards
                    </td>
                    <td className="sheet-cell text-center text-[11px] text-ink-soft">
                      {totalPresent} validés
                    </td>
                    <td className="sheet-cell text-center">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* MOBILE CARDS VIEW (Mobile-First alternate) */}
          <div className={cx('space-y-3 sm:hidden', viewMode === 'table' && 'hidden')}>
            {filteredAttendance.map((row) => (
              <Card key={row.id} className="p-3.5 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink">
                      {initials(row.fullName)}
                    </span>
                    <div>
                      <p className="font-semibold text-xs text-ink">{row.fullName}</p>
                      <p className="text-[10px] text-ink-faint">{row.jobTitle}</p>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium text-ink-soft"
                  >
                    <span
                      className={cx(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        row.status === 'present'
                          ? 'bg-green'
                          : row.status === 'late'
                          ? 'bg-amber'
                          : 'bg-ink-faint',
                      )}
                    />
                    {row.status === 'present' ? 'À l’heure' : row.status === 'late' ? 'En retard' : 'Absent'}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
                  <div>
                    <span className="text-[10px] text-ink-faint block">Arrivée</span>
                    <span className="font-mono font-bold text-ink">{row.inAt ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-faint block">Départ</span>
                    <span className="font-mono font-bold text-ink">{row.outAt ?? 'En poste'}</span>
                  </div>
                  <button
                    onClick={() => {
                      setActiveMainTab('kiosk');
                      setStage('identify');
                    }}
                    className="rounded-lg bg-amber-wash border border-amber/20 px-3 py-1.5 text-xs font-bold text-amber active:scale-95"
                  >
                    Pointer
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* =========================================================================
          MODE 2 : BORNE KIOSQUE (INTERACTION DIRECTE OUVRIER / TABLETTE)
      ========================================================================= */}
      {activeMainTab === 'kiosk' ? (
        <div className="py-2">
          {stage === 'terminal' || !terminalId ? (
            <div className="mx-auto max-w-lg">
              <h2 className="text-xl font-bold text-ink">Sélection de la borne</h2>
              <p className="mt-1 text-xs text-ink-soft">
                Choisissez le terminal enregistré pour ce poste d'atelier.
              </p>
              <div className="mt-4 space-y-3">
                {terminals.length === 0 ? (
                  <Banner tone="info" title="Aucun terminal enregistré">
                    La direction doit enregistrer une tablette dans Paramètres &gt; Bornes avant le premier pointage.
                  </Banner>
                ) : (
                  terminals.map((terminal) => (
                    <Card key={terminal.id} className="p-4 shadow-card">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-ink">{terminal.name}</p>
                          <p className="font-mono text-xs text-ink-faint">{terminal.id}</p>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            save(terminal.id);
                            setStage('identify');
                            setError(null);
                          }}
                        >
                          Sélectionner
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
                {terminalId ? (
                  <Button variant="quiet" onClick={clear}>
                    Changer de terminal
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {stage === 'identify' ? (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-charcoal border border-line p-1.5 shadow-xs">
                    <img src="/emblem-white.png" alt="Croix" className="h-7 w-7 object-contain" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-ink leading-tight">Identification Ouvrier</h2>
                    <p className="text-xs text-ink-soft">Menuiserie du Monastère Mont Fèbè</p>
                  </div>
                </div>
                <Button variant="quiet" size="sm" onClick={clear}>
                  Changer borne
                </Button>
              </div>

              {/* Jibble Giant Clock Screen */}
              <div className="rounded-2xl bg-charcoal px-5 py-5 text-center text-white shadow-card border border-line">
                <p className="font-mono text-4xl font-extrabold tracking-tight text-amber tabular-nums">
                  {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="mt-1 text-xs capitalize text-white/60">
                  {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>

              <Card className="p-4 sm:p-5 shadow-card space-y-4">
                {/* Zone de visualisation tactile du code saisi avec curseur */}
                <div>
                  <div className="mb-2 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-ink">Code ou badge saisi</span>
                    <span className="text-[11px] text-ink-faint">
                      {code.length > 0 ? `${code.length} caractère${code.length > 1 ? 's' : ''}` : 'Clavier modulable AZERTY / 123'}
                    </span>
                  </div>

                  <div className="relative flex items-center justify-center rounded-xl border-2 border-line-strong bg-paper-2 px-4 py-3 min-h-[58px] shadow-inner transition-colors focus-within:border-amber">
                    {code ? (
                      <p className="font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-ink tabular-nums flex items-center gap-1">
                        {code}
                        <span className="inline-block h-6 w-0.5 animate-pulse bg-amber" />
                      </p>
                    ) : (
                      <p className="text-xs sm:text-sm text-ink-faint flex items-center gap-1.5 select-none">
                        <span>Tapez votre code (ex: P3N8D ou 003)...</span>
                        <span className="inline-block h-4 w-0.5 animate-pulse bg-amber" />
                      </p>
                    )}

                    {code.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCode('')}
                        className="absolute right-3 grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-soft hover:text-ink active:scale-90"
                        title="Effacer tout"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Clavier Modulable Style SwiftKey / Android WhatsApp */}
                <ModularKeyboard
                  value={code}
                  onChange={setCode}
                  onSubmit={() => void identify(code)}
                  maxLength={MAX_CODE_LENGTH}
                />

                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" icon={<QrCode size={16} />} onClick={() => setScanning(true)}>
                    Scanner badge QR
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={busy || code.length === 0}
                    onClick={() => void identify(code)}
                  >
                    {busy ? <Spinner /> : 'Valider'}
                  </Button>
                </div>

                {error ? (
                  <div className="mt-2">
                    <Banner tone="error" title={locked ? 'Terminal verrouillé' : 'Identification refusée'}>
                      {error}
                    </Banner>
                  </div>
                ) : null}
              </Card>

              {scanning ? (
                <BadgeScanner
                  onCode={(value) => {
                    setScanning(false);
                    void identify(value);
                  }}
                  onClose={() => setScanning(false)}
                />
              ) : null}
            </div>
          ) : null}

          {stage === 'card' && identified ? (
            <div className="mx-auto max-w-xl space-y-4" onClick={() => setIdle(AUTO_RETURN_SECONDS)}>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full bg-amber transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
              </div>

              <Card className="p-5 shadow-card">
                <div className="flex items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-amber-wash text-amber font-bold text-base border border-amber/20">
                    {initials(identified.employee.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-ink">{identified.employee.full_name}</p>
                    <p className="text-xs text-ink-soft">{identified.employee.job_title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{identified.employee.id}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-ink-faint">Aujourd'hui</span>
                    <p className="mt-0.5 text-xs font-bold text-ink">
                      {!situation?.isWorkday
                        ? 'Jour non ouvré'
                        : situation.onBreak
                        ? 'En pause'
                        : situation.hasIn && situation.hasOut
                        ? 'Journée terminée'
                        : situation.hasIn
                        ? 'Déjà en poste'
                        : 'Non pointé'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4 text-xs">
                  <div>
                    <span className="text-ink-faint text-[10px]">Ouverture</span>
                    <p className="font-mono font-bold text-ink">{situation?.openingTime}</p>
                  </div>
                  <div>
                    <span className="text-ink-faint text-[10px]">Tolérance</span>
                    <p className="font-mono font-bold text-ink">{situation?.toleranceMinutes}m</p>
                  </div>
                  <div>
                    <span className="text-ink-faint text-[10px]">Présences mois</span>
                    <p className="font-mono font-bold text-ink">{identified.month.daysPresent} j</p>
                  </div>
                  <div>
                    <span className="text-ink-faint text-[10px]">Retards</span>
                    <p className="font-mono font-bold text-amber">{identified.month.lateCount}</p>
                  </div>
                </div>
              </Card>

              {/* Action Buttons */}
              <div className="grid gap-3 sm:grid-cols-2">
                {situation?.canPunchIn ? (
                  <Button
                    size="lg"
                    variant="primary"
                    icon={<Clock size={18} />}
                    onClick={() => {
                      setPunchType('in');
                      setStage('capture');
                    }}
                  >
                    Pointer Arrivée
                  </Button>
                ) : null}
                {situation?.canPunchOut ? (
                  <Button
                    size="lg"
                    variant="primary"
                    icon={<Clock size={18} />}
                    onClick={() => {
                      setPunchType('out');
                      setStage('capture');
                    }}
                  >
                    Pointer Départ
                  </Button>
                ) : null}
                {situation?.canBreakIn ? (
                  <Button
                    size="lg"
                    icon={<Clock size={18} />}
                    onClick={() => {
                      setPunchType('break_in');
                      setStage('capture');
                    }}
                  >
                    Prendre Pause
                  </Button>
                ) : null}
                {situation?.canBreakOut ? (
                  <Button
                    size="lg"
                    variant="success"
                    icon={<Clock size={18} />}
                    onClick={() => {
                      setPunchType('break_out');
                      setStage('capture');
                    }}
                  >
                    Reprendre Travail
                  </Button>
                ) : null}
              </div>

              <div className="pt-2 text-center">
                <Button variant="quiet" size="sm" onClick={resetToIdentify}>
                  Annuler / Terminer
                </Button>
              </div>
            </div>
          ) : null}

          {stage === 'capture' && identified ? (
            <div className="mx-auto max-w-md space-y-4">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  {PUNCH_LABEL[punchType]} — {identified.employee.full_name}
                </h2>
                <p className="text-xs text-ink-soft">Photo d'atelier requise pour authentification.</p>
              </div>

              {!selfie ? (
                <Card className="overflow-hidden shadow-card">
                  <div className="relative aspect-square w-full bg-charcoal">
                    <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
                    {!ready && !cameraError ? (
                      <div className="absolute inset-0 grid place-items-center text-white/70">
                        <Spinner />
                      </div>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      icon={<Camera size={18} />}
                      disabled={!ready}
                      onClick={() => {
                        const video = videoRef.current;
                        if (!video) return;
                        const data = captureSquare(video);
                        if (data) setSelfie(data);
                      }}
                    >
                      Prendre la photo
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card className="overflow-hidden shadow-card p-4 space-y-3">
                  <div className="aspect-square w-full overflow-hidden rounded-xl border border-line bg-charcoal">
                    <img src={selfie} alt="Selfie" className="h-full w-full object-cover" />
                  </div>

                  {lateNeeded ? (
                    <div className="space-y-2 border-t border-line pt-3">
                      <Banner tone="info" title={`Retard de ${situation?.lateMinutes} min`}>
                        Motif requis par l'atelier.
                      </Banner>
                      <select
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
                      >
                        <option value="">Sélectionnez un motif de retard…</option>
                        {(situation?.lateMotifs ?? []).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="flex gap-2 pt-2">
                    <Button onClick={() => setSelfie(null)}>Reprendre</Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={busy || (lateNeeded && !motif)}
                      onClick={() => void submitPunch()}
                    >
                      {busy ? <Spinner /> : 'Valider le pointage'}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          ) : null}

          {stage === 'confirm' && result ? (
            <div className="mx-auto max-w-md">
              <Card className="p-6 text-center shadow-card space-y-3">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-wash text-green">
                  <Check size={28} />
                </span>
                <h2 className="text-xl font-bold text-ink">{PUNCH_LABEL[result.punchType]} confirmée</h2>
                <p className="text-xs text-ink-soft">{result.employee.full_name}</p>
                <p className="font-mono text-3xl font-extrabold text-ink tabular-nums">{result.serverTime}</p>
                <div className="flex justify-center gap-2 pt-3">
                  <Button icon={<Printer size={16} />} onClick={() => print(<PunchReceipt result={result} />)}>
                    Imprimer fiche
                  </Button>
                  <Button variant="primary" onClick={resetToIdentify}>
                    Fiche suivante
                  </Button>
                </div>
              </Card>
              {portal}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
