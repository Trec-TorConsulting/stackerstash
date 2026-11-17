import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Crop,
  Flashlight,
  RefreshCw,
  RotateCw,
  Scan,
  Sparkles,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  computeSharpnessScore,
  evaluateFrameMetrics,
  type DetectedShape,
  type FrameQuality,
  type FramingState,
  type SubjectBox,
} from '../lib/cameraMetrics';
import {
  computeCoverCropRect,
  computeSubjectCropRect,
  decodeImageBitmapUpright,
  normalizeImageFileForUpload,
  rotateImageFile90,
} from '../lib/imageUtils';
import { PhotoCropRotateView } from './PhotoCropRotateView';

const MAX_CAPTURE_DIM = 2048;
const VIEWFINDER_ASPECT = 4 / 3;
const BURST_FRAMES = 5;
const BURST_INTERVAL_MS = 50;
const AUTO_CAPTURE_TICKS = 3;
const FLIP_COOLDOWN_MS = 1400;

export type ReticleMode = 'auto' | 'coin' | 'slab' | 'note';

const SHAPE_LABELS: Record<DetectedShape, string> = {
  coin: 'Coin / Round',
  slab: 'Slab / Bar',
  note: 'Note / Goldback',
};

type ExtendedCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number };
  focusMode?: string[];
  torch?: boolean;
};

type ImageCaptureConstructor = new (track: MediaStreamTrack) => {
  takePhoto: () => Promise<Blob>;
};

function resolveInitialMode(
  initialShape?: 'auto' | 'circle' | 'rect' | 'coin' | 'slab' | 'note',
): ReticleMode {
  if (!initialShape || initialShape === 'auto') return 'auto';
  if (initialShape === 'circle' || initialShape === 'coin') return 'coin';
  if (initialShape === 'slab') return 'slab';
  return 'note';
}

async function canvasToJpegFile(canvas: HTMLCanvasElement, filename: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], filename, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.94,
    );
  });
}

