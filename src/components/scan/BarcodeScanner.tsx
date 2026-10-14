import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Callout } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';

/** Minimal typing for the browser's native BarcodeDetector (Chrome, Edge, Android). */
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorCtor {
  new (opts?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const WANTED = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'pdf417', 'data_matrix'];

type Phase = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once per distinct code. Return a string to show feedback, or nothing to close. */
  onDetected: (code: string) => string | void;
  title?: string;
  hint?: string;
  /** Placeholder for the typed-code box. */
  placeholder?: string;
  /**
   * Hide the typed-code box, so codes can only come from the camera or a handheld
   * (USB/Bluetooth) scanner. Handheld scanners still work: they "type" a whole code
   * in a few milliseconds and press Enter, which is told apart from a person typing.
   */
  scanOnly?: boolean;
}

/** Keystrokes from a handheld scanner arrive this close together; people type far slower. */
const WEDGE_MAX_GAP_MS = 45;
const WEDGE_MIN_LENGTH = 4;

/**
 * Camera barcode scanner. Uses the native BarcodeDetector where available and falls back to
 * ZXing (loaded on demand) elsewhere, e.g. Safari and Firefox. Works on localhost and HTTPS;
 * browsers block the camera on plain-HTTP network addresses. Manual entry is always available.
 */
export function BarcodeScanner({ open, onClose, onDetected, title = 'Scan a barcode', hint, placeholder = 'ISBN or LBX-000123', scanOnly = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [manual, setManual] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [flash, setFlash] = useState(false);
  const fallback = scanOnly ? 'Use a handheld barcode scanner, or ask at the circulation desk.' : 'Type the code below instead.';
  // Keep the latest callback without restarting the camera on every parent render.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const handle = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 2500) return; // ignore repeat frames
    lastRef.current = { code, at: now };
    setFlash(true);
    window.setTimeout(() => setFlash(false), 350);
    try { navigator.vibrate?.(60); } catch { /* not supported */ }
    const msg = onDetectedRef.current(code);
    if (typeof msg === 'string') setFeedback(msg);
  }, []);

  const stop = useCallback(() => {
    stopRef.current();
    stopRef.current = () => undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) { stop(); return; }
    let cancelled = false;
    setFeedback(undefined);
    setPhase('starting');

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setPhase('unavailable');
        setMessage(`The camera needs a secure address (https:// or localhost). ${fallback}`);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        try {
          const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          if (!cancelled) setDevices(list);
        } catch { /* optional */ }

        const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
        const supported = Native?.getSupportedFormats ? await Native.getSupportedFormats().catch(() => [] as string[]) : [];
        const formats = WANTED.filter((f) => supported.includes(f));
        if (Native && formats.length) {
          const detector = new Native({ formats });
          let timer = 0;
          let busy = false;
          const tick = async () => {
            if (cancelled) return;
            if (!busy && video.readyState >= 2) {
              busy = true;
              try {
                const found = await detector.detect(video);
                if (found[0]?.rawValue) handle(found[0].rawValue);
              } catch { /* frame not ready */ }
              busy = false;
            }
            timer = window.setTimeout(tick, 180);
          };
          void tick();
          stopRef.current = () => window.clearTimeout(timer);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (cancelled) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) handle(result.getText());
          });
          stopRef.current = () => controls.stop();
        }
        if (!cancelled) setPhase('scanning');
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setPhase('denied');
          setMessage(`Camera access was blocked. Allow the camera for this site in your browser settings. ${scanOnly ? fallback : 'Or type the code below.'}`);
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setPhase('unavailable');
          setMessage(`No camera was found on this device. ${scanOnly ? fallback : 'Type or use a USB scanner in the field below.'}`);
        } else {
          setPhase('error');
          setMessage(`The scanner could not start. ${fallback}`);
        }
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [open, deviceId, handle, stop, scanOnly]);

  // Scan-only mode: accept handheld-scanner bursts, ignore human typing.
  useEffect(() => {
    if (!open || !scanOnly) return;
    let buf = '';
    let last = 0;
    let slow = false;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (e.key === 'Enter') {
        if (buf.length >= WEDGE_MIN_LENGTH && !slow) { e.preventDefault(); lastRef.current = { code: '', at: 0 }; handle(buf); }
        buf = ''; slow = false;
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (buf && now - last > WEDGE_MAX_GAP_MS) slow = true;
      if (!buf) slow = false;
      buf += e.key;
      last = now;
      // A pause longer than a scanner would make starts a fresh attempt.
      window.setTimeout(() => { if (performance.now() - last >= 400) { buf = ''; slow = false; } }, 420);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, scanOnly, handle]);

  const submitManual = () => {
    if (!manual.trim()) return;
    lastRef.current = { code: '', at: 0 };
    handle(manual);
    setManual('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={hint ?? 'Point the camera at the barcode on the back of the book or the copy label.'}
      size="md"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div className={cn('relative aspect-[4/3] overflow-hidden rounded-card bg-black', flash && 'ring-4 ring-sage')}>
          <video ref={videoRef} className={cn('h-full w-full object-cover', phase !== 'scanning' && 'opacity-40')} muted playsInline aria-label="Camera preview" />
          {phase === 'scanning' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div className="relative h-[38%] w-[78%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]">
                <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-rose" />
              </div>
            </div>
          )}
          {phase === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
              <Camera className="h-8 w-8 animate-pulse" aria-hidden /> Starting camera…
            </div>
          )}
          {(phase === 'denied' || phase === 'unavailable' || phase === 'error') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/85">
              <CameraOff className="h-8 w-8" aria-hidden /> {message}
            </div>
          )}
        </div>

        <p className="sr-only" role="status" aria-live="polite">{phase === 'scanning' ? 'Scanner ready' : message}</p>
        {feedback && <Callout tone="sky" icon={ScanLine}>{feedback}</Callout>}

        {devices.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <Camera className="h-4 w-4" aria-hidden /> Camera
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="h-9 flex-1 rounded-control border border-line bg-surface-sunken px-2 text-ink">
              <option value="">Default (back camera)</option>
              {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          </label>
        )}

        {scanOnly ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <ScanLine className="h-3.5 w-3.5" aria-hidden /> Scan only — typing card numbers is turned off. Handheld barcode scanners work too.
          </p>
        ) : (
        <div>
          <label htmlFor="scanner-manual" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <Keyboard className="h-3.5 w-3.5" aria-hidden /> Type or use a USB scanner
          </label>
          <div className="flex gap-2">
            <Input
              id="scanner-manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual(); } }}
              placeholder={placeholder}
              className="font-mono uppercase"
              autoComplete="off"
            />
            <Button onClick={submitManual} disabled={!manual.trim()}>Use</Button>
          </div>
        </div>
        )}
      </div>
    </Dialog>
  );
}

/** Small camera button that opens the scanner. */
export function ScanButton({ onClick, label = 'Scan with camera', size = 'md', withText }: { onClick: () => void; label?: string; size?: 'sm' | 'md'; withText?: boolean }) {
  return (
    <Button variant="secondary" size={withText ? size : 'icon'} onClick={onClick} aria-label={label} title={label} icon={<ScanLine className="h-4 w-4" />}>
      {withText ? label : null}
    </Button>
  );
}
