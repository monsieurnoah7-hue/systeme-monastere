import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, type KioskIdentify, type PunchResult, type PunchType } from '../lib/api';
import { QR_PREFIX, qrDataUrl } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { initials } from '../lib/labels';
import { Banner, Button, Card, Spinner, cx } from '../components/ui';
import { IconCamera, IconCheck, IconClock, IconLock, IconPrinter, IconQr, IconRefresh, IconUser, IconX } from '../components/Icons';

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
      style={{ fontFamily: '"IBM Plex Sans", sans-serif', background: '#ffffff', color: '#17181b' }}
    >
      <div style={{ borderBottom: '1px solid #d3cabd', paddingBottom: '2mm', marginBottom: '3mm' }}>
        <p style={{ fontSize: '10pt', fontWeight: 600, margin: 0 }}>Menuiserie — Mont Fèbè</p>
        <p style={{ fontSize: '7pt', color: '#5b5651', margin: '0.5mm 0 0' }}>
          Fiche de pointage — {PUNCH_LABEL[result.punchType]}
        </p>
      </div>
      <table style={{ fontSize: '8pt', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ color: '#5b5651', padding: '1mm 0' }}>Travailleur</td>
            <td style={{ fontWeight: 600, padding: '1mm 0' }}>{result.employee.full_name}</td>
          </tr>
          <tr>
            <td style={{ color: '#5b5651', padding: '1mm 0' }}>Identifiant</td>
            <td style={{ fontFamily: '"IBM Plex Mono", monospace', padding: '1mm 0' }}>{result.employee.id}</td>
          </tr>
          <tr>
            <td style={{ color: '#5b5651', padding: '1mm 0' }}>Heure serveur</td>
            <td style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, padding: '1mm 0' }}>
              {result.serverTime}
            </td>
          </tr>
          <tr>
            <td style={{ color: '#5b5651', padding: '1mm 0' }}>Statut</td>
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
          <p style={{ fontSize: '6pt', color: '#5b5651', margin: '1mm 0 0' }}>Référence du pointage (archive)</p>
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
      setError('Caméra indisponible : ce terminal n’expose aucune caméra (contexte non sécurisé ou matériel absent).');
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
          setError('Accès caméra refusé : autorisez la caméra dans le navigateur, puis réessayez.');
        } else if (name === 'NotFoundError') {
          setError('Aucune caméra détectée sur ce terminal.');
        } else {
          setError('Caméra indisponible : vérifiez le matériel ou utilisez un autre terminal.');
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
        <p className="text-sm font-medium">Présentez le badge devant la caméra</p>
        <button
          onClick={onClose}
          className="rounded-btn p-2 text-white/70 transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="Fermer le scanner"
        >
          <IconX size={18} />
        </button>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-12">
          <div className="absolute inset-0 rounded-lg border-2 border-amber/50" />
          <span className="absolute -left-0.5 -top-0.5 h-7 w-7 border-l-4 border-t-4 border-amber" />
          <span className="absolute -right-0.5 -top-0.5 h-7 w-7 border-r-4 border-t-4 border-amber" />
          <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 border-b-4 border-l-4 border-amber" />
          <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 border-b-4 border-r-4 border-amber" />
          <div className="scan-laser absolute inset-x-3 top-2 h-0.5 rounded-full bg-amber shadow-[0_0_14px_var(--color-amber)]" />
        </div>
        {error ? (
          <div className="absolute inset-x-6 bottom-24">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
      </div>
      <footer className="border-t border-white/10 px-4 py-4 text-center text-[13px] text-white/60">
        Le badge contient un jeton aléatoire : il ne donne aucun accès aux données.
      </footer>
    </div>
  );
}

function Keypad({ value, onChange, onSubmit }: { value: string; onChange: (next: string) => void; onSubmit: () => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === 'C') onChange('');
            else if (key === 'OK') onSubmit();
            else if (value.length < 8) onChange(value + key);
          }}
          className={cx(
            'h-14 rounded-btn border text-lg font-semibold transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.96]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/40 focus-visible:ring-offset-1',
            key === 'OK'
              ? 'border-amber bg-amber text-white hover:bg-amber-2 active:bg-amber-2'
              : key === 'C'
                ? 'border-line-strong bg-surface-2 text-ink-soft hover:bg-grey-wash'
                : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

export function Pointage() {
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

  useEffect(() => {
    api<{ terminals: Terminal[] }>('/api/kiosk/terminals')
      .then((res) => setTerminals(res.terminals))
      .catch(() => setTerminals([]));
  }, []);

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
    punchType === 'in' &&
    !!situation &&
    situation.lateMinutes > situation.toleranceMinutes;

  const progress = stage === 'card' ? (idle / AUTO_RETURN_SECONDS) * 100 : 100;

  if (stage === 'terminal' || !terminalId) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-[22px] font-semibold text-ink">Pointage</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sélectionnez le terminal enregistré par l’administrateur. L’heure retenue est celle du serveur.
        </p>
        <div className="mt-5 space-y-3">
          {terminals.length === 0 ? (
            <Banner tone="info" title="Aucun terminal enregistré">
              L’administrateur doit enregistrer un téléphone ou une tablette avant le premier pointage.
            </Banner>
          ) : (
            terminals.map((terminal) => (
              <Card key={terminal.id} className="rise p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{terminal.name}</p>
                    <p className="mt-0.5 font-mono text-[12px] text-ink-faint">{terminal.id}</p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => {
                      save(terminal.id);
                      setStage('identify');
                      setError(null);
                    }}
                  >
                    Utiliser
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
    );
  }

  if (stage === 'identify') {
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return (
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-ink">Pointage</h1>
            <p className="mt-1 text-sm text-ink-soft">Saisissez votre identifiant ou présentez votre badge.</p>
          </div>
          <Button variant="quiet" size="sm" onClick={clear}>
            Terminal
          </Button>
        </div>

        <div className="mb-4 rounded-2xl bg-charcoal px-5 py-6 text-center text-white shadow-card">
          <p className="font-mono text-5xl font-semibold tracking-tight num text-amber">{timeStr}</p>
          <p className="mt-1 text-[13px] capitalize text-white/60">{dateStr}</p>
        </div>

        <Card className="rise p-5">
          <div className="mb-4 flex h-16 items-center justify-center rounded-btn border border-line-strong bg-surface-2">
            <span className="num font-mono text-2xl font-semibold tracking-[0.2em] text-ink transition-opacity duration-150">
              {code || '— — —'}
            </span>
          </div>

          <Keypad value={code} onChange={setCode} onSubmit={() => void identify(code)} />

          <div className="mt-4 flex gap-2">
            <Button className="flex-1" icon={<IconQr size={18} />} onClick={() => setScanning(true)}>
              Scanner badge
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={busy || code.length === 0}
              onClick={() => void identify(code)}
            >
              {busy ? <Spinner /> : 'Identifier'}
            </Button>
          </div>

          {error ? (
            <div className="mt-4">
              <Banner
                tone="error"
                className="shake"
                key={error}
                title={locked ? 'Terminal verrouillé' : 'Identification refusée'}
              >
                <span className="inline-flex items-start gap-2">
                  {locked ? <IconLock size={16} className="mt-0.5" /> : null}
                  <span>{error}</span>
                </span>
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
    );
  }

  if (stage === 'card' && identified) {
    const { employee, situation: sit, history, month } = identified;
    return (
      <div className="mx-auto max-w-2xl" onClick={() => setIdle(AUTO_RETURN_SECONDS)}>
        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full bg-amber transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
        </div>

        <Card className="rise p-5">
          <div className="flex items-start gap-4">
            {employee.photo_path ? (
              <img
                src={employee.photo_path}
                alt=""
                className="h-16 w-16 rounded-card border border-line object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-card bg-charcoal text-lg font-semibold text-white">
                {initials(employee.full_name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-ink">{employee.full_name}</p>
              <p className="text-sm text-ink-soft">{employee.job_title}</p>
              <p className="mt-1 font-mono text-[13px] text-ink-faint">{employee.id}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] uppercase tracking-wide text-ink-faint">Situation du jour</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {!sit.isWorkday
                  ? 'Jour non ouvré'
                  : sit.onBreak
                    ? 'En pause'
                    : sit.hasIn && sit.hasOut
                      ? 'Journée terminée'
                      : sit.hasIn
                        ? `Présent depuis ${history[0]?.inAt ?? '—'}`
                        : 'Pas encore arrivé'}
              </p>
              {sit.lateMinutes > 0 && !sit.hasOut ? (
                <p className="mt-1 text-[13px] font-medium text-amber">{sit.lateMinutes} min de retard</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
            <div>
              <p className="text-[12px] text-ink-faint">Ouverture</p>
              <p className="font-mono text-sm font-semibold num">{sit.openingTime}</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-faint">Tolérance</p>
              <p className="font-mono text-sm font-semibold num">{sit.toleranceMinutes} min</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-faint">Jours ce mois</p>
              <p className="font-mono text-sm font-semibold num">{month.daysPresent}</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-faint">Retards</p>
              <p className="font-mono text-sm font-semibold num">{month.lateCount}</p>
            </div>
          </div>
        </Card>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sit.canPunchIn ? (
            <Button
              size="lg"
              variant="primary"
              icon={<IconClock size={20} />}
              onClick={() => {
                setPunchType('in');
                setStage('capture');
              }}
            >
              Pointer mon arrivée
            </Button>
          ) : null}
          {sit.canPunchOut ? (
            <Button
              size="lg"
              variant="primary"
              icon={<IconClock size={20} />}
              onClick={() => {
                setPunchType('out');
                setStage('capture');
              }}
            >
              Pointer mon départ
            </Button>
          ) : null}
          {sit.canBreakIn ? (
            <Button
              size="lg"
              icon={<IconClock size={20} />}
              onClick={() => {
                setPunchType('break_in');
                setStage('capture');
              }}
            >
              Prendre ma pause
            </Button>
          ) : null}
          {sit.canBreakOut ? (
            <Button
              size="lg"
              variant="success"
              icon={<IconClock size={20} />}
              onClick={() => {
                setPunchType('break_out');
                setStage('capture');
              }}
            >
              Reprendre le travail
            </Button>
          ) : null}
          {!sit.canPunchIn && !sit.canPunchOut && !sit.canBreakIn && !sit.canBreakOut ? (
            <div className="sm:col-span-2">
              <Banner tone="info">
                {sit.hasIn && sit.hasOut
                  ? 'Arrivée et départ déjà enregistrés aujourd’hui : une seule journée ne peut pas être pointée deux fois.'
                  : sit.onBreak
                    ? 'Vous êtes en pause. Reprenez le travail pour pointer votre départ.'
                    : 'Aucune action possible sur ce terminal pour le moment.'}
              </Banner>
            </div>
          ) : null}
        </div>

        <Card className="rise mt-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <IconClock size={16} />
            30 derniers jours
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun pointage enregistré sur la période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Arrivée</th>
                    <th className="py-2 pr-3 font-medium">Départ</th>
                    <th className="py-2 font-medium">Retard</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.date} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3 font-mono num">{row.date}</td>
                      <td className="py-2 pr-3 font-mono num">{row.inAt ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono num">{row.outAt ?? '—'}</td>
                      <td className={cx('py-2 font-mono num', row.lateMinutes > 0 ? 'text-amber' : 'text-ink-soft')}>
                        {row.lateMinutes > 0 ? `${row.lateMinutes} min` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[12px] text-ink-faint">
            Les coordonnées personnelles ne sont jamais affichées ici. La fiche se referme automatiquement.
          </p>
        </Card>

        <div className="mt-4">
          <Button variant="quiet" onClick={resetToIdentify}>
            Terminer la fiche
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'capture' && identified) {
    return (
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-ink">
              {PUNCH_LABEL[punchType]} — {identified.employee.full_name}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">Photo prise en direct : aucun import de galerie.</p>
          </div>
          <Button variant="quiet" size="sm" onClick={resetToIdentify}>
            Annuler
          </Button>
        </div>

        {!selfie ? (
          <Card className="rise overflow-hidden">
            <div className="relative aspect-square w-full bg-charcoal">
              <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              {!ready && !cameraError ? (
                <div className="absolute inset-0 grid place-items-center text-white/70">
                  <Spinner />
                </div>
              ) : null}
            </div>
            <div className="flex gap-2 p-4">
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                icon={<IconCamera size={20} />}
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
            {cameraError ? (
              <div className="px-4 pb-4">
                <Banner tone="error">{cameraError}</Banner>
              </div>
            ) : null}
          </Card>
        ) : (
          <Card className="rise overflow-hidden">
            <div className="aspect-square w-full bg-charcoal">
              <img src={selfie} alt="Aperçu du selfie" className="h-full w-full object-cover" />
            </div>

            {lateNeeded ? (
              <div className="space-y-3 border-t border-line p-4">
                <Banner tone="info" title={`Retard de ${situation?.lateMinutes} min`}>
                  Motif obligatoire (tolérance de {situation?.toleranceMinutes} min, ouverture à {situation?.openingTime}).
                </Banner>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Motif du retard</span>
                  <select
                    value={motif}
                    onChange={(event) => setMotif(event.target.value)}
                    className="h-11 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm transition-colors duration-150 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/15"
                  >
                    <option value="">Choisir un motif…</option>
                    {(situation?.lateMotifs ?? []).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                {motif === 'Autre' ? (
                  <textarea
                    value={motifNote}
                    onChange={(event) => setMotifNote(event.target.value)}
                    placeholder="Précisez le motif"
                    rows={2}
                    className="w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm transition-colors duration-150 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/15"
                  />
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="px-4 pb-4">
                <Banner tone="error">{error}</Banner>
              </div>
            ) : null}

            <div className="flex gap-2 border-t border-line p-4">
              <Button onClick={() => setSelfie(null)} icon={<IconRefresh size={18} />}>
                Reprendre
              </Button>
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
    );
  }

  if (stage === 'confirm' && result) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="rise p-6 text-center">
          <span className="scale-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-wash text-green">
            <IconCheck size={28} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink">
            {PUNCH_LABEL[result.punchType]} enregistrée
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{result.employee.full_name}</p>
          <p className="mt-4 font-mono text-3xl font-semibold text-ink num">{result.serverTime}</p>
          <p className="mt-1 text-[13px] text-ink-faint">Heure du serveur — non modifiable</p>
          {result.lateMinutes > 0 ? (
            <p className="mt-3 text-sm font-medium text-amber">{result.lateMinutes} min de retard enregistrés</p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              icon={<IconPrinter size={18} />}
              onClick={() => print(<PunchReceipt result={result} />)}
            >
              Imprimer la fiche
            </Button>
            <Button variant="primary" onClick={resetToIdentify}>
              Fiche suivante
            </Button>
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">Retour automatique à l’identification…</p>
        </Card>
        {portal}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6 text-center">
        <IconUser size={28} className="mx-auto text-ink-faint" />
        <p className="mt-3 text-sm text-ink-soft">Aucun terminal sélectionné.</p>
        <Button className="mt-4" onClick={() => setStage('terminal')}>
          Choisir un terminal
        </Button>
      </Card>
    </div>
  );
}
