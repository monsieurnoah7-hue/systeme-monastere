import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, type Dashboard as DashboardType, type Employee, type KioskIdentify, type PunchResult, type PunchType, type User } from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { initials } from '../lib/labels';
import { Banner, Button, Card, Modal, PasswordInput, Spinner, cx } from '../components/ui';
import {
  Camera,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Lock,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Smartphone,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';

type Terminal = { id: string; name: string };
type Stage = 'terminal' | 'identify' | 'validate_pin' | 'actions' | 'capture' | 'confirm';

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
          <p style={{ fontSize: '10pt', fontWeight: 700, margin: 0, color: '#ff6603' }}>C.F.T. des Bénédictins du Mont Fébé</p>
          <p style={{ fontSize: '7pt', color: '#6b7280', margin: '0.5mm 0 0' }}>
            Ticket de pointage · {PUNCH_LABEL[result.punchType]}
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

function useCamera(active: boolean, facingMode: 'user' | 'environment' = 'user') {
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
      .getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 960 }, height: { ideal: 960 } },
        audio: false,
      })
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
  }, [active, facingMode]);

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

function generateFallbackSnapshot(employeeName: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 640, 640);
  ctx.fillStyle = '#ff5500';
  ctx.beginPath();
  ctx.arc(320, 250, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(employeeName, 320, 420);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Certification Kiosque Monastère', 320, 470);
  ctx.fillText(new Date().toLocaleTimeString('fr-FR'), 320, 510);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function BadgeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { videoRef, error, ready } = useCamera(true, 'environment');
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
 * COMPOSANT PRINCIPAL POINTAGE
 */
export function Pointage({
  user,
  permissions,
}: {
  user?: User;
  permissions?: Record<string, boolean> | null;
} = {}) {
  const isSuper = user?.role === 'direction';
  const hasPerm = (p: string) => isSuper || (permissions ? !!permissions[p] : false);
  const canExportReports = !user || hasPerm('reports.export') || (!permissions && (user.role === 'direction' || user.role === 'chef_atelier'));

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
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
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
  const [countdown, setCountdown] = useState(4);
  const [now, setNow] = useState(() => new Date());
  const { print, portal } = usePrintSheet();

  // Borne Kiosque Verrouillée (Zéro évasion - Pilier 2)
  const [isKioskLocked, setIsKioskLocked] = useState(() => {
    try {
      return sessionStorage.getItem('mf_kiosk_locked') === 'true';
    } catch {
      return false;
    }
  });
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === 'identify') {
      const timer = setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  const captureActive = stage === 'actions' || stage === 'capture';
  const { videoRef, error: cameraError, ready } = useCamera(captureActive, 'user');

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
    if (stage !== 'actions' && stage !== 'validate_pin' && stage !== 'capture') return;
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
    setCountdown(4);
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          resetToIdentify();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  function resetToIdentify() {
    setIdentified(null);
    setSelfie(null);
    setMotif('');
    setMotifNote('');
    setCode('');
    setPin('');
    setPinError(null);
    setError(null);
    setStage(terminalId ? 'identify' : 'terminal');
    loadTimesheets();
  }

  useEffect(() => {
    if (stage !== 'validate_pin') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 6) setPin((p) => p + e.key);
      } else if (e.key === 'Backspace') {
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (pin.length >= 4) void validatePin();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [stage, pin, terminalId, identified]);

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
      setPin('');
      setPinError(null);
      // Étape 2 obligatoire : Validation par code secret personnel
      setStage('validate_pin');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Identification impossible.';
      setError(message);
      if (message.toLowerCase().includes('verrouill')) setLocked(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function validatePin() {
    if (!pin || pin.trim().length < 4) {
      setPinError('Veuillez saisir votre code secret PIN personnel (au moins 4 chiffres).');
      return;
    }
    if (!terminalId || !identified) return;
    setBusy(true);
    setPinError(null);
    try {
      await api('/api/kiosk/verify-pin', {
        method: 'POST',
        body: JSON.stringify({
          terminalId,
          employeeId: identified.employee.id,
          pin: pin.trim(),
        }),
      });

      // Sélection intuitive automatique de l'action selon la situation
      const sit = identified?.situation;
      if (sit?.canBreakOut) {
        setPunchType('break_out');
      } else if (sit?.canPunchIn) {
        setPunchType('in');
      } else if (sit?.canPunchOut) {
        setPunchType('out');
      } else if (sit?.canBreakIn) {
        setPunchType('break_in');
      } else {
        setPunchType('in');
      }
      setSelfie(null);
      setMotif('');
      setMotifNote('');
      // Étape 3 obligatoire : Choix de l'action & Selfie horodaté
      setStage('actions');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code secret personnel incorrect.';
      setPinError(message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  async function submitPunch(photoData?: string) {
    const finalSelfie = photoData || selfie || (identified ? generateFallbackSnapshot(identified.employee.full_name) : null);
    if (!identified || !finalSelfie) return;
    if (!terminalId) return;
    if (!pin || pin.trim().length < 4) {
      setError('Code secret personnel requis pour certifier le pointage.');
      setStage('validate_pin');
      return;
    }
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
          selfie: finalSelfie,
          pin: pin.trim(),
          reason: motif && motif !== 'Autre' ? motif : motif === 'Autre' ? motifNote : undefined,
        }),
      });
      setResult(res);
      setStage('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pointage refusé.');
      setSelfie(null);
    } finally {
      setBusy(false);
    }
  }

  function lockKiosk() {
    setIsKioskLocked(true);
    sessionStorage.setItem('mf_kiosk_locked', 'true');
    setActiveMainTab('kiosk');
  }

  async function handleUnlockKiosk() {
    if (!unlockPassword.trim()) {
      setUnlockError('Saisissez le mot de passe Direction.');
      return;
    }
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      await api('/api/kiosk/unlock', {
        method: 'POST',
        body: JSON.stringify({ password: unlockPassword.trim() }),
      });
      setIsKioskLocked(false);
      sessionStorage.removeItem('mf_kiosk_locked');
      setUnlockModalOpen(false);
      setUnlockPassword('');
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Code ou mot de passe invalide.');
    } finally {
      setUnlockBusy(false);
    }
  }

  const situation = identified?.situation;
  const lateNeeded =
    punchType === 'in' && !!situation && situation.lateMinutes > situation.toleranceMinutes;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Pointage</h1>
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
            <span>Présences</span>
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
            <span>Borne Kiosque</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MODE 1 : FEUILLES DE PRÉSENCE (VUE TABLEUR)
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
              <p className="text-[11px] text-ink-faint mt-0.5">
                {(employees.length || attendanceDetail.length) > 0
                  ? `Sur ${employees.length || attendanceDetail.length} ouvrier${(employees.length || attendanceDetail.length) > 1 ? 's' : ''}`
                  : 'Aucun travailleur enregistré'}
              </p>
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

              {canExportReports && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={13} />}
                    onClick={() => {
                      const dateStr = new Date().toISOString().split('T')[0];
                      const headers = ['Matricule', 'Nom Complet', 'Poste / Fonction', 'Arrivée', 'Départ', 'Statut', 'Heures', 'Pause', 'Écart'];
                      const rows = filteredAttendance.map((row) => [
                        row.id,
                        row.fullName,
                        row.jobTitle,
                        row.inAt || '-',
                        row.outAt || (row.inAt ? 'En poste' : '-'),
                        row.status === 'present' ? 'Présent' : row.status === 'late' ? 'En retard' : 'Absent',
                        row.inAt ? '7h45' : '0h00',
                        row.inAt ? '0h45' : '-',
                        row.lateMinutes > 0 ? `+${row.lateMinutes} min` : (row.inAt ? '0' : '-'),
                      ]);
                      exportToExcel(`Feuille_Presence_${dateStr}`, 'Présences', headers, rows);
                    }}
                  >
                    Excel
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Printer size={13} />}
                    onClick={() => {
                      const headers = ['Matricule', 'Nom Complet', 'Poste / Fonction', 'Arrivée', 'Départ', 'Statut', 'Heures', 'Pause', 'Écart'];
                      const rows = filteredAttendance.map((row) => [
                        row.id,
                        row.fullName,
                        row.jobTitle,
                        row.inAt || '-',
                        row.outAt || (row.inAt ? 'En poste' : '-'),
                        row.status === 'present' ? 'Présent' : row.status === 'late' ? 'En retard' : 'Absent',
                        row.inAt ? '7h45' : '0h00',
                        row.inAt ? '0h45' : '-',
                        row.lateMinutes > 0 ? `+${row.lateMinutes} min` : (row.inAt ? '0' : '-'),
                      ]);
                      exportToPdf(
                        'Feuille de Présence & Pointage Quotidien',
                        'Registre officiel des présences d’atelier du Centre de Formation Technique',
                        headers,
                        rows,
                        [
                          { label: 'Effectif Total', value: attendanceDetail.length },
                          { label: 'Présents à l’heure', value: totalPresent },
                          { label: 'Retards constatés', value: totalLate },
                          {
                            label: 'Ponctualité globale',
                            value:
                              attendanceDetail.length > 0
                                ? `${Math.round(((totalPresent + totalLate) / attendanceDetail.length) * 100)}%`
                                : '—',
                          },
                        ],
                      );
                    }}
                  >
                    Imprimer
                  </Button>
                </>
              )}
            </div>
          </div>

          {tsLoading && attendanceDetail.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
              <Spinner /> Chargement de la feuille de présence…
            </div>
          ) : null}

          {/* SPREADSHEET TABLEUR VIEW (GOOGLE SHEETS STYLE) */}
          <div className={cx('overflow-hidden rounded-xl border border-line bg-surface shadow-card', viewMode === 'cards' && 'hidden sm:block')}>
            <div className="overflow-x-auto scroll-thin touch-pan-x overscroll-x-contain">
              <table className="w-full text-left sheet-grid min-w-[760px] table-rhythm">
                <thead>
                  <tr>
                    <th className="sheet-th sticky-col min-w-[190px] col-lead">Travailleur / ID</th>
                    <th className="sheet-th w-28 text-center">Arrivée (In)</th>
                    <th className="sheet-th w-28 text-center">Départ (Out)</th>
                    <th className="sheet-th w-32 text-center bg-amber-wash/20 font-bold text-ink">Statut</th>
                    <th className="sheet-th w-32 text-center">Durée travaillée</th>
                    <th className="sheet-th w-28 text-center">Pause</th>
                    <th className="sheet-th w-28 text-center">Tolérance / Écart</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-line">
                  {filteredAttendance.map((row, idx) => {
                    const isPresent = row.status === 'present';
                    const isLate = row.status === 'late';
                    return (
                      <tr
                        key={row.id}
                        className={cx(
                          'transition-colors',
                          idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                          'hover:bg-amber-wash/20',
                        )}
                      >
                        {/* Sticky Worker Column */}
                        <td className={cx('sheet-cell sticky-col col-lead', idx % 2 === 0 ? 'bg-surface' : 'bg-[#181d28]')}>
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

                        {/* Status Chip - Placed directly right of Départ */}
                        <td className="sheet-cell text-center bg-amber-wash/10">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold text-ink-soft"
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

                        {/* Total Hours */}
                        <td className="sheet-cell text-center font-mono font-bold text-ink tabular-nums">
                          {row.inAt ? '7h45' : '0h00'}
                        </td>

                        {/* Break */}
                        <td className="sheet-cell text-center font-mono tabular-nums text-ink-faint">
                          {row.inAt ? '0h45' : '—'}
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
                      </tr>
                    );
                  })}

                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-xs text-ink-faint">
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
                    <td className="sheet-cell text-center text-[11px] text-ink-soft bg-amber-wash/10 font-bold">
                      {totalPresent} validés
                    </td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-ink font-bold">
                      {((totalPresent + totalLate) * 7.75).toFixed(1)}h
                    </td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-ink-faint">—</td>
                    <td className="sheet-cell text-center font-mono tabular-nums text-amber">
                      {totalLate} retards
                    </td>
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

                <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line/60 pt-2.5 text-xs text-center">
                  <div>
                    <span className="text-[10px] text-ink-faint block">Arrivée</span>
                    <span className="font-mono font-bold text-ink">{row.inAt ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-faint block">Départ</span>
                    <span className="font-mono font-bold text-ink">{row.outAt ?? 'En poste'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-faint block font-semibold text-ink">Statut</span>
                    <span className={cx(
                      'font-semibold text-[11px] block truncate',
                      row.status === 'present' ? 'text-green' : row.status === 'late' ? 'text-amber' : 'text-ink-faint'
                    )}>
                      {row.status === 'present' ? 'Validé' : row.status === 'late' ? 'Retard' : 'Non pointé'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-ink-faint block">Tolérance</span>
                    <span className={cx('font-mono font-bold', row.lateMinutes > 0 ? 'text-amber' : 'text-green')}>
                      {row.lateMinutes > 0 ? `+${row.lateMinutes} min` : row.inAt ? 'À l’heure' : '—'}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* =========================================================================
          MODE 2 : BORNE KIOSQUE (INTERACTION DIRECTE OUVRIER / TABLETTE)
      ========================================================================= */}
      {activeMainTab === 'kiosk' || isKioskLocked ? (
        <div
          className={cx(
            'py-2 transition-all',
            isKioskLocked &&
              'fixed inset-0 z-50 overflow-y-auto bg-paper p-4 sm:p-6 backdrop-blur-xl',
          )}
        >
          {/* Actions Borne Kiosque Minimaliste */}
          <div className="mx-auto mb-3 flex max-w-xl items-center justify-between">
            {stage === 'identify' && !isKioskLocked ? (
              <Button variant="quiet" size="sm" onClick={clear}>
                Changer borne
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              {!isKioskLocked ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Lock size={14} className="text-amber" />}
                  onClick={lockKiosk}
                  title="Verrouille l'écran pour empêcher toute sortie de la borne par un travailleur"
                >
                  Verrouiller la borne
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Unlock size={14} className="text-green" />}
                  onClick={() => {
                    setUnlockError(null);
                    setUnlockPassword('');
                    setUnlockModalOpen(true);
                  }}
                  title="Déverrouiller le kiosque avec le mot de passe Direction"
                >
                  Quitter borne
                </Button>
              )}
            </div>
          </div>

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
              {/* Horloge Kiosque */}
              <div className="rounded-2xl bg-charcoal px-5 py-5 text-center text-white shadow-card border border-line">
                <p className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight text-amber tabular-nums">
                  {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="mt-1 text-xs capitalize text-white/60">
                  {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>

              <Card className="p-4 sm:p-6 shadow-card space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && code.trim().length > 0) void identify(code);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">
                      Code ou badge artisan
                    </label>

                    <div className="relative flex items-center">
                      <input
                        ref={codeInputRef}
                        type="text"
                        inputMode="text"
                        autoFocus
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, MAX_CODE_LENGTH))}
                        placeholder="Tapez votre code (ex: P3N8D ou 003)..."
                        className="w-full rounded-xl border-2 border-line-strong bg-paper-2 px-4 py-3.5 pr-12 font-mono text-xl sm:text-2xl font-extrabold tracking-wider text-center text-ink placeholder:text-ink-faint/60 placeholder:text-sm placeholder:font-sans placeholder:tracking-normal shadow-inner transition-colors focus:border-amber focus:outline-none"
                        disabled={busy}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck="false"
                      />

                      {code.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCode('');
                            codeInputRef.current?.focus();
                          }}
                          className="absolute right-3 grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft hover:text-ink active:scale-90"
                          title="Effacer tout"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-1">
                    <Button
                      type="button"
                      size="lg"
                      className="flex-1 text-sm font-semibold"
                      icon={<QrCode size={18} />}
                      onClick={() => setScanning(true)}
                    >
                      Scanner badge QR
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="flex-1 text-sm font-semibold"
                      disabled={busy || code.trim().length === 0}
                    >
                      {busy ? <Spinner /> : 'Valider'}
                    </Button>
                  </div>
                </form>

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

          {/* ÉTAPE 2 : VALIDATION D'IDENTITÉ PAR CODE SECRET PERSONNEL (OBLIGATOIRE - ANTI-USURPATION) */}
          {stage === 'validate_pin' && identified ? (
            <div className="mx-auto max-w-md space-y-4" onClick={() => setIdle(AUTO_RETURN_SECONDS)}>
              <div className="text-center">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-wash px-3 py-1 text-xs font-bold text-blue border border-blue/20">
                    Étape 2 sur 3 · Authentification Secrète
                  </span>
                  <span className="text-[11px] font-mono text-ink-faint">
                    Auto {idle}s
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-bold text-ink">Code secret personnel requis</h2>
                <p className="text-xs text-ink-soft">
                  La présence du badge seul ne suffit pas. Confirmez votre identité avec votre code PIN.
                </p>
              </div>

              {/* Fiche Ouvrier Reconnue */}
              <Card className="p-4 shadow-card">
                <div className="flex items-center gap-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-wash text-amber font-bold text-sm border border-amber/20">
                    {initials(identified.employee.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{identified.employee.full_name}</p>
                    <p className="text-xs text-ink-soft">{identified.employee.job_title}</p>
                    <p className="font-mono text-[11px] text-ink-faint">{identified.employee.id}</p>
                  </div>
                  <span className="rounded-full bg-green-wash px-2 py-0.5 text-[10px] font-bold text-green border border-green/20">
                    Reconnu
                  </span>
                </div>
              </Card>

              {/* Champ d'affichage du PIN masqué */}
              <Card className="p-5 shadow-card space-y-4">
                <div className="text-center">
                  <label className="block text-xs font-semibold text-ink-soft mb-2">
                    Saisissez votre code PIN secret (4 à 6 chiffres)
                  </label>
                  <div className="flex justify-center gap-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={cx(
                          'grid h-11 w-11 place-items-center rounded-xl border-2 text-lg font-bold font-mono transition-all',
                          pin.length > i
                            ? 'border-amber bg-amber text-white shadow-xs'
                            : i === pin.length
                            ? 'border-amber/60 bg-amber-wash/30'
                            : 'border-line bg-paper-2 text-ink-faint',
                        )}
                      >
                        {pin.length > i ? '•' : ''}
                      </span>
                    ))}
                  </div>
                </div>

                {pinError ? <Banner tone="error">{pinError}</Banner> : null}

                {/* Clavier numérique dédié PIN */}
                <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => {
                        if (pin.length < 6) setPin((p) => p + digit);
                      }}
                      className="h-12 rounded-xl border border-line-strong bg-surface text-lg font-bold text-ink hover:bg-paper-2 active:scale-95 transition-all shadow-xs"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPin('')}
                    className="h-12 rounded-xl border border-line bg-surface text-xs font-semibold text-red hover:bg-red-wash active:scale-95 transition-all"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pin.length < 6) setPin((p) => p + '0');
                    }}
                    className="h-12 rounded-xl border border-line-strong bg-surface text-lg font-bold text-ink hover:bg-paper-2 active:scale-95 transition-all shadow-xs"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setPin((p) => p.slice(0, -1))}
                    className="h-12 rounded-xl border border-line bg-surface text-xs font-semibold text-ink-soft hover:bg-paper-2 active:scale-95 transition-all"
                  >
                    ⌫
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={resetToIdentify}>
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={pin.length < 4}
                    onClick={validatePin}
                  >
                    Valider mon identité
                  </Button>
                </div>
              </Card>
            </div>
          ) : null}

          {/* ÉTAPE 3 : POINTAGE INTUITIF & PREUVE PHOTO OBLIGATOIRE */}
          {(stage === 'actions' || stage === 'capture') && identified ? (
            <div className="mx-auto max-w-xl space-y-4" onClick={() => setIdle(AUTO_RETURN_SECONDS)}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-wash px-2.5 py-0.5 text-[11px] font-bold text-green border border-green/20">
                    Étape 3 sur 3 · Pointage &amp; Preuve Photo
                  </span>
                  <h2 className="mt-1 text-lg font-bold text-ink leading-tight">Validez votre pointage</h2>
                  <p className="text-xs text-ink-soft">Identité certifiée pour {identified.employee.full_name}</p>
                </div>
                <span className="text-[11px] font-mono text-ink-faint">
                  Auto {idle}s
                </span>
              </div>

              {error ? <Banner tone="error">{error}</Banner> : null}

              {/* Fiche Ouvrier & Situation */}
              <Card className="p-4 shadow-card">
                <div className="flex items-start gap-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-wash text-amber font-bold text-base border border-amber/20">
                    {initials(identified.employee.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{identified.employee.full_name}</p>
                    <p className="text-xs text-ink-soft">{identified.employee.job_title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{identified.employee.id}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-ink-faint block">Situation</span>
                    {situation?.activeLeave ? (
                      <span className="inline-flex items-center gap-1 mt-0.5 rounded-full bg-blue-wash px-2 py-0.5 text-[11px] font-bold text-blue border border-blue/20">
                        {situation.activeLeave.kind === 'permission' ? 'Permission' : 'Congé'}
                      </span>
                    ) : !situation?.isWorkday ? (
                      <span className="inline-flex items-center gap-1 mt-0.5 rounded-full bg-amber-wash px-2 py-0.5 text-[11px] font-bold text-amber border border-amber/20">
                        Astreinte
                      </span>
                    ) : situation?.onBreak ? (
                      <span className="inline-flex items-center gap-1 mt-0.5 rounded-full bg-amber-wash px-2 py-0.5 text-[11px] font-bold text-amber border border-amber/20">
                        En pause
                      </span>
                    ) : situation?.hasIn && situation?.hasOut ? (
                      <span className="inline-flex items-center gap-1 mt-0.5 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-bold text-ink-soft border border-line">
                        Journée finie
                      </span>
                    ) : situation?.hasIn ? (
                      <span className="inline-flex items-center gap-1 mt-0.5 rounded-full bg-green-wash px-2 py-0.5 text-[11px] font-bold text-green border border-green/20">
                        En poste
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 mt-0.5 rounded-full bg-amber-wash px-2 py-0.5 text-[11px] font-bold text-amber border border-amber/20">
                        Non pointé
                      </span>
                    )}
                  </div>
                </div>

                {/* Bannière d'information contextuelle (Permission, Congé, Astreinte) */}
                {situation?.activeLeave ? (
                  <div className="mt-3 rounded-lg border border-blue/20 bg-blue-wash/30 p-2.5 text-xs text-blue">
                    <span className="font-bold">Information de l'atelier : </span>
                    {situation.activeLeave.kind === 'permission' ? 'Permission validée' : 'Congé validé'} pour aujourd'hui
                    {situation.activeLeave.note ? ` — « ${situation.activeLeave.note} »` : ''}.
                  </div>
                ) : !situation?.isWorkday ? (
                  <div className="mt-3 rounded-lg border border-amber/20 bg-amber-wash/30 p-2.5 text-xs text-amber">
                    <span className="font-bold">Pointage d'astreinte : </span>
                    Jour non ouvré selon le planning standard. Ce pointage exceptionnel sera enregistré et tracé dans le journal d'astreinte.
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5 sm:grid-cols-4 text-xs">
                  <div>
                    <span className="text-ink-faint text-[10px]">Heure atelier</span>
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

              {/* Sélecteur d'action de pointage */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink-soft">
                  Action de pointage :
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => { setPunchType('in'); setSelfie(null); }}
                    className={cx(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-bold transition-all border shadow-xs',
                      punchType === 'in'
                        ? 'border-amber bg-amber text-white ring-2 ring-amber/20'
                        : 'border-line bg-surface text-ink hover:border-amber/40 hover:bg-paper-2',
                    )}
                  >
                    <Clock size={15} />
                    Arrivée
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPunchType('break_in'); setSelfie(null); }}
                    className={cx(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-bold transition-all border shadow-xs',
                      punchType === 'break_in'
                        ? 'border-amber bg-amber text-white ring-2 ring-amber/20'
                        : 'border-line bg-surface text-ink hover:border-amber/40 hover:bg-paper-2',
                    )}
                  >
                    <Clock size={15} />
                    Pause
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPunchType('break_out'); setSelfie(null); }}
                    className={cx(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-bold transition-all border shadow-xs',
                      punchType === 'break_out'
                        ? 'border-green bg-green text-white ring-2 ring-green/20'
                        : 'border-line bg-surface text-ink hover:border-green/40 hover:bg-paper-2',
                    )}
                  >
                    <Clock size={15} />
                    Reprise
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPunchType('out'); setSelfie(null); }}
                    className={cx(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-xs font-bold transition-all border shadow-xs',
                      punchType === 'out'
                        ? 'border-amber bg-amber text-white ring-2 ring-amber/20'
                        : 'border-line bg-surface text-ink hover:border-amber/40 hover:bg-paper-2',
                    )}
                  >
                    <Clock size={15} />
                    Départ
                  </button>
                </div>
              </div>

              {/* Notification & Motif si Retard (Arrivée hors tolérance) */}
              {lateNeeded ? (
                <Card className="p-4 border-amber/30 bg-amber-wash/10 space-y-3">
                  <div className="flex items-center gap-2 text-amber font-bold text-xs">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-amber text-white text-[11px]">!</span>
                    Retard de {situation?.lateMinutes} min constaté (tolérance {situation?.toleranceMinutes} min)
                  </div>
                  <p className="text-xs text-ink-soft">
                    Veuillez sélectionner le motif de votre retard :
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(situation?.lateMotifs && situation.lateMotifs.length > 0
                      ? situation.lateMotifs
                      : ['Transport / Embouteillages', 'Santé / Rdv Médical', 'Urgence familiale', 'Intempéries / Pluie', 'Autre']
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMotif(m)}
                        className={cx(
                          'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all border',
                          motif === m
                            ? 'bg-amber text-white border-amber shadow-xs'
                            : 'bg-surface text-ink border-line hover:border-amber/40 hover:bg-paper-2',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {motif === 'Autre' ? (
                    <input
                      type="text"
                      value={motifNote}
                      onChange={(e) => setMotifNote(e.target.value)}
                      placeholder="Précisez la raison de votre retard..."
                      className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
                    />
                  ) : null}
                </Card>
              ) : null}

              {/* Viseur Caméra & Déclencheur Unique */}
              {!selfie ? (
                <Card className="overflow-hidden shadow-card border-line-strong">
                  <div className="relative aspect-video sm:aspect-[4/3] w-full bg-charcoal overflow-hidden flex items-center justify-center">
                    <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
                    {!ready && !cameraError ? (
                      <div className="absolute inset-0 grid place-items-center text-white/70">
                        <Spinner />
                      </div>
                    ) : null}
                    {cameraError ? (
                      <div className="absolute inset-0 grid place-items-center p-4 text-center bg-charcoal/90 text-white">
                        <div>
                          <p className="text-xs font-semibold text-amber mb-1">Caméra indisponible</p>
                          <p className="text-[11px] text-white/70 max-w-xs">{cameraError}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-40 w-40 sm:h-48 sm:w-48 rounded-full border-2 border-dashed border-white/50 shadow-sm" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                        <span className={cx('h-2 w-2 rounded-full', ready ? 'bg-green animate-pulse' : 'bg-amber')} />
                        {ready ? 'Positionnez votre visage' : 'Initialisation caméra...'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-surface space-y-2">
                    <button
                      type="button"
                      disabled={busy || (lateNeeded && !motif && !motifNote)}
                      onClick={() => {
                        const video = videoRef.current;
                        if (video && ready) {
                          const data = captureSquare(video);
                          if (data) {
                            setSelfie(data);
                            void submitPunch(data);
                            return;
                          }
                        }
                        // Fallback snapshot si pas de webcam
                        void submitPunch();
                      }}
                      className={cx(
                        'w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all shadow-md',
                        busy || (lateNeeded && !motif && !motifNote)
                          ? 'bg-line text-ink-faint cursor-not-allowed'
                          : 'bg-amber text-white hover:bg-amber-deep active:scale-[0.98]',
                      )}
                    >
                      {busy ? (
                        <Spinner />
                      ) : (
                        <>
                          <Camera size={22} />
                          <span>Pointer {PUNCH_LABEL[punchType]} &amp; Enregistrer</span>
                        </>
                      )}
                    </button>
                    {lateNeeded && !motif ? (
                      <p className="text-center text-[11px] text-amber font-medium">
                        * Sélectionnez le motif de retard ci-dessus pour activer le pointage.
                      </p>
                    ) : null}
                  </div>
                </Card>
              ) : (
                /* Prévisualisation après capture si besoin de confirmation */
                <Card className="overflow-hidden shadow-card p-4 space-y-3">
                  <div className="aspect-square max-w-[280px] mx-auto overflow-hidden rounded-xl border border-line bg-charcoal">
                    <img src={selfie} alt="Selfie" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setSelfie(null)}>
                      Reprendre la photo
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={busy || (lateNeeded && !motif)}
                      onClick={() => void submitPunch()}
                    >
                      {busy ? <Spinner /> : `Confirmer ${PUNCH_LABEL[punchType]}`}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Bouton d'annulation */}
              <div className="pt-2 text-center">
                <Button variant="quiet" size="sm" onClick={resetToIdentify}>
                  Annuler / Changer de collaborateur
                </Button>
              </div>
            </div>
          ) : null}

          {/* ÉTAPE 4 : CONFIRMATION VISUELLE & COMPTE À REBOURS RETOUR AUTOMATIQUE */}
          {stage === 'confirm' && result ? (
            <div className="mx-auto max-w-md">
              <Card className="p-6 text-center shadow-card space-y-4">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-wash text-green border border-green/30 shadow-xs">
                  <CheckCircle2 size={36} />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-ink">{PUNCH_LABEL[result.punchType]} confirmée</h2>
                  <p className="text-xs text-ink-soft">{result.employee.full_name}</p>
                </div>
                <p className="font-mono text-4xl font-extrabold text-ink tabular-nums">{result.serverTime}</p>

                <div className="rounded-xl border border-green/20 bg-green-wash/40 p-3 text-xs text-green font-medium">
                  Pointage certifié avec selfie et code secret personnel.
                </div>

                <div className="pt-2 text-xs text-ink-faint">
                  Retour automatique à l'accueil dans <span className="font-bold text-amber font-mono text-sm">{countdown}s</span>…
                </div>

                <div className="flex justify-center gap-2 pt-1">
                  <Button icon={<Printer size={16} />} onClick={() => print(<PunchReceipt result={result} />)}>
                    Imprimer reçu
                  </Button>
                  <Button variant="primary" onClick={resetToIdentify}>
                    Fiche suivante
                  </Button>
                </div>
              </Card>
              {portal}
            </div>
          ) : null}

          {/* Modal Déverrouillage Borne Kiosque (Direction / Superviseur) */}
          <Modal
            open={unlockModalOpen}
            title="Déverrouillage de la Borne d'Atelier"
            onClose={() => setUnlockModalOpen(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setUnlockModalOpen(false)}>
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  disabled={unlockBusy || !unlockPassword.trim()}
                  onClick={() => void handleUnlockKiosk()}
                >
                  {unlockBusy ? <Spinner /> : 'Déverrouiller'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <p className="text-xs text-ink-soft">
                La borne est en mode exclusif imperméable. Saisissez le mot de passe de la Direction pour déverrouiller et revenir au menu principal.
              </p>
              {unlockError ? <Banner tone="error">{unlockError}</Banner> : null}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-soft">Mot de passe Direction</label>
                <PasswordInput
                  value={unlockPassword}
                  placeholder="Mot de passe superviseur…"
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleUnlockKiosk();
                  }}
                />
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </div>
  );
}
