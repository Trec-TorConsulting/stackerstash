import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Flashlight,
  RefreshCw,
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
} from '../lib/imageUtils';
import { PhotoCropRotateView } from './PhotoCropRotateView';

const MAX_CAPTURE_DIM = 2048;
const VIEWFINDER_ASPECT = 4 / 3;
const CIRCLE_RETICLE_ZOOM_BOOST = 1.35;
const BURST_FRAMES = 5;
const BURST_INTERVAL_MS = 50;
const AUTO_CAPTURE_TICKS = 3;

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
  activeShape: DetectedShape,
  subjectBox: SubjectBox | null,
  targetCanvas: HTMLCanvasElement,
): boolean {
  const baseZoom = applySoftwareZoom && zoom > 1 ? zoom : 1;

  let cropRect;
  if (subjectBox && subjectBox.areaRatio >= 0.05) {
    cropRect = computeSubjectCropRect(srcW, srcH, VIEWFINDER_ASPECT, baseZoom, {
      x: subjectBox.x,
      y: subjectBox.y,
      width: subjectBox.width,
      height: subjectBox.height,
      shape: activeShape,
    });
  } else {
    const targetAspect = activeShape === 'coin' ? 1 : VIEWFINDER_ASPECT;
    const effectiveZoom =
      activeShape === 'coin' ? baseZoom * CIRCLE_RETICLE_ZOOM_BOOST : baseZoom;
    cropRect = computeCoverCropRect(srcW, srcH, targetAspect, effectiveZoom);
  }

  const { sx, sy, sw, sh } = cropRect;
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
  activeShape: DetectedShape,
  subjectBox: SubjectBox | null,
  filename: string,
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
        activeShape,
        subjectBox,
        canvas,
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
      activeShape,
      subjectBox,
      canvas,
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
  activeShape: DetectedShape,
  subjectBox: SubjectBox | null,
  filename: string,
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
        activeShape,
        subjectBox,
        bestCanvas,
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
  const subjectBoxRef = useRef<SubjectBox | null>(null);
  const hardwareZoomSupportedRef = useRef(false);
  const steadyTicksRef = useRef(0);

  const [reticleMode, setReticleMode] = useState<ReticleMode>(() => resolveInitialMode(initialShape));
  const [detectedShape, setDetectedShape] = useState<DetectedShape>('coin');
  const [subjectBox, setSubjectBox] = useState<SubjectBox | null>(null);
  const [framingState, setFramingState] = useState<FramingState>('none');
  const [lockProgress, setLockProgress] = useState<number>(0);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [recommendedZoom, setRecommendedZoom] = useState<number>(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [step, setStep] = useState<'front' | 'back'>('front');
  const [pendingReviewFile, setPendingReviewFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [quality, setQuality] = useState<FrameQuality>({
    label: 'Place coin, note, bar, or slab in frame',
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
    setFrontFile(null);
    setFrontPreview(null);
    setSubjectBox(null);
    subjectBoxRef.current = null;
    setFramingState('none');
    setLockProgress(0);
    setShutterFlash(false);
    setZoom(1);
    setRecommendedZoom(1);
    setTorchOn(false);
    steadyTicksRef.current = 0;
    prevLumaRef.current = null;
    setCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera preview is unavailable in this browser. Use native camera capture below.');
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 4032 },
          height: { ideal: 3024 },
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
          setCameraError('Camera access was denied or unavailable. Use native camera capture below.');
        }
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, initialShape, stopStream]);

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

  const captureCurrentFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || capturing) return;

    const filename = step === 'front' ? 'capture-front.jpg' : 'capture-back.jpg';
    const applySoftwareZoom = !hardwareZoomSupportedRef.current;
    const boxForCrop = reticleMode === 'auto' ? subjectBoxRef.current : null;
    setCapturing(true);

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
            activeShape,
            boxForCrop,
            filename,
          );
          if (file) {
            setPendingReviewFile(file);
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
        activeShape,
        boxForCrop,
        filename,
      );
      if (file) {
        setPendingReviewFile(file);
      }
    } finally {
      setCapturing(false);
    }
  }, [activeShape, capturing, reticleMode, step, zoom]);

  // Live subject detection, sharpness, exposure, glare, and auto-snap loop (every 180ms)
  useEffect(() => {
    if (!open || !cameraReady || pendingReviewFile) {
      steadyTicksRef.current = 0;
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
        subjectBoxRef.current,
      );
      prevLumaRef.current = luma;
      subjectBoxRef.current = metrics.subjectBox;
      setSubjectBox(metrics.subjectBox);
      setFramingState(metrics.framingState);
      if (metrics.subjectBox) {
        setDetectedShape(metrics.detectedShape);
      }
      setQuality(metrics.quality);
      setRecommendedZoom(metrics.recommendedZoom);

      if (
        autoCapture &&
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
          setShutterFlash(true);
          window.setTimeout(() => setShutterFlash(false), 180);
          try {
            navigator.vibrate?.(35);
          } catch {
            // Ignore vibration errors on unsupported browsers
          }
          void captureCurrentFrame();
        }
      } else {
        steadyTicksRef.current = 0;
        setLockProgress(0);
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [open, cameraReady, pendingReviewFile, zoom, autoCapture, capturing, captureCurrentFrame]);

  if (!open) return null;

  const handleConfirmReviewedFile = (confirmedFile: File) => {
    setPendingReviewFile(null);
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

  const handleNativeFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile) return;
    const normalized = await normalizeImageFileForUpload(rawFile, 2048, 0.94);
    setPendingReviewFile(normalized);
  };

  const handleFinishSingle = () => {
    if (!frontFile) return;
    stopStream();
    onComplete({ frontFile, backFile: null, detectedShape: activeShape });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Guided Camera Capture"
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Guided Capture — {step === 'front' ? 'Step 1: Front (Obverse)' : 'Step 2: Back (Reverse)'}
              </h3>
              <p className="text-xs text-slate-400">
                Live AI framing detects coins, notes, bars &amp; slabs and auto-snaps when sharp.
              </p>
            </div>
          </div>
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

        {pendingReviewFile && (
          <PhotoCropRotateView
            imageFile={pendingReviewFile}
            title={step === 'front' ? 'Review Front (Obverse)' : 'Review Back (Reverse)'}
            initialPreset={activeShape}
            confirmLabel={
              step === 'front'
                ? requireBack
                  ? 'Confirm Front → Back'
                  : 'Use Front Photo'
                : 'Confirm Back & Finish'
            }
            cancelLabel="Retake"
            onConfirm={handleConfirmReviewedFile}
            onCancel={() => {
              setPendingReviewFile(null);
              steadyTicksRef.current = 0;
              setLockProgress(0);
            }}
          />
        )}

        <div className={pendingReviewFile ? 'hidden' : 'flex flex-col'}>
          {/* Viewfinder */}
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-black">
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

                {/* Shutter Flash Overlay */}
                {shutterFlash && (
                  <div
                    data-testid="shutter-flash"
                    className="pointer-events-none absolute inset-0 z-20 bg-white/75 transition-opacity duration-150"
                  />
                )}

                {/* Adaptive Reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {reticleMode === 'auto' ? (
                    subjectBox ? (
                      <div
                        data-testid="dynamic-subject-reticle"
                        style={{
                          left: `${Math.max(4, Math.min(82, subjectBox.x * 100))}%`,
                          top: `${Math.max(4, Math.min(82, subjectBox.y * 100))}%`,
                          width: `${Math.max(16, Math.min(92, subjectBox.width * 100))}%`,
                          height: `${Math.max(16, Math.min(92, subjectBox.height * 100))}%`,
                        }}
                        className={`absolute transition-all duration-150 ${
                          detectedShape === 'coin'
                            ? 'rounded-full'
                            : detectedShape === 'slab'
                              ? 'rounded-2xl'
                              : 'rounded-xl'
                        } border-2 ${
                          quality.isGood
                            ? 'border-emerald-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.48)]'
                            : 'border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]'
                        }`}
                      >
                        <div className="absolute -bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/90 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-slate-700">
                          <Scan className="h-3 w-3 text-amber-400" />
                          <span>Auto: {SHAPE_LABELS[detectedShape]}</span>
                          {lockProgress > 0 && (
                            <span className="font-mono text-emerald-300">• {lockProgress}%</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid="auto-scan-brackets"
                        className="relative h-56 w-64 rounded-2xl border-2 border-dashed border-amber-400/75 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)] sm:h-64 sm:w-72"
                      >
                        <div className="absolute -bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700">
                          <Scan className="h-3 w-3 text-amber-400" />
                          <span>Auto-Detect: Coin, Paper, Bar, Slab or Goldback</span>
                        </div>
                      </div>
                    )
                  ) : reticleMode === 'coin' ? (
                    <div className="h-56 w-56 rounded-full border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] sm:h-64 sm:w-64" />
                  ) : reticleMode === 'slab' ? (
                    <div className="h-60 w-48 rounded-2xl border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] sm:h-64 sm:w-52" />
                  ) : (
                    <div className="h-44 w-72 rounded-xl border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] sm:h-52 sm:w-80" />
                  )}
                </div>

                {/* Live Quality Pill & Lock-On Progress */}
                <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-md ${
                      quality.tone === 'good'
                        ? 'bg-emerald-950/85 text-emerald-300 ring-1 ring-emerald-500/50'
                        : 'bg-amber-950/85 text-amber-200 ring-1 ring-amber-500/40'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {lockProgress > 0 && autoCapture
                      ? `Holding steady… Auto-snapping (${lockProgress}%)`
                      : quality.label}
                  </span>
                  {autoCapture && framingState === 'locked' && (
                    <div className="h-1 w-36 overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-slate-700">
                      <div
                        data-testid="auto-snap-progress"
                        className="h-full bg-emerald-400 transition-all duration-150"
                        style={{ width: `${lockProgress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Quick Macro Zoom Pills */}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/85 p-1 ring-1 ring-slate-700/80 backdrop-blur-md">
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

                {/* Recommended Zoom Prompt */}
                {recommendedZoom > zoom && (
                  <button
                    type="button"
                    onClick={() => setZoom(recommendedZoom)}
                    className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/40 hover:bg-slate-800"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                    Zoom to {recommendedZoom.toFixed(2)}x
                  </button>
                )}
              </>
            )}

            {frontPreview && step === 'back' && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 p-1.5 pr-2.5">
                <img src={frontPreview} alt="Front captured" className="h-10 w-10 rounded object-cover" />
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Front saved
                </span>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/95 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Reticle Mode Toggle (Auto-Detect + Manual Stencil Overrides) */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setReticleMode('auto')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    reticleMode === 'auto' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Auto-Detect
                </button>
                <button
                  type="button"
                  onClick={() => setReticleMode('coin')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    reticleMode === 'coin' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Coin (Circle)
                </button>
                <button
                  type="button"
                  onClick={() => setReticleMode('slab')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    reticleMode === 'slab' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Slab / Bar
                </button>
                <button
                  type="button"
                  onClick={() => setReticleMode('note')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    reticleMode === 'note' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Note / Bar (Rect)
                </button>
              </div>

              {/* Auto-Capture & Torch */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={autoCapture}
                  onClick={() => setAutoCapture((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    autoCapture
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Auto-Capture {autoCapture ? 'On' : 'Off'}
                </button>

                {torchSupported && (
                  <button
                    type="button"
                    aria-pressed={torchOn}
                    onClick={() => setTorchOn((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      torchOn
                        ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Flashlight className="h-3.5 w-3.5" />
                    Light
                  </button>
                )}
              </div>

              {/* Zoom Slider */}
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <ZoomIn className="h-4 w-4 text-slate-400" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  aria-label="Camera zoom"
                  className="w-28 accent-amber-400"
                />
                <span className="w-8 text-right font-mono">{zoom.toFixed(1)}x</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
                  <Upload className="h-3.5 w-3.5" />
                  Native Camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleNativeFallback}
                    className="hidden"
                  />
                </label>
                {step === 'back' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('front');
                        setFrontFile(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retake Front
                    </button>
                    <button
                      type="button"
                      onClick={handleFinishSingle}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Skip Back (Single Photo)
                    </button>
                  </>
                )}
              </div>

              {!cameraError && (
                <button
                  type="button"
                  onClick={() => void captureCurrentFrame()}
                  disabled={!cameraReady || capturing}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg hover:bg-amber-400 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {capturing ? 'Capturing…' : `Capture ${step === 'front' ? 'Front' : 'Back'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
