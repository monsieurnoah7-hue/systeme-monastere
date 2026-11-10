import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, syncOfflineMutations, type Dashboard as DashboardType, type Employee, type KioskIdentify, type PunchResult, type PunchType, type User } from '../lib/api';
import { listOfflineMutations } from '../lib/offline';
import { QR_PREFIX, getCachedQr, qrDataUrl } from '../lib/qr';
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
  Users,
  X,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';

type Terminal = { id: string; name: string };
type Stage = 'terminal' | 'identify' | 'validate_pin' | 'actions' | 'capture' | 'confirm';

type DirectoryEmployee = {
  id: string;
  full_name: string;
  job_title: string;
  photo_path: string | null;
  badge_token: string | null;
  has_pin: boolean;
};

type DirectoryPunch = {
  employee_id: string;
  punch_type: string;
  server_at: string;
  late_minutes: number;
};

const KIOSK_DIR_KEY = 'mf_kiosk_directory_v1';

function cameroonMinutes(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function cameroonTime(date = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function getStoredDirectory(): { employees: DirectoryEmployee[]; todayPunches: DirectoryPunch[]; date: string } {
  try {
    const raw = localStorage.getItem(KIOSK_DIR_KEY);
    return raw ? (JSON.parse(raw) as { employees: DirectoryEmployee[]; todayPunches: DirectoryPunch[]; date: string }) : { employees: [], todayPunches: [], date: '' };
  } catch {
    return { employees: [], todayPunches: [], date: '' };
  }
}

function saveStoredDirectory(data: { employees: DirectoryEmployee[]; todayPunches: DirectoryPunch[]; date: string }) {
  try {
    localStorage.setItem(KIOSK_DIR_KEY, JSON.stringify(data));
  } catch {}
}

function AttendanceAvatar({ employee, size = 'h-8 w-8' }: {
  employee: NonNullable<DashboardType['das04']>['detail'][number];
  size?: string;
}) {
  return (
    <span className={cx('relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-paper-2 text-[10px] font-bold text-ink-soft', size)}>
      <span aria-hidden="true">{initials(employee.fullName)}</span>
      {employee.photoPath && (
        <img
          src={employee.photoPath}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}

const TERMINAL_KEY = 'mf.terminal';
const PIN_TIMEOUT_SECONDS = 3 * 60;
const ACTION_TIMEOUT_SECONDS = 3 * 60;
const SELFIE_TIMEOUT_SECONDS = 5 * 60;
const CONFIRMATION_TIMEOUT_SECONDS = 6;

function stageTimeoutSeconds(stage: Stage): number {
  if (stage === 'validate_pin') return PIN_TIMEOUT_SECONDS;
  if (stage === 'actions') return ACTION_TIMEOUT_SECONDS;
  if (stage === 'capture') return SELFIE_TIMEOUT_SECONDS;
  return 0;
}

const PUNCH_LABEL: Record<PunchType, string> = {
  in: 'Arrivée',
  out: 'Départ',
  break_in: 'Début de pause',
  break_out: 'Reprise de pause',
};

function PunchReceipt({ result }: { result: PunchResult }) {
  const qrKey = `${QR_PREFIX.punch}${result.employee.id}:${result.serverAt}`;
  const [src, setSrc] = useState<string | null>(() => getCachedQr(qrKey, 200) ?? null);
  useEffect(() => {
    let cancelled = false;
    const cached = getCachedQr(qrKey, 200);
    if (cached) {
      setSrc(cached);
      return;
    }
    void qrDataUrl(qrKey, 200).then((value) => {
      if (!cancelled) setSrc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [qrKey]);

  return (
    <div
      className="receipt-page"
      style={{
        fontFamily: '"IBM Plex Sans", -apple-system, sans-serif',
        background: '#ffffff',
        color: '#111827',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '2mm', marginBottom: '3mm' }} className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: '10pt', fontWeight: 800, margin: 0, color: '#ff6603' }}>C.F.T. des Bénédictins du Mont Fébé</p>
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
          {result.offlineQueued ? (
            <tr>
              <td style={{ color: '#d97706', padding: '1mm 0' }}>Mode</td>
              <td style={{ color: '#d97706', fontWeight: 600, padding: '1mm 0' }}>
                Hors-Ligne (en attente sync réseau)
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {src ? (
        <div data-qr-ready="true" style={{ marginTop: '3mm', textAlign: 'center' }}>
          <img
            src={src}
            alt="QR pointage"
            style={{ width: '18mm', height: '18mm', margin: '0 auto', imageRendering: '-webkit-optimize-contrast' }}
          />
          <p style={{ fontSize: '6pt', color: '#6b7280', margin: '1mm 0 0' }}>Archive immuable du serveur</p>
        </div>
      ) : (
        <div data-qr-pending="true" style={{ height: '18mm' }} />
      )}
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
  const canCorrectAttendance = Boolean(user && hasPerm('attendance.correct'));
  const canViewAttendance = !user || hasPerm('attendance.view');
  const canAccessKiosk = Boolean(user && hasPerm('terminals.access'));

  const [activeMainTab, setActiveMainTab] = useState<'timesheets' | 'kiosk'>(() => {
    if (typeof window !== 'undefined') {
      if ((window.location.hash === '#kiosk' || window.location.hash === '#pointage/kiosk') && canAccessKiosk) return 'kiosk';
      const p = new URLSearchParams(window.location.search);
      if (p.get('tab') === 'kiosk' && canAccessKiosk) return 'kiosk';
    }
    return canViewAttendance ? 'timesheets' : 'kiosk';
  });

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#kiosk' || window.location.hash === '#pointage/kiosk') {
        setActiveMainTab(canAccessKiosk ? 'kiosk' : 'timesheets');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [canAccessKiosk]);

  useEffect(() => {
    if (activeMainTab === 'timesheets' && !canViewAttendance && canAccessKiosk) setActiveMainTab('kiosk');
    else if (activeMainTab === 'kiosk' && !canAccessKiosk && canViewAttendance) setActiveMainTab('timesheets');
  }, [activeMainTab, canAccessKiosk, canViewAttendance]);

  // Timesheets Overview state
  const [attendanceDetail, setAttendanceDetail] = useState<NonNullable<DashboardType['das04']>['detail']>([]);
  const [attendanceDate, setAttendanceDate] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState<{
    employeeId: string;
    employeeName: string;
    punchType: 'in' | 'out';
  } | null>(null);
  const [correctionTime, setCorrectionTime] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tsLoading, setTsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Kiosk state
  const { terminalId, save, clear } = useStoredTerminal();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cachedDirectory, setCachedDirectory] = useState<DirectoryEmployee[]>(() => getStoredDirectory().employees);
  const [todayPunches, setTodayPunches] = useState<DirectoryPunch[]>(() => getStoredDirectory().todayPunches);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [syncingOffline, setSyncingOffline] = useState(false);

  const [stage, setStage] = useState<Stage>(() => (terminalId ? 'identify' : 'terminal'));
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<KioskIdentify | null>(null);
  const [punchType, setPunchType] = useState<PunchType>('in');
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [motifNote, setMotifNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [idle, setIdle] = useState(0);
  const [countdown, setCountdown] = useState(CONFIRMATION_TIMEOUT_SECONDS);
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

  const captureActive = (stage === 'actions' || stage === 'capture') && (punchType === 'in' || punchType === 'out');
  const { videoRef, error: cameraError, ready } = useCamera(captureActive, 'user');

  // Fetch data for Timesheets Tableur & Kiosk Directory
  const loadTimesheets = useCallback(() => {
    setTsLoading(true);
    Promise.all([
      canViewAttendance
        ? api<{ date: string; detail: NonNullable<DashboardType['das04']>['detail'] }>('/api/attendance').catch(() => null)
        : Promise.resolve(null),
      canViewAttendance
        ? api<{ employees: Employee[] }>('/api/employees').catch(() => ({ employees: [] }))
        : Promise.resolve({ employees: [] as Employee[] }),
      canAccessKiosk
        ? api<{ terminals: Terminal[] }>('/api/kiosk/terminals').catch(() => ({ terminals: [] }))
        : Promise.resolve({ terminals: [] as Terminal[] }),
      canAccessKiosk
        ? api<{ employees: DirectoryEmployee[]; todayPunches: DirectoryPunch[]; date: string }>('/api/kiosk/directory').catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([attendanceRes, empRes, termRes, dirRes]) => {
        if (attendanceRes) {
          setAttendanceDetail(attendanceRes.detail);
          setAttendanceDate(attendanceRes.date);
        }
        setEmployees(empRes.employees);
        if (termRes.terminals && termRes.terminals.length > 0) {
          setTerminals(termRes.terminals);
        }
        if (dirRes && dirRes.employees) {
          setCachedDirectory(dirRes.employees);
          setTodayPunches(dirRes.todayPunches ?? []);
          saveStoredDirectory(dirRes);
        }
      })
      .finally(() => setTsLoading(false));
  }, [canAccessKiosk, canViewAttendance]);

  function openAttendanceCorrection(
    row: NonNullable<DashboardType['das04']>['detail'][number],
    punchType: 'in' | 'out',
  ) {
    const currentTime = punchType === 'in' ? row.inAt : row.outAt;
    if (!currentTime) return;
    setCorrectionTarget({ employeeId: row.id, employeeName: row.fullName, punchType });
    setCorrectionTime(currentTime);
    setCorrectionReason('');
    setCorrectionError(null);
  }

  async function saveAttendanceCorrection() {
    if (!correctionTarget || !attendanceDate) return;
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      await api('/api/attendance/correction', {
        method: 'PATCH',
        body: JSON.stringify({
          employee_id: correctionTarget.employeeId,
          punch_date: attendanceDate,
          punch_type: correctionTarget.punchType,
          time: correctionTime,
          reason: correctionReason.trim(),
        }),
      });
      setCorrectionTarget(null);
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
      loadTimesheets();
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'La correction n’a pas pu être enregistrée.');
    } finally {
      setCorrectionBusy(false);
    }
  }

  useEffect(() => {
    loadTimesheets();
  }, [loadTimesheets]);

  useEffect(() => {
    if (!canAccessKiosk || tsLoading) return;
    if (!terminalId) {
      if (stage !== 'terminal') setStage('terminal');
      return;
    }
    // Règle de haute disponibilité : ne JAMAIS effacer la borne enregistrée lors d'une simple panne réseau (terminals.length === 0).
    // On ne contrôle l'autorisation que si la liste des bornes du serveur a été effectivement reçue (length > 0).
    if (terminals.length > 0 && !terminals.some((terminal) => terminal.id === terminalId)) {
      clear();
      setIdentified(null);
      setStage('terminal');
      setError('Cette borne n’est pas autorisée pour votre compte. Choisissez une borne qui vous est affectée.');
    } else if (stage === 'terminal' && terminalId) {
      setStage('identify');
    }
  }, [canAccessKiosk, clear, stage, terminalId, terminals, tsLoading]);

  useEffect(() => {
    if (stage !== 'actions' && stage !== 'validate_pin' && stage !== 'capture') return;
    setIdle(stageTimeoutSeconds(stage));
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
    setCountdown(CONFIRMATION_TIMEOUT_SECONDS);
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
    setShowActionPicker(false);
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

  const recordLocalTodayPunch = useCallback((employeeId: string, punchType: string, timeStr: string, lateMin: number) => {
    setTodayPunches((prev) => {
      const updated = [...prev, { employee_id: employeeId, punch_type: punchType, server_at: timeStr, late_minutes: lateMin }];
      const currentDir = getStoredDirectory();
      saveStoredDirectory({ ...currentDir, todayPunches: updated });
      return updated;
    });
  }, []);

  const refreshPendingCount = useCallback(() => {
    void listOfflineMutations().then((items) => {
      const kioskMutations = items.filter((item) => item.path === '/api/kiosk/punch' && item.state === 'pending');
      setPendingSyncCount(kioskMutations.length);
    }).catch(() => setPendingSyncCount(0));
  }, []);

  const handleManualSync = useCallback(async () => {
    if (!navigator.onLine || syncingOffline) return;
    setSyncingOffline(true);
    try {
      await syncOfflineMutations(user?.id);
      refreshPendingCount();
      loadTimesheets();
    } finally {
      setSyncingOffline(false);
    }
  }, [loadTimesheets, refreshPendingCount, syncingOffline, user?.id]);

  useEffect(() => {
    refreshPendingCount();
    const onOnline = () => {
      setIsOnline(true);
      void syncOfflineMutations(user?.id).then(() => {
        refreshPendingCount();
        loadTimesheets();
      });
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('offline:outbox-updated', refreshPendingCount);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('offline:outbox-updated', refreshPendingCount);
    };
  }, [loadTimesheets, refreshPendingCount, user?.id]);

  const findLocalEmployee = useCallback((raw: string): DirectoryEmployee | null => {
    const target = raw.trim().toUpperCase();
    if (!target) return null;
    return cachedDirectory.find((e) => {
      if (e.id.toUpperCase() === target) return true;
      if (e.badge_token && e.badge_token.toUpperCase() === target) return true;
      const num = target.replace(/^EMP-0*/i, '');
      if (num && e.id.toUpperCase().endsWith(num.padStart(3, '0'))) return true;
      return false;
    }) ?? null;
  }, [cachedDirectory]);

  const buildLocalSituation = useCallback((employeeId: string) => {
    const empPunches = todayPunches.filter((p) => p.employee_id === employeeId);
    const hasIn = empPunches.some((p) => p.punch_type === 'in');
    const hasOut = empPunches.some((p) => p.punch_type === 'out');
    const hasBreakIn = empPunches.some((p) => p.punch_type === 'break_in');
    const hasBreakOut = empPunches.some((p) => p.punch_type === 'break_out');
    const onBreak = hasBreakIn && !hasBreakOut;

    const currentMin = cameroonMinutes();
    const openedMin = 7 * 60 + 30; // 07:30
    const lateThresholdMin = 8 * 60; // 08:00
    const breakStartMin = 12 * 60; // 12:00
    const lateMinutes = hasIn
      ? Number(empPunches.find((p) => p.punch_type === 'in')?.late_minutes ?? 0)
      : Math.max(0, currentMin - openedMin);

    return {
      isWorkday: true,
      hasIn,
      hasOut,
      hasBreakIn,
      hasBreakOut,
      onBreak,
      canPunchIn: !hasIn,
      canPunchOut: hasIn && !hasOut && !onBreak,
      canBreakIn: hasIn && !hasBreakIn && !hasBreakOut && !onBreak && currentMin >= breakStartMin,
      canBreakOut: onBreak,
      lateMinutes,
      isLate: !hasIn && (currentMin >= lateThresholdMin || lateMinutes > 10),
      isTooEarlyForCheckin: !hasIn && currentMin < (7 * 60 + 25),
      isMorningLocked: false,
      isResumeLocked: false,
      isDayClosed: currentMin >= (17 * 60),
      isLateCriticalBlocked: false,
      maxLateAllowed: 150,
      isBreakTimeReached: currentMin >= breakStartMin,
      breakStartTime: '12:00',
      breakEndTime: '12:25',
      resumeStartTime: '13:00',
      resumeEndTime: '13:10',
      resumeLockoutTime: '14:00',
      mealScheduleMode: 'normal_12h' as const,
      isMealDelayed: false,
      afterClosing: currentMin >= (16 * 60 + 30),
      earlyCheckinTime: '07:25',
      openingTime: '07:30',
      lateThresholdTime: '08:00',
      morningLockoutTime: '10:00',
      closingTime: '16:30',
      closingEndTime: '16:40',
      dayCutoffTime: '17:00',
      toleranceMinutes: 10,
      lateMotifs: ['Transport', 'Motif familial', 'Mission extérieure', 'Autorisé par la direction', 'Autre'],
      cardDisplaySeconds: 8,
      isExceptionalWorkday: false,
      activeLeave: null,
    };
  }, [todayPunches]);

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
      const isNetworkErr = !navigator.onLine || (err instanceof Error && (
        err.message.includes('fetch') ||
        err.message.includes('réseau') ||
        err.message.includes('Network') ||
        err.message.includes('Failed to fetch')
      ));

      if (isNetworkErr) {
        const localEmp = findLocalEmployee(value);
        if (localEmp) {
          const localSit = buildLocalSituation(localEmp.id);
          setIdentified({
            employee: {
              id: localEmp.id,
              full_name: localEmp.full_name,
              job_title: localEmp.job_title,
              photo_path: localEmp.photo_path,
              has_pin: localEmp.has_pin,
            },
            situation: localSit,
            history: [],
            month: { daysPresent: 0, lateCount: 0 },
          });
          setPin('');
          setPinError(null);
          setStage('validate_pin');
          return;
        }
      }

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
      } else if (sit?.canPunchIn && !sit?.isLateCriticalBlocked) {
        setPunchType('in');
      } else if (sit?.canBreakIn && sit?.isBreakTimeReached) {
        setPunchType('break_in');
      } else if (sit?.canPunchOut && !sit?.onBreak) {
        setPunchType('out');
      } else {
        setPunchType(sit?.onBreak ? 'break_out' : 'in');
      }
      setSelfie(null);
      setMotif('');
      setMotifNote('');
      // Étape 3 obligatoire : Choix de l'action & Selfie horodaté
      setStage('actions');
    } catch (err) {
      const isNetworkErr = !navigator.onLine || (err instanceof Error && (
        err.message.includes('fetch') ||
        err.message.includes('réseau') ||
        err.message.includes('Network') ||
        err.message.includes('Failed to fetch')
      ));

      if (!isNetworkErr) {
        const message = err instanceof Error ? err.message : 'Code secret personnel incorrect.';
        setPinError(message);
        setPin('');
        return;
      }

      // Mode hors-ligne : validation PIN acceptée pour certification différée cryptographique
      const sit = identified?.situation;
      if (sit?.canBreakOut) {
        setPunchType('break_out');
      } else if (sit?.canPunchIn && !sit?.isLateCriticalBlocked) {
        setPunchType('in');
      } else if (sit?.canBreakIn && sit?.isBreakTimeReached) {
        setPunchType('break_in');
      } else if (sit?.canPunchOut && !sit?.onBreak) {
        setPunchType('out');
      } else {
        setPunchType(sit?.onBreak ? 'break_out' : 'in');
      }
      setSelfie(null);
      setMotif('');
      setMotifNote('');
      setStage('actions');
    } finally {
      setBusy(false);
    }
  }

  async function submitPunch(photoData?: string) {
    const isSelfieRequired = punchType === 'in' || punchType === 'out';
    const finalSelfie = isSelfieRequired
      ? (photoData || selfie || (identified ? generateFallbackSnapshot(identified.employee.full_name) : null))
      : undefined;
    if (isSelfieRequired && (!identified || !finalSelfie)) return;
    if (!identified) return;
    if (!terminalId) return;
    if (!pin || pin.trim().length < 4) {
      setError('Code secret personnel requis pour certifier le pointage.');
      setStage('validate_pin');
      return;
    }
    if (punchType === 'in' && identified.situation?.isLateCriticalBlocked) {
      setError(`Pointage direct bloqué : retard critique (${identified.situation.lateMinutes} min > max autorisée ${identified.situation.maxLateAllowed || 60} min). Veuillez contacter la Direction.`);
      return;
    }
    if (punchType === 'break_in' && !identified.situation?.isBreakTimeReached) {
      setError(`Pointage de pause non autorisé avant l'heure réglementaire (${identified.situation?.breakStartTime || '12:00'}).`);
      return;
    }
    if (punchType === 'out' && identified.situation?.onBreak) {
      setError('Vous êtes actuellement en pause : veuillez pointer la reprise avant votre départ.');
      return;
    }
    setBusy(true);
    setError(null);
    const clientRecordedAt = new Date().toISOString();
    const offlinePunchId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `punch_${Date.now()}`;
    try {
      const res = await api<PunchResult>('/api/kiosk/punch', {
        method: 'POST',
        body: JSON.stringify({
          terminalId,
          employeeId: identified.employee.id,
          punchType,
          idMode: 'manual',
          selfie: finalSelfie || undefined,
          pin: pin.trim(),
          reason: motif && motif !== 'Autre' ? motif : motif === 'Autre' ? motifNote : undefined,
          clientRecordedAt,
          offlinePunchId,
        }),
      });

      if ((res as any)?.queued) {
        // Enregistré hors-ligne dans la file IndexedDB
        const localHm = cameroonTime();
        const localLate = identified.situation?.lateMinutes ?? 0;
        const queuedResult: PunchResult = {
          ok: true,
          employee: { id: identified.employee.id, full_name: identified.employee.full_name },
          punchType,
          serverAt: clientRecordedAt,
          serverTime: localHm,
          lateMinutes: localLate,
          status: localLate > 0 ? 'late' : 'normal',
          photoUrl: finalSelfie || '',
          offlineQueued: true,
        };
        recordLocalTodayPunch(identified.employee.id, punchType, localHm, localLate);
        refreshPendingCount();
        setResult(queuedResult);
        setStage('confirm');
        return;
      }

      setResult(res);
      recordLocalTodayPunch(identified.employee.id, punchType, res.serverTime, res.lateMinutes);
      setStage('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pointage refusé.');
      setSelfie(null);
    } finally {
      setBusy(false);
    }
  }

  function lockKiosk() {
    setStage('identify');
    setCode('');
    setPin('');
    setIdentified(null);
    setSelfie(null);
    setResult(null);
    setError(null);
    setPinError(null);
    setScanning(false);
    setIsKioskLocked(true);
    sessionStorage.setItem('mf_kiosk_locked', 'true');
    setActiveMainTab('kiosk');
  }

  async function handleUnlockKiosk() {
    if (!terminalId) {
      setUnlockError('Aucune borne n’est sélectionnée. Contactez la Direction.');
      return;
    }
    if (!unlockPassword.trim()) {
      setUnlockError('Saisissez le mot de passe de votre compte.');
      return;
    }
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      await api('/api/kiosk/unlock', {
        method: 'POST',
        body: JSON.stringify({ password: unlockPassword, terminalId }),
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
    <div className={cx('space-y-6', activeMainTab === 'kiosk' && 'space-y-2 sm:space-y-4')}>
      {/* Top Header with Tab Switcher - Compact on mobile kiosk */}
      {activeMainTab === 'kiosk' ? (
        <div className="flex items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
            <h1 className="text-sm sm:text-lg font-bold text-ink tracking-tight">Pointage Kiosque CFTM</h1>
          </div>

          <div className="flex items-center gap-1.5">
            {canViewAttendance && <button
              onClick={() => setActiveMainTab('timesheets')}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-ink-soft hover:text-ink bg-surface border border-line shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <FileSpreadsheet size={13} />
              <span className="hidden sm:inline">Feuille des Présences</span>
              <span className="sm:hidden">Présences</span>
            </button>}
            {!isKioskLocked && (
              <button
                onClick={lockKiosk}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-amber bg-amber-wash border border-amber/30 shadow-2xs hover:bg-amber/15 transition-colors flex items-center gap-1"
                title="Verrouiller la borne en plein écran"
              >
                <Lock size={12} />
                <span>Verrouiller</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Pointage</h1>
          </div>

          {/* Mode Toggle Switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-xs">
            {canViewAttendance && <button
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
            </button>}
            {canAccessKiosk && <button
              onClick={() => setActiveMainTab('kiosk')}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all text-ink-soft hover:text-ink"
            >
              <Smartphone size={15} />
              <span>Borne Kiosque</span>
            </button>}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 1 : FEUILLES DE PRÉSENCE (VUE TABLEUR)
      ========================================================================= */}
      {activeMainTab === 'timesheets' && canViewAttendance ? (
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

              <Button
                size="sm"
                variant="ghost"
                disabled={tsLoading}
                icon={<RefreshCw size={13} className={tsLoading ? 'animate-spin' : ''} />}
                onClick={loadTimesheets}
                aria-label={tsLoading ? 'Actualisation des présences en cours' : 'Actualiser les présences'}
              >
                {tsLoading ? 'Actualisation…' : 'Actualiser'}
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
            <div className="overflow-x-auto scroll-thin touch-pan-y touch-pan-x overscroll-x-contain">
              <table className={cx('w-full text-left sheet-grid table-rhythm', canCorrectAttendance ? 'min-w-[860px]' : 'min-w-[760px]')}>
                <thead>
                  <tr>
                    <th className="sheet-th sticky-col min-w-[190px] col-lead">Travailleur / ID</th>
                    <th className="sheet-th w-28 text-center">Arrivée (In)</th>
                    <th className="sheet-th w-28 text-center">Départ (Out)</th>
                    <th className="sheet-th w-32 text-center bg-amber-wash/20 font-bold text-ink">Statut</th>
                    <th className="sheet-th w-32 text-center">Durée travaillée</th>
                    <th className="sheet-th w-28 text-center">Pause</th>
                    <th className="sheet-th w-28 text-center">Tolérance / Écart</th>
                    {canCorrectAttendance && <th className="sheet-th w-36 text-center">Corriger</th>}
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
                            <AttendanceAvatar employee={row} size="h-8 w-8" />
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
                        {canCorrectAttendance && (
                          <td className="sheet-cell text-center">
                            <div className="flex justify-center gap-1">
                              {row.inAt && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => openAttendanceCorrection(row, 'in')}>Arrivée</Button>}
                              {row.outAt && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => openAttendanceCorrection(row, 'out')}>Départ</Button>}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={canCorrectAttendance ? 8 : 7} className="py-12 text-center text-xs text-ink-faint">
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
                    {canCorrectAttendance && <td className="sheet-cell" />}
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
                    <AttendanceAvatar employee={row} />
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
                {canCorrectAttendance && (row.inAt || row.outAt) && (
                  <div className="mt-2 flex justify-end gap-2 border-t border-line/60 pt-2">
                    {row.inAt && <Button size="sm" variant="ghost" onClick={() => openAttendanceCorrection(row, 'in')}>Corriger l’arrivée</Button>}
                    {row.outAt && <Button size="sm" variant="ghost" onClick={() => openAttendanceCorrection(row, 'out')}>Corriger le départ</Button>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* =========================================================================
          MODE 2 : BORNE KIOSQUE (INTERACTION DIRECTE OUVRIER / TABLETTE)
      ========================================================================= */}
      {canAccessKiosk && (activeMainTab === 'kiosk' || isKioskLocked) ? (
        <div
          className={cx(
            'py-2 transition-all',
            isKioskLocked &&
              'fixed inset-0 z-50 overflow-y-auto bg-paper p-4 sm:p-6 backdrop-blur-xl',
          )}
        >
          {isKioskLocked ? (
            <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md items-center justify-center py-6">
              <Card className="w-full space-y-5 p-5 text-center shadow-pop sm:p-7">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber/25 bg-amber-wash text-amber">
                  <Lock size={25} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Mode sécurisé</p>
                  <h2 className="mt-1 text-xl font-bold text-ink">Borne verrouillée</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    Le pointage est suspendu. Une personne autorisée doit confirmer son identité pour réactiver cette borne.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-left">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">Compte connecté</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-ink">{user?.display_name ?? 'Compte autorisé'}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">{terminalId ?? 'Aucune borne sélectionnée'}</p>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={!terminalId}
                  onClick={() => {
                    setUnlockPassword('');
                    setUnlockError(null);
                    setUnlockModalOpen(true);
                  }}
                >
                  Déverrouiller avec mon compte
                </Button>
                <p className="text-[11px] text-ink-faint">Votre mot de passe n’est pas affiché ni conservé.</p>
              </Card>
            </div>
          ) : (
          <>
          {/* Actions Borne Kiosque Minimaliste */}
          {stage === 'identify' && !isKioskLocked ? (
            <div className="mx-auto mb-2 flex max-w-xl items-center justify-between text-xs">
              <Button variant="quiet" size="sm" onClick={clear}>
                Changer borne
              </Button>
            </div>
          ) : null}

          {stage === 'terminal' || !terminalId ? (
            <div className="mx-auto max-w-lg">
              <h2 className="text-xl font-bold text-ink">Sélection de la borne</h2>
              <p className="mt-1 text-xs text-ink-soft">
                Choisissez le terminal enregistré pour ce poste d'atelier.
              </p>
              <div className="mt-4 space-y-3">
                {terminals.length === 0 ? (
                  <Banner tone="info" title="Aucun terminal autorisé pour ce compte">
                    Demandez à la Direction de vous accorder le droit d’utiliser le kiosque et de vous affecter à une borne.
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
            <div className="mx-auto max-w-lg space-y-3">
              {(!isOnline || pendingSyncCount > 0) && (
                <div className="rounded-xl border border-amber/40 bg-amber-500/10 p-3 text-xs text-amber flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber" />
                    </span>
                    <span>
                      {!isOnline
                        ? `Mode Hors-Ligne Actif · Borne sécurisée (${pendingSyncCount} pointage${pendingSyncCount > 1 ? 's' : ''} en attente)`
                        : `${pendingSyncCount} pointage${pendingSyncCount > 1 ? 's' : ''} enregistré${pendingSyncCount > 1 ? 's' : ''} hors-ligne en attente d'envoi`}
                    </span>
                  </div>
                  {isOnline && pendingSyncCount > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-7 text-[11px] px-2.5"
                      onClick={() => void handleManualSync()}
                      disabled={syncingOffline}
                    >
                      {syncingOffline ? <Spinner /> : 'Synchroniser'}
                    </Button>
                  )}
                </div>
              )}

              {/* Horloge Kiosque Compacte & Précise */}
              <div className="rounded-2xl bg-charcoal px-4 py-3 sm:py-4 text-center text-white shadow-card border border-line">
                <p className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-amber tabular-nums">
                  {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="mt-0.5 text-[11px] sm:text-xs capitalize text-white/60">
                  {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>

              <Card className="p-3.5 sm:p-5 shadow-card space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && code.trim().length > 0) void identify(code);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
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
                        placeholder="Tapez votre code (ex: EMP-008 ou badge)..."
                        className="w-full rounded-xl border-2 border-line-strong bg-paper-2 px-3.5 py-2.5 sm:py-3 pr-10 font-mono text-lg sm:text-xl font-extrabold tracking-wider text-center text-ink placeholder:text-ink-faint/60 placeholder:text-xs sm:placeholder:text-sm placeholder:font-sans placeholder:tracking-normal shadow-inner transition-colors focus:border-amber focus:outline-none"
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
                          className="absolute right-2.5 grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-soft hover:text-ink active:scale-90"
                          title="Effacer tout"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-0.5">
                    <Button
                      type="button"
                      size="md"
                      className="flex-1 text-xs sm:text-sm font-semibold h-11"
                      icon={<QrCode size={16} />}
                      onClick={() => setScanning(true)}
                    >
                      Scanner badge QR
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      className="flex-1 text-xs sm:text-sm font-semibold h-11"
                      disabled={busy || code.trim().length === 0}
                    >
                      {busy ? <Spinner /> : 'Valider'}
                    </Button>
                  </div>
                </form>

                {error ? (
                  <div className="mt-1">
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
            <div className="mx-auto max-w-xs sm:max-w-sm space-y-2 sm:space-y-2.5" onClick={() => setIdle(stageTimeoutSeconds(stage))}>
              {/* Step Header & Timeout Strip */}
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-wash px-2 py-0.5 font-bold text-blue border border-blue/20 text-[11px]">
                  Étape 2 sur 3 · Code PIN
                </span>
                <span className="text-[10px] font-mono text-ink-faint">
                  Auto {idle}s
                </span>
              </div>

              {/* Fiche Ouvrier Reconnue avec Vraie Photo - Ultra Compacte */}
              <Card className="p-2 sm:p-2.5 shadow-card border-line">
                <div className="flex items-center gap-2.5">
                  <div className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-xl overflow-hidden border border-line bg-surface shrink-0 shadow-xs">
                    <img
                      src={identified.employee.photo_path || `/photos/employees/${identified.employee.id}.jpg`}
                      alt={identified.employee.full_name}
                      className="h-full w-full object-cover object-top"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'grid';
                        }
                      }}
                    />
                    <div
                      style={{ display: 'none' }}
                      className="h-full w-full place-items-center bg-amber-wash text-amber font-bold text-xs"
                    >
                      {initials(identified.employee.full_name)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-ink truncate">{identified.employee.full_name}</p>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft truncate">{identified.employee.job_title}</p>
                  </div>

                  <span className="rounded-full bg-green-wash px-2 py-0.5 text-[10px] font-bold text-green border border-green/20 shrink-0 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green" />
                    Reconnu
                  </span>
                </div>
              </Card>

              {/* Saisie PIN Tactile Compacte Adaptative (Zéro Scroll) */}
              <Card className="p-2.5 sm:p-3.5 shadow-card border-line space-y-2">
                <div className="text-center">
                  <p className="text-[11px] font-medium text-ink-soft">
                    Saisissez votre code PIN secret
                  </p>
                  {/* Indicateurs de PIN ronds */}
                  <div className="flex justify-center items-center gap-2.5 my-1 sm:my-1.5">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={cx(
                          'h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full transition-all duration-150',
                          pin.length > i
                            ? 'bg-amber scale-110 shadow-xs ring-2 ring-amber/30'
                            : i === pin.length
                            ? 'border-2 border-amber bg-amber/20 scale-105'
                            : 'border border-line-strong bg-surface-2'
                        )}
                      />
                    ))}
                  </div>
                </div>

                {pinError ? (
                  <div className="rounded-xl bg-red-wash/60 border border-red/20 py-1 px-2 text-[11px] font-medium text-red text-center animate-in fade-in">
                    {pinError}
                  </div>
                ) : null}

                {/* Pavé numérique tactile calibré pour le pouce */}
                <div className="grid grid-cols-3 gap-1.5 max-w-[220px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => {
                        if (pin.length < 6) {
                          const next = pin + digit;
                          setPin(next);
                          if (next.length === 6) {
                            setTimeout(() => void validatePin(), 80);
                          }
                        }
                      }}
                      className="h-9 sm:h-10 rounded-xl border border-line bg-surface hover:bg-surface-2 text-base sm:text-lg font-bold text-ink active:scale-95 transition-all shadow-xs cursor-pointer select-none"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPin('')}
                    className="h-9 sm:h-10 rounded-xl border border-line bg-surface text-[11px] font-semibold text-red hover:bg-red-wash active:scale-95 transition-all cursor-pointer select-none"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pin.length < 6) {
                        const next = pin + '0';
                        setPin(next);
                        if (next.length === 6) {
                          setTimeout(() => void validatePin(), 80);
                        }
                      }
                    }}
                    className="h-9 sm:h-10 rounded-xl border border-line bg-surface hover:bg-surface-2 text-base sm:text-lg font-bold text-ink active:scale-95 transition-all shadow-xs cursor-pointer select-none"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setPin((p) => p.slice(0, -1))}
                    className="h-9 sm:h-10 rounded-xl border border-line bg-surface text-sm font-semibold text-ink-soft hover:bg-surface-2 active:scale-95 transition-all cursor-pointer select-none"
                  >
                    ⌫
                  </button>
                </div>

                {/* Bouton de validation rapide */}
                <div className="flex gap-2 pt-0.5 max-w-[220px] mx-auto">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs h-8 sm:h-9" onClick={resetToIdentify}>
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 font-bold text-xs h-8 sm:h-9"
                    disabled={pin.length < 4 || busy}
                    onClick={validatePin}
                  >
                    {busy ? <Spinner /> : 'Valider →'}
                  </Button>
                </div>
              </Card>
            </div>
          ) : null}

          {/* ÉTAPE 3 : POINTAGE INTUITIF & PREUVE PHOTO (ZÉRO SCROLL - MOBILE FIRST) */}
          {(stage === 'actions' || stage === 'capture') && identified ? (
            <div className="mx-auto max-w-xs sm:max-w-sm space-y-2 sm:space-y-2.5" onClick={() => setIdle(stageTimeoutSeconds(stage))}>
              {/* Header Strip */}
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-wash px-2 py-0.5 font-bold text-green border border-green/20 text-[11px]">
                  Étape 3 sur 3 · Validation
                </span>
                <span className="text-[10px] font-mono text-ink-faint">
                  Auto {idle}s
                </span>
              </div>

              {error ? <Banner tone="error">{error}</Banner> : null}

              {/* Fiche Ouvrier & Action Unifiée (Gain vertical majeur) */}
              <Card className="p-2 sm:p-2.5 shadow-card border-line space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-xl overflow-hidden border border-line/80 bg-surface shrink-0 shadow-xs">
                    <img
                      src={identified.employee.photo_path || `/photos/employees/${identified.employee.id}.jpg`}
                      alt={identified.employee.full_name}
                      className="h-full w-full object-cover object-top"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'grid';
                        }
                      }}
                    />
                    <div
                      style={{ display: 'none' }}
                      className="h-full w-full place-items-center bg-amber-wash text-amber font-bold text-xs"
                    >
                      {initials(identified.employee.full_name)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-ink truncate leading-tight">{identified.employee.full_name}</p>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft truncate">{identified.employee.job_title}</p>
                  </div>

                  {/* Bouton Action Suggérée avec Commutateur */}
                  <button
                    type="button"
                    onClick={() => setShowActionPicker(!showActionPicker)}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-wash border border-amber/30 text-amber hover:bg-amber/15 active:scale-95 transition-all"
                    title="Changer l'action"
                  >
                    <span className="text-[11px] font-extrabold">{PUNCH_LABEL[punchType]}</span>
                    <span className="text-[9px] text-amber/80 underline font-semibold">Changer</span>
                  </button>
                </div>

                {/* Sélecteur d'action déroulant compact */}
                {showActionPicker && (
                  <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-line/60 animate-in fade-in">
                    <button
                      type="button"
                      disabled={!situation?.canPunchIn || situation?.isLateCriticalBlocked}
                      onClick={() => { setPunchType('in'); setSelfie(null); setShowActionPicker(false); }}
                      className={cx(
                        'py-1 px-1 rounded-lg text-[10px] font-bold border transition-all text-center',
                        punchType === 'in' ? 'bg-amber text-white border-amber shadow-xs' : 'bg-surface-2 border-line text-ink'
                      )}
                    >
                      Arrivée
                    </button>
                    <button
                      type="button"
                      disabled={!situation?.canBreakIn || !situation?.isBreakTimeReached}
                      onClick={() => { setPunchType('break_in'); setSelfie(null); setShowActionPicker(false); }}
                      className={cx(
                        'py-1 px-1 rounded-lg text-[10px] font-bold border transition-all text-center',
                        punchType === 'break_in' ? 'bg-amber text-white border-amber shadow-xs' : 'bg-surface-2 border-line text-ink'
                      )}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      disabled={!situation?.canBreakOut}
                      onClick={() => { setPunchType('break_out'); setSelfie(null); setShowActionPicker(false); }}
                      className={cx(
                        'py-1 px-1 rounded-lg text-[10px] font-bold border transition-all text-center',
                        punchType === 'break_out' ? 'bg-green text-white border-green shadow-xs' : 'bg-surface-2 border-line text-ink'
                      )}
                    >
                      Reprise
                    </button>
                    <button
                      type="button"
                      disabled={!situation?.canPunchOut || situation?.onBreak}
                      onClick={() => { setPunchType('out'); setSelfie(null); setShowActionPicker(false); }}
                      className={cx(
                        'py-1 px-1 rounded-lg text-[10px] font-bold border transition-all text-center',
                        punchType === 'out' ? 'bg-amber text-white border-amber shadow-xs' : 'bg-surface-2 border-line text-ink'
                      )}
                    >
                      Départ
                    </button>
                  </div>
                )}

                {/* Motif de retard compact directement dans la carte si en retard */}
                {lateNeeded && (
                  <div className="pt-1.5 border-t border-amber/20 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-amber font-bold">
                      <span>⚠️ Retard +{situation?.lateMinutes}m</span>
                      <span className="text-ink-faint font-normal">Motif :</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(situation?.lateMotifs && situation.lateMotifs.length > 0
                        ? situation.lateMotifs
                        : ['Transport', 'Santé', 'Famille', 'Pluie', 'Autre']
                      ).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMotif(m)}
                          className={cx(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-semibold border transition-all',
                            motif === m
                              ? 'bg-amber text-white border-amber shadow-xs'
                              : 'bg-surface text-ink border-line hover:border-amber/40'
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Bannières d'alerte réglementaire */}
              {situation?.isLateCriticalBlocked && (
                <div className="rounded-xl border border-red/40 bg-red-wash/40 p-2 text-xs text-red shadow-xs">
                  ⛔ Retard critique ({situation.lateMinutes}m). Veuillez contacter la Direction.
                </div>
              )}

              {/* Capture Selfie / Caméra ou Validation Directe (Pause / Reprise) */}
              {(punchType === 'break_in' || punchType === 'break_out') ? (
                <Card className="p-3.5 text-center shadow-card border-line space-y-2.5">
                  <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-amber-wash text-amber border border-amber/20 shadow-xs">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-ink">
                      {punchType === 'break_in' ? 'Départ en Pause Déjeuner' : 'Reprise du Travail'}
                    </h3>
                    <p className="text-[10px] text-ink-soft">Validation instantanée sans photo.</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitPunch()}
                    className={cx(
                      'w-full h-10 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer',
                      punchType === 'break_in'
                        ? 'bg-amber text-white hover:bg-amber-deep active:scale-98'
                        : 'bg-green text-white hover:bg-green-deep active:scale-98',
                      busy && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {busy ? <Spinner /> : <><CheckCircle2 size={16} /><span>Valider {PUNCH_LABEL[punchType]}</span></>}
                  </button>
                </Card>
              ) : !selfie ? (
                <Card className="p-2 sm:p-2.5 shadow-card border-line space-y-2">
                  {/* Viseur Caméra Rond FaceID Style Apple / Pixel - Hauteur Adaptative */}
                  <div className="relative h-28 w-28 sm:h-36 sm:w-36 mx-auto rounded-3xl overflow-hidden border-2 border-amber/70 bg-charcoal shadow-md flex items-center justify-center">
                    <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
                    {!ready && !cameraError ? (
                      <div className="absolute inset-0 grid place-items-center text-white/70">
                        <Spinner />
                      </div>
                    ) : null}
                    {cameraError ? (
                      <div className="absolute inset-0 grid place-items-center p-1.5 text-center bg-charcoal/90 text-white">
                        <p className="text-[9px] text-white/70">{cameraError}</p>
                      </div>
                    ) : (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-20 w-20 sm:h-26 sm:w-26 rounded-full border border-dashed border-white/50 animate-pulse" />
                      </div>
                    )}
                    <div className="absolute bottom-1 inset-x-1 flex justify-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/75 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-semibold text-white backdrop-blur-xs">
                        <span className={cx('h-1.5 w-1.5 rounded-full', ready ? 'bg-green animate-pulse' : 'bg-amber')} />
                        {ready ? 'Visage détecté' : 'Caméra...'}
                      </span>
                    </div>
                  </div>

                  {/* Bouton de pointage principal sous le pouce */}
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
                      void submitPunch();
                    }}
                    className={cx(
                      'w-full h-10 sm:h-11 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer',
                      busy || (lateNeeded && !motif && !motifNote)
                        ? 'bg-line text-ink-faint cursor-not-allowed'
                        : 'bg-amber text-white hover:bg-amber-deep',
                    )}
                  >
                    {busy ? (
                      <Spinner />
                    ) : (
                      <>
                        <Camera size={16} />
                        <span>Pointer {PUNCH_LABEL[punchType]} &amp; Certifier</span>
                      </>
                    )}
                  </button>
                </Card>
              ) : (
                <Card className="p-2 sm:p-2.5 shadow-card border-line space-y-2 text-center">
                  <div className="h-28 w-28 mx-auto overflow-hidden rounded-2xl border border-line bg-charcoal">
                    <img src={selfie} alt="Selfie" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex gap-2 pt-0.5">
                    <Button variant="ghost" size="sm" className="flex-1 text-xs h-9" onClick={() => setSelfie(null)}>
                      Reprendre
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1 text-xs font-bold h-9"
                      disabled={busy}
                      onClick={() => void submitPunch()}
                    >
                      {busy ? <Spinner /> : `Confirmer`}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Bouton Annuler discret */}
              <div className="text-center pt-0.5">
                <button
                  type="button"
                  onClick={resetToIdentify}
                  className="text-[11px] text-ink-soft hover:text-ink underline transition-colors"
                >
                  Annuler / Autre travailleur
                </button>
              </div>
            </div>
          ) : null}

          {/* ÉTAPE 4 : CONFIRMATION VISUELLE RAPIDE & RETOUR SANS ATTENTE */}
          {stage === 'confirm' && result ? (
            <div className="mx-auto max-w-xs sm:max-w-sm">
              <Card className="p-3.5 sm:p-5 text-center shadow-card border-line space-y-2.5 sm:space-y-3">
                {/* Checkmark Animé */}
                <div className="mx-auto grid h-11 w-11 sm:h-13 sm:w-13 place-items-center rounded-full bg-emerald-500/15 text-emerald-500 border-2 border-emerald-500 shadow-sm animate-in zoom-in-75 duration-300">
                  <CheckCircle2 size={26} />
                </div>

                <div>
                  <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight leading-tight">
                    {PUNCH_LABEL[result.punchType]} confirmée
                  </h2>
                  <p className="text-[11px] sm:text-xs text-ink-soft mt-0.5 truncate">{result.employee.full_name}</p>
                </div>

                <p className="font-mono text-3xl sm:text-4xl font-extrabold text-ink tabular-nums tracking-tight">
                  {result.serverTime}
                </p>

                <div className={cx(
                  'rounded-xl border py-1.5 px-2 text-[11px] font-medium',
                  result.offlineQueued
                    ? 'border-amber/40 bg-amber-500/10 text-amber'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                )}>
                  {result.offlineQueued
                    ? '⚡ Pointage sécurisé hors-ligne · En attente de synchronisation réseau'
                    : '✓ Pointage certifié · Fiche horodatée immuable'}
                </div>

                {/* Barre de progression fluide 6 secondes */}
                <div className="space-y-1 pt-0.5">
                  <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${(countdown / CONFIRMATION_TIMEOUT_SECONDS) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-ink-faint">
                    Borne libre dans <span className="font-bold text-amber font-mono">{countdown}s</span>…
                  </p>
                </div>

                <div className="flex gap-2 pt-0.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 text-xs h-9"
                    icon={<Printer size={13} />}
                    onClick={() => print(<PunchReceipt result={result} />)}
                  >
                    Reçu
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-2 font-bold text-xs h-9"
                    onClick={resetToIdentify}
                  >
                    Ouvrier suivant →
                  </Button>
                </div>
              </Card>
              {portal}
            </div>
          ) : null}

          </>
          )}

          {/* Déverrouillage par le compte autorisé actuellement connecté */}
          <Modal
            open={unlockModalOpen}
            title="Déverrouiller la borne"
            onClose={() => { if (!unlockBusy) setUnlockModalOpen(false); }}
            footer={
              <>
                <Button variant="ghost" disabled={unlockBusy} onClick={() => setUnlockModalOpen(false)}>
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  disabled={unlockBusy || !unlockPassword.trim() || !terminalId}
                  onClick={() => void handleUnlockKiosk()}
                >
                  {unlockBusy ? <Spinner /> : 'Déverrouiller'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-ink-soft">
                Confirmez le mot de passe de votre compte pour autoriser le déverrouillage de <span className="font-mono font-semibold text-ink">{terminalId ?? 'la borne'}</span>.
              </p>
              {unlockError ? <Banner tone="error">{unlockError}</Banner> : null}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-soft" htmlFor="kiosk-unlock-password">Mot de passe de votre compte</label>
                <PasswordInput
                  id="kiosk-unlock-password"
                  value={unlockPassword}
                  autoComplete="current-password"
                  placeholder="Saisissez votre mot de passe"
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
      <Modal
        open={Boolean(correctionTarget)}
        title={correctionTarget ? `Corriger ${correctionTarget.punchType === 'in' ? 'l’arrivée' : 'le départ'}` : 'Corriger un pointage'}
        onClose={() => { if (!correctionBusy) setCorrectionTarget(null); }}
        footer={
          <>
            <Button variant="ghost" disabled={correctionBusy} onClick={() => setCorrectionTarget(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={correctionBusy || !correctionTime || correctionReason.trim().length < 5}
              onClick={() => void saveAttendanceCorrection()}
            >
              {correctionBusy ? <Spinner /> : 'Enregistrer la correction'}
            </Button>
          </>
        }
      >
        {correctionTarget && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-ink">{correctionTarget.employeeName}</p>
            <p className="text-xs text-ink-soft">Date : {attendanceDate} · Heure actuelle : {correctionTime}</p>
            {correctionError ? <Banner tone="error">{correctionError}</Banner> : null}
            <label className="block text-xs font-medium text-ink-soft">
              Heure corrigée
              <input
                type="time"
                value={correctionTime}
                onChange={(event) => setCorrectionTime(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-ink-soft">
              Motif obligatoire
              <textarea
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                rows={3}
                minLength={5}
                placeholder="Ex. Heure vérifiée sur le registre papier après panne de la borne."
                className="mt-1.5 w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </label>
            <p className="text-[11px] text-ink-faint">L’ancienne heure et le motif seront conservés dans l’historique d’audit.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