function drawNormalizedSource(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  zoom: number,
  applySoftwareZoom: boolean,
  reticleMode: ReticleMode,
  targetCanvas: HTMLCanvasElement,
  subjectBox?: SubjectBox | null,
): boolean {
  const baseZoom = applySoftwareZoom && zoom > 1 ? zoom : 1;
  // True WYSIWYG: match the exact centered viewfinder, or auto-crop tightly to a confident detected subject
  const targetAspect = reticleMode === 'coin' ? 1 : VIEWFINDER_ASPECT;
  const useSubjectCrop =
    Boolean(subjectBox) &&
    subjectBox!.confidence >= 0.4 &&
    subjectBox!.areaRatio >= 0.05 &&
    subjectBox!.areaRatio <= 0.78;
  const { sx, sy, sw, sh } = useSubjectCrop
    ? computeSubjectCropRect(srcW, srcH, VIEWFINDER_ASPECT, baseZoom, subjectBox!, 1.25)
    : computeCoverCropRect(srcW, srcH, targetAspect, baseZoom);

  const scale = Math.min(1, MAX_CAPTURE_DIM / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  return true;
}

async function normalizePhotoBlob(
  blob: Blob,
  zoom: number,
  applySoftwareZoom: boolean,
  reticleMode: ReticleMode,
  filename: string,
  subjectBox?: SubjectBox | null,
): Promise<File | null> {
  const canvas = document.createElement('canvas');
  if (typeof createImageBitmap === 'function') {
    const bitmap = await decodeImageBitmapUpright(blob);
    try {
      const ok = drawNormalizedSource(
        bitmap,
        bitmap.width,
        bitmap.height,
        zoom,
        applySoftwareZoom,
        reticleMode,
        canvas,
        subjectBox,
      );
      return ok ? await canvasToJpegFile(canvas, filename) : null;
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode photo blob'));
      el.src = url;
    });
    const ok = drawNormalizedSource(
      img,
      img.naturalWidth,
      img.naturalHeight,
      zoom,
      applySoftwareZoom,
      reticleMode,
      canvas,
      subjectBox,
    );
    return ok ? await canvasToJpegFile(canvas, filename) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function captureBestBurstFrame(
  video: HTMLVideoElement,
  zoom: number,
  applySoftwareZoom: boolean,
  reticleMode: ReticleMode,
  filename: string,
  subjectBox?: SubjectBox | null,
): Promise<File | null> {
  const sampleW = 160;
  const sampleH = 120;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

  const bestCanvas = document.createElement('canvas');
  let bestScore = -1;

  for (let i = 0; i < BURST_FRAMES; i++) {
    let score = 0;
    if (sampleCtx) {
      sampleCtx.drawImage(video, 0, 0, sampleW, sampleH);
      const { data } = sampleCtx.getImageData(0, 0, sampleW, sampleH);
      const luma = new Float32Array(sampleW * sampleH);
      for (let p = 0; p < sampleW * sampleH; p++) {
        const idx = p * 4;
        luma[p] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      }
      score = computeSharpnessScore(luma, sampleW, sampleH);
    }

    if (score >= bestScore) {
      bestScore = score;
      drawNormalizedSource(
        video,
        video.videoWidth,
        video.videoHeight,
        zoom,
        applySoftwareZoom,
        reticleMode,
        bestCanvas,
        subjectBox,
      );
    }

    if (i < BURST_FRAMES - 1) {
      await new Promise((r) => window.setTimeout(r, BURST_INTERVAL_MS));
    }
  }

  return canvasToJpegFile(bestCanvas, filename);
}

export interface GuidedCameraResult {
  frontFile: File;
  backFile: File | null;
  detectedShape?: DetectedShape;
}

interface GuidedCameraModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (result: GuidedCameraResult) => void;
  requireBack?: boolean;
  initialShape?: 'auto' | 'circle' | 'rect' | 'coin' | 'slab' | 'note';
}

export function GuidedCameraModal({
  open,
  onClose,
  onComplete,
  requireBack = true,
  initialShape = 'auto',
}: GuidedCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevLumaRef = useRef<Float32Array | null>(null);
  const prevSubjectBoxRef = useRef<SubjectBox | null>(null);
  const hardwareZoomSupportedRef = useRef(false);
  const steadyTicksRef = useRef(0);
  const flipCooldownUntilRef = useRef(0);

  const [reticleMode, setReticleMode] = useState<ReticleMode>(() => resolveInitialMode(initialShape));
  const [detectedShape, setDetectedShape] = useState<DetectedShape>('coin');
  const [hasSubject, setHasSubject] = useState(false);
  const [subjectBox, setSubjectBox] = useState<SubjectBox | null>(null);
  const [framingState, setFramingState] = useState<FramingState>('none');
  const [lockProgress, setLockProgress] = useState<number>(0);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [autoCapture, setAutoCapture] = useState<boolean>(
    () => resolveInitialMode(initialShape) === 'auto',
  );
  const [expressMode, setExpressMode] = useState<boolean>(true);
  const [flipNotice, setFlipNotice] = useState<string | null>(null);
  const [step, setStep] = useState<'front' | 'back'>('front');

  const [pendingReviewFile, setPendingReviewFile] = useState<File | null>(null);
  const [pendingReviewUrl, setPendingReviewUrl] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [rotating, setRotating] = useState(false);

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [quality, setQuality] = useState<FrameQuality>({
    label: 'Center item and tap shutter',
    tone: 'warn',
    isGood: false,
  });

  const activeShape: DetectedShape = reticleMode === 'auto' ? detectedShape : reticleMode;

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    hardwareZoomSupportedRef.current = false;
    setTorchSupported(false);
    setTorchOn(false);
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    setReticleMode(resolveInitialMode(initialShape));
    setStep('front');
    setPendingReviewFile(null);
    setShowCropper(false);
    setFrontFile(null);
    setFrontPreview(null);
    setHasSubject(false);
    setFramingState('none');
    setLockProgress(0);
    setShutterFlash(false);
    setZoom(1);
    setTorchOn(false);
    setFlipNotice(null);
    flipCooldownUntilRef.current = 0;
    steadyTicksRef.current = 0;
    prevLumaRef.current = null;
    setCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera preview is unavailable in this browser. Use Native Camera below.');
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as ExtendedCapabilities;
          hardwareZoomSupportedRef.current = Boolean(caps.zoom);
          setTorchSupported(Boolean(caps.torch));
          if (
            Array.isArray(caps.focusMode) &&
            caps.focusMode.includes('continuous') &&
            typeof track.applyConstraints === 'function'
          ) {
            track
              .applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              })
              .catch(() => {});
          }
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            Promise.resolve(videoRef.current.play?.()).catch(() => {});
          } catch {
            // Ignore autoplay errors in restricted/headless environments
          }
        }
        setCameraReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Camera access was denied or unavailable. Use Native Camera below.');
        }
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, initialShape, stopStream]);

  useEffect(() => {
    if (!pendingReviewFile) {
      setPendingReviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingReviewFile);
    setPendingReviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingReviewFile]);

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
    };
  }, [frontPreview]);

  // Ensure <video> retains srcObject and playback across Front -> Review -> Back transitions
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!open || !video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    try {
      Promise.resolve(video.play?.()).catch(() => {});
    } catch {
      // Ignore autoplay errors in headless test environments
    }
  }, [open, step, pendingReviewFile, cameraReady]);

  // Apply hardware zoom if supported by track capabilities
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') return;
    const caps = track.getCapabilities() as ExtendedCapabilities;
    if (caps.zoom && typeof track.applyConstraints === 'function') {
      const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom));
      track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] }).catch(() => {});
    }
  }, [zoom]);

  // Apply torch constraint when toggled
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported || typeof track.applyConstraints !== 'function') return;
    track.applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] }).catch(() => {});
  }, [torchOn, torchSupported]);

  const triggerTapFocus = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') {
      return;
    }
    const caps = track.getCapabilities() as ExtendedCapabilities;
    if (Array.isArray(caps.focusMode)) {
      const mode = caps.focusMode.includes('continuous')
        ? 'continuous'
        : caps.focusMode.includes('single-shot')
          ? 'single-shot'
          : null;
      if (mode) {
        track
          .applyConstraints({ advanced: [{ focusMode: mode } as MediaTrackConstraintSet] })
          .catch(() => {});
      }
    }
  }, []);

  const handleCapturedFile = useCallback(
    (file: File, isAutoSnap: boolean) => {
      if (isAutoSnap && expressMode) {
        steadyTicksRef.current = 0;
        setLockProgress(0);
        if (step === 'front') {
          setFrontFile(file);
          setFrontPreview(URL.createObjectURL(file));
          if (requireBack) {
            flipCooldownUntilRef.current = Date.now() + FLIP_COOLDOWN_MS;
            setFlipNotice('Front saved! Flip item for Back');
            setStep('back');
          } else {
            stopStream();
            onComplete({ frontFile: file, backFile: null, detectedShape: activeShape });
          }
          return;
        }
        if (frontFile) {
          stopStream();
          onComplete({ frontFile, backFile: file, detectedShape: activeShape });
          return;
        }
      }
      setShowCropper(false);
      setPendingReviewFile(file);
    },
    [activeShape, expressMode, frontFile, onComplete, requireBack, step, stopStream],
  );

  const captureCurrentFrame = useCallback(async (isAutoSnap = false) => {
    const video = videoRef.current;
    if (!video || capturing) return;

    const filename = step === 'front' ? 'capture-front.jpg' : 'capture-back.jpg';
    const applySoftwareZoom = !hardwareZoomSupportedRef.current;
    const detectedSubject = prevSubjectBoxRef.current;
    setCapturing(true);
    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 160);

    try {
      const videoTrack = streamRef.current?.getVideoTracks()[0];
      const ImageCaptureCtor = (
        window as unknown as { ImageCapture?: ImageCaptureConstructor }
      ).ImageCapture;

      if (videoTrack && typeof ImageCaptureCtor === 'function') {
        try {
          const imageCapture = new ImageCaptureCtor(videoTrack);
          const photoBlob = await imageCapture.takePhoto();
          const file = await normalizePhotoBlob(
            photoBlob,
            zoom,
            applySoftwareZoom,
            reticleMode,
            filename,
            detectedSubject,
          );
          if (file) {
            handleCapturedFile(file, isAutoSnap);
            return;
          }
        } catch {
          // Fall back to burst capture if hardware takePhoto fails or is unsupported
        }
      }

      if (video.videoWidth === 0) return;
      const file = await captureBestBurstFrame(
        video,
        zoom,
        applySoftwareZoom,
        reticleMode,
        filename,
        detectedSubject,
      );
      if (file) {
        handleCapturedFile(file, isAutoSnap);
      }
    } finally {
      setCapturing(false);
    }
  }, [capturing, handleCapturedFile, reticleMode, step, zoom]);

  // Spacebar shortcut on desktop when viewfinder is active
  useEffect(() => {
    if (!open || !cameraReady || pendingReviewFile || cameraError) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        void captureCurrentFrame();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, cameraReady, pendingReviewFile, cameraError, captureCurrentFrame]);

  // Calm live frame metrics & optional Auto-Capture loop (every 200ms)
  useEffect(() => {
    if (!open || !cameraReady || pendingReviewFile) {
      steadyTicksRef.current = 0;
      prevSubjectBoxRef.current = null;
      setSubjectBox(null);
      setLockProgress(0);
      return;
    }
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;

      const sampleW = 160;
      const sampleH = 120;
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const { sx, sy, sw, sh } = computeCoverCropRect(
        video.videoWidth,
        video.videoHeight,
        VIEWFINDER_ASPECT,
        hardwareZoomSupportedRef.current ? 1 : zoom,
      );
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
      const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

      const luma = new Float32Array(sampleW * sampleH);
      for (let i = 0; i < sampleW * sampleH; i++) {
        const idx = i * 4;
        luma[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      }

      const metrics = evaluateFrameMetrics(
        luma,
        prevLumaRef.current,
        sampleW,
        sampleH,
        zoom,
        data,
        prevSubjectBoxRef.current,
      );
      prevLumaRef.current = luma;
      prevSubjectBoxRef.current = metrics.subjectBox;
      setHasSubject(metrics.hasSubject);
      setSubjectBox(metrics.subjectBox);
      setFramingState(metrics.framingState);
      if (metrics.subjectBox) {
        setDetectedShape(metrics.detectedShape);
      }
      setQuality(metrics.quality);

      const inFlipCooldown = Date.now() < flipCooldownUntilRef.current;
      if (!inFlipCooldown) {
        setFlipNotice((prev) => (prev ? null : prev));
      }

      if (
        autoCapture &&
        !inFlipCooldown &&
        metrics.quality.isGood &&
        metrics.framingState === 'locked' &&
        !metrics.hasGlare &&
        metrics.isSteady &&
        !capturing
      ) {
        steadyTicksRef.current += 1;
        const pct = Math.min(100, Math.round((steadyTicksRef.current / AUTO_CAPTURE_TICKS) * 100));
        setLockProgress(pct);
        if (steadyTicksRef.current >= AUTO_CAPTURE_TICKS) {
          steadyTicksRef.current = 0;
          setLockProgress(100);
          try {
            navigator.vibrate?.(35);
          } catch {
            // Ignore vibration errors on unsupported browsers
          }
          void captureCurrentFrame(true);
        }
      } else {
        steadyTicksRef.current = Math.max(0, steadyTicksRef.current - 1);
        setLockProgress(
          steadyTicksRef.current > 0
            ? Math.min(100, Math.round((steadyTicksRef.current / AUTO_CAPTURE_TICKS) * 100))
            : 0,
        );
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [open, cameraReady, pendingReviewFile, zoom, autoCapture, capturing, captureCurrentFrame]);

  if (!open) return null;

  const handleConfirmReviewedFile = (confirmedFile: File) => {
    setPendingReviewFile(null);
    setShowCropper(false);
    steadyTicksRef.current = 0;
    setLockProgress(0);
    if (step === 'front') {
      setFrontFile(confirmedFile);
      setFrontPreview(URL.createObjectURL(confirmedFile));
      if (requireBack) {
        setStep('back');
      } else {
        stopStream();
        onComplete({ frontFile: confirmedFile, backFile: null, detectedShape: activeShape });
      }
    } else if (frontFile) {
      stopStream();
      onComplete({ frontFile, backFile: confirmedFile, detectedShape: activeShape });
    }
  };

  const handleQuickRotate = async () => {
    if (!pendingReviewFile || rotating) return;
    setRotating(true);
    try {
      const rotated = await rotateImageFile90(pendingReviewFile);
      setPendingReviewFile(rotated);
    } finally {
      setRotating(false);
    }
  };

  const handleNativeFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile) return;
    const normalized = await normalizeImageFileForUpload(rawFile, 2048, 0.94);
    setShowCropper(false);
    setPendingReviewFile(normalized);
  };

  const handleFinishSingle = () => {
    if (!frontFile) return;
    stopStream();
    onComplete({ frontFile, backFile: null, detectedShape: activeShape });
  };

  const confirmLabel =
    step === 'front'
      ? requireBack
        ? 'Confirm Front → Back'
        : 'Use Front Photo'
      : 'Confirm Back & Finish';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Guided Camera Capture"
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-900 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-slate-800">
        {/* Clean Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Guided Capture — {step === 'front' ? 'Step 1: Front (Obverse)' : 'Step 2: Back (Reverse)'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {pendingReviewFile
                  ? 'Check clarity, then confirm or retake.'
                  : 'Frame item inside guide and tap the shutter button.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!pendingReviewFile && autoCapture && (
              <button
                type="button"
                aria-pressed={expressMode}
                onClick={() => setExpressMode((v) => !v)}
                title={expressMode ? 'Hands-free: auto-advances without review' : 'Pause to review each photo'}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
                  expressMode
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{expressMode ? 'Hands-Free' : 'Review Each'}</span>
              </button>
            )}
            {!pendingReviewFile && (
              <button
                type="button"
                aria-pressed={autoCapture}
                onClick={() => setAutoCapture((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  autoCapture
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Auto-Capture</span> {autoCapture ? 'On' : 'Off'}
              </button>
            )}

            {!pendingReviewFile && torchSupported && (
              <button
                type="button"
                aria-pressed={torchOn}
                onClick={() => setTorchOn((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg border p-1.5 text-xs font-medium transition ${
                  torchOn
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Toggle flash light"
              >
                <Flashlight className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
              }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close camera"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Optional Crop/Rotate Editor OR Fast 1-Tap Photo Review */}
        {pendingReviewFile && showCropper && (
          <PhotoCropRotateView
            imageFile={pendingReviewFile}
            title={step === 'front' ? 'Review Front (Obverse)' : 'Review Back (Reverse)'}
            initialPreset={activeShape}
            confirmLabel={confirmLabel}
            cancelLabel="Back to Preview"
            onConfirm={handleConfirmReviewedFile}
            onCancel={() => setShowCropper(false)}
          />
        )}

        {pendingReviewFile && !showCropper && (
          <div className="flex flex-1 flex-col justify-between overflow-hidden">
            <div className="sr-only">
              {step === 'front' ? 'Review Front (Obverse)' : 'Review Back (Reverse)'}
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-3">
              {pendingReviewUrl && (
                <img
                  src={pendingReviewUrl}
                  alt={step === 'front' ? 'Front photo preview' : 'Back photo preview'}
                  className="max-h-[55vh] w-full rounded-lg object-contain"
                />
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-t border-slate-800 bg-slate-900/95 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingReviewFile(null);
                    setShowCropper(false);
                    steadyTicksRef.current = 0;
                    setLockProgress(0);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={() => void handleQuickRotate()}
                  disabled={rotating}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Rotate
                </button>
                <button
                  type="button"
                  onClick={() => setShowCropper(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Crop className="h-3.5 w-3.5" />
                  Crop
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleConfirmReviewedFile(pendingReviewFile)}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg hover:bg-amber-400"
              >
                <Check className="h-4 w-4" />
                {confirmLabel}
              </button>
            </div>
          </div>
        )}

        {/* Live Viewfinder + Controls */}
        <div className={pendingReviewFile ? 'hidden' : 'flex flex-1 flex-col justify-between overflow-hidden'}>
          {/* Viewfinder */}
          <div
            className="relative flex aspect-[4/3] w-full flex-1 items-center justify-center overflow-hidden bg-black sm:flex-none"
            onClick={triggerTapFocus}
          >
            {cameraError ? (
              <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                <Camera className="h-10 w-10 text-slate-500" />
                <p className="text-sm text-slate-300">{cameraError}</p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">
                  <Upload className="h-4 w-4" />
                  Capture {step === 'front' ? 'Front' : 'Back'} Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleNativeFallback}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover transition-transform duration-150"
                  style={{
                    transform: hardwareZoomSupportedRef.current ? undefined : `scale(${zoom})`,
                  }}
                />

                {shutterFlash && (
                  <div
                    data-testid="shutter-flash"
                    className="pointer-events-none absolute inset-0 z-20 bg-white/75 transition-opacity duration-150"
                  />
                )}

                {subjectBox && (
                  <div
                    data-testid="live-subject-box"
                    className={`pointer-events-none absolute z-10 border-2 transition-all duration-150 ${
                      subjectBox.shape === 'coin' ? 'rounded-full' : 'rounded-xl'
                    } ${
                      framingState === 'locked'
                        ? 'border-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                        : 'border-dashed border-sky-400/90'
                    }`}
                    style={{
                      left: `${(subjectBox.x * 100).toFixed(2)}%`,
                      top: `${(subjectBox.y * 100).toFixed(2)}%`,
                      width: `${(subjectBox.width * 100).toFixed(2)}%`,
                      height: `${(subjectBox.height * 100).toFixed(2)}%`,
                    }}
                  />
                )}

                {/* Calm, Stable Centered Guide Reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {reticleMode === 'auto' ? (
                    <div
                      data-testid="auto-scan-brackets"
                      className={`relative h-52 w-64 rounded-2xl border-2 border-dashed transition-colors duration-200 sm:h-60 sm:w-72 ${
                        quality.isGood
                          ? 'border-emerald-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.38)]'
                          : 'border-amber-400/75 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]'
                      }`}
                    >
                      <div className="absolute -bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 ring-1 ring-slate-700">
                        <Scan className="h-3 w-3 text-amber-400" />
                        <span>{hasSubject ? `Detected: ${SHAPE_LABELS[detectedShape]}` : 'Align item in guide'}</span>
                        {autoCapture && lockProgress > 0 && (
                          <span className="font-mono text-emerald-300">• {lockProgress}%</span>
                        )}
                      </div>
                    </div>
                  ) : reticleMode === 'coin' ? (
                    <div className="h-52 w-52 rounded-full border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.42)] sm:h-60 sm:w-60" />
                  ) : reticleMode === 'slab' ? (
                    <div className="h-56 w-44 rounded-2xl border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.42)] sm:h-64 sm:w-48" />
                  ) : (
                    <div className="h-40 w-68 rounded-xl border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.42)] sm:h-48 sm:w-80" />
                  )}
                </div>

                {/* Subtle Advisory Pill */}
                <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-md ${
                      flipNotice
                        ? 'bg-amber-500/90 text-slate-950 font-semibold ring-1 ring-amber-300'
                        : quality.tone === 'good'
                          ? 'bg-emerald-950/85 text-emerald-300 ring-1 ring-emerald-500/40'
                          : 'bg-slate-950/80 text-slate-200 ring-1 ring-slate-700/80'
                    }`}
                  >
                    {flipNotice
                      ? flipNotice
                      : autoCapture && lockProgress > 0
                        ? `Holding steady… Auto-snapping (${lockProgress}%)`
                        : quality.isGood
                          ? 'Ready — tap shutter'
                          : quality.label}
                  </span>
                  {autoCapture && framingState === 'locked' && (
                    <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-slate-700">
                      <div
                        data-testid="auto-snap-progress"
                        className="h-full bg-emerald-400 transition-all duration-150"
                        style={{ width: `${lockProgress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Quick Zoom Pills */}
                <div
                  className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/85 p-1 ring-1 ring-slate-700/80 backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  {[1, 1.5, 2, 3].map((presetZoom) => (
                    <button
                      key={presetZoom}
                      type="button"
                      onClick={() => setZoom(presetZoom)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                        Math.abs(zoom - presetZoom) < 0.08
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {presetZoom}x
                    </button>
                  ))}
                </div>
              </>
            )}

            {frontPreview && step === 'back' && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 p-1.5 pr-2.5">
                <img src={frontPreview} alt="Front captured" className="h-9 w-9 rounded object-cover" />
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Front saved
                </span>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Clean, Thumb-Friendly Controls */}
          <div className="flex shrink-0 flex-col gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3.5">
            {/* Guide Shape & Zoom Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setReticleMode('auto')}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    reticleMode === 'auto' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Auto-Detect
                </button>
                <button
                  type="button"
                  onClick={() => setReticleMode('coin')}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    reticleMode === 'coin' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Coin (Circle)
                </button>
                <button
                  type="button"
                  onClick={() => setReticleMode('slab')}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    reticleMode === 'slab' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Slab / Bar
                </button>
                <button
                  type="button"
                  onClick={() => setReticleMode('note')}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    reticleMode === 'note' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Note / Bar (Rect)
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300">
                <ZoomIn className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  aria-label="Camera zoom"
                  className="w-20 accent-amber-400"
                />
                <span className="w-7 text-right font-mono">{zoom.toFixed(1)}x</span>
              </div>
            </div>

            {/* Primary Shutter Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Native Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleNativeFallback}
                    className="hidden"
                  />
                </label>
              </div>

              {!cameraError && (
                <button
                  type="button"
                  onClick={() => void captureCurrentFrame()}
                  disabled={!cameraReady || capturing}
                  aria-label={`Capture ${step === 'front' ? 'Front' : 'Back'}`}
                  className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white bg-amber-500 text-slate-950 shadow-lg transition active:scale-95 hover:bg-amber-400 disabled:opacity-50"
                >
                  <Camera className="h-6 w-6" />
                </button>
              )}

              <div className="flex items-center justify-end gap-1.5">
                {step === 'back' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('front');
                        setFrontFile(null);
                        setFrontPreview(null);
                        setFlipNotice(null);
                        flipCooldownUntilRef.current = 0;
                        steadyTicksRef.current = 0;
                        setLockProgress(0);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-2.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                      title="Retake Front"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Retake Front</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFinishSingle}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Skip Back
                    </button>
                  </>
                ) : (
                  <div className="w-24 sm:w-28" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
