import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, type ScanResult } from '../lib/api';
import { Button, Spinner } from './ui';
import { IconCamera, IconX } from './Icons';

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (result: ScanResult) => void;
};

export function Scanner({ open, onClose, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code?.data) {
          void submit(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      let stream: MediaStream;
      try {
        // Priorité absolue caméra arrière sur smartphone et tablette
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        // Secours pour ordinateurs sans caméra arrière
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      setError('Caméra indisponible. Saisissez le code manuellement.');
    }
  }, [tick]);

  useEffect(() => {
    if (open) void start();
    else stop();
    return stop;
  }, [open, start, stop]);

  const submit = useCallback(
    async (code: string) => {
      if (!code.trim() || busy) return;
      setBusy(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 220);
      try {
        const res = await api<ScanResult>(`/api/scan?q=${encodeURIComponent(code.trim())}`);
        stop();
        onResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scan impossible.');
      } finally {
        setBusy(false);
      }
    },
    [busy, onResult, stop],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-charcoal text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="leading-tight">
          <p className="text-[15px] font-semibold">Scanner</p>
          <p className="text-[12px] text-white/60">Outil, stock, badge ou terminal</p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-white/70 hover:bg-white/10" aria-label="Fermer">
          <IconX size={22} />
        </button>
      </div>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-64 w-64">
            <span className="absolute left-0 top-0 h-10 w-10 border-l-4 border-t-4 border-amber rounded-tl-2xl" />
            <span className="absolute right-0 top-0 h-10 w-10 border-r-4 border-t-4 border-amber rounded-tr-2xl" />
            <span className="absolute bottom-0 left-0 h-10 w-10 border-b-4 border-l-4 border-amber rounded-bl-2xl" />
            <span className="absolute bottom-0 right-0 h-10 w-10 border-b-4 border-r-4 border-amber rounded-br-2xl" />
            <span className="scan-laser absolute inset-x-2 top-1/2 h-0.5 bg-amber shadow-[0_0_12px_2px_rgba(245,158,11,0.7)]" />
            {flash && <span className="absolute inset-0 bg-amber/25 pulse-ring" />}
          </div>
        </div>
        {error && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 px-3 py-2 text-[13px] text-amber">{error}</div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <Spinner />
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(manual);
          }}
          className="flex gap-2"
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Ou saisissez le code (RBT-024, EMP-001…)"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={busy || !manual.trim()}>
            OK
          </Button>
        </form>
        <p className="flex items-center gap-2 text-center text-[12px] text-white/50">
          <IconCamera size={14} />
          Placez le QR dans le cadre — le scan est automatique.
        </p>
      </div>
    </div>
  );
}
