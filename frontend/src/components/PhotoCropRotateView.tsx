import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Check, RefreshCw, RotateCcw, RotateCw, ZoomIn } from "lucide-react";
import { renderCroppedRotatedImage } from "../lib/imageUtils";

export type CropPresetKey = "coin" | "slab" | "note";

const ASPECT_PRESETS: Array<{ key: CropPresetKey; label: string; aspect: number; round?: boolean }> = [
  { key: "coin", label: "Coin (1:1)", aspect: 1, round: true },
  { key: "slab", label: "Slab / Card (4:3)", aspect: 4 / 3 },
  { key: "note", label: "Note / Bar (2:1)", aspect: 2 },
];

interface PhotoCropRotateViewProps {
  imageFile: File;
  title?: string;
  initialPreset?: CropPresetKey;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export function PhotoCropRotateView({
  imageFile,
  title = "Review, Crop & Rotate",
  initialPreset = "coin",
  confirmLabel = "Use Photo",
  cancelLabel = "Retake",
  onConfirm,
  onCancel,
}: PhotoCropRotateViewProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [preset, setPreset] = useState<CropPresetKey>(initialPreset);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  const activePreset = ASPECT_PRESETS.find((p) => p.key === preset) ?? ASPECT_PRESETS[0];

  const handleCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (applying) return;
    setApplying(true);
    try {
      if (croppedAreaPixels && croppedAreaPixels.width > 0 && croppedAreaPixels.height > 0) {
        const outFile = await renderCroppedRotatedImage(
          imageFile,
          croppedAreaPixels,
          rotation,
          imageFile.name.replace(/\.[^.]+$/, "") + ".jpg" || "photo.jpg",
        );
        if (outFile) {
          onConfirm(outFile);
          return;
        }
      }
      onConfirm(imageFile);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-2.5 text-xs text-slate-300">
        <span className="font-medium text-white">{title}</span>
        <span>Drag to center • Pinch or slide to zoom</span>
      </div>

      {/* Explicit relative sized container required by react-easy-crop */}
      <div className="relative h-[320px] w-full overflow-hidden bg-black sm:h-[400px]">
        {imageUrl && (
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={activePreset.aspect}
            cropShape={activePreset.round ? "round" : "rect"}
            showGrid={true}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={handleCropComplete}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/95 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1 text-xs">
            {ASPECT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  preset === p.key ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 270) % 360)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              aria-label="Rotate left 90 degrees"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 90°
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              aria-label="Rotate right 90 degrees"
            >
              <RotateCw className="h-3.5 w-3.5" /> 90°
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ZoomIn className="h-4 w-4 text-slate-400" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              aria-label="Crop zoom"
              className="w-28 accent-amber-400"
            />
            <span className="w-9 text-right font-mono">{zoom.toFixed(1)}x</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={applying}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg hover:bg-amber-400 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {applying ? "Applying…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
