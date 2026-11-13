import { CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { api, type CsvImportPreview, type MappedCsvImportResult } from "../lib/api";

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (message: string) => void;
}

const PRESET_LABELS: Record<string, string> = {
  coinsnap: "CoinSnap Export",
  numista: "Numista Export",
  pcgs_ngc: "PCGS / NGC Registry",
  stackerstash: "Stacker Stash Native",
  custom: "Custom Spreadsheet",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  category: "Category",
  status: "Status",
  country: "Country / Issuer",
  year: "Year",
  denomination: "Denomination",
  mint_or_refiner: "Mint / Refiner",
  series: "Series / Reference",
  quantity: "Quantity",
  metal_type: "Metal Type",
  weight_value: "Weight Value",
  weight_unit: "Weight Unit",
  purity: "Purity",
  grading_service: "Grading Service",
  cert_number: "Cert #",
  grade: "Grade",
  slab_designation: "Slab Designation / Label",
  serial_number: "Serial #",
  container: "Container / Set",
  tags: "Tags",
  purchase_price: "Purchase Price",
  market_value_unit: "Market Value (Unit)",
  notes: "Notes",
  obverse_image_url: "Obverse Image URL",
  reverse_image_url: "Reverse Image URL",
  slab_label_image_url: "Slab Label Image URL",
  image_url: "Image URL",
};

export function ImportWizardModal({ isOpen, onClose, onImported }: ImportWizardModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importPhotos, setImportPhotos] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<MappedCsvImportResult | null>(null);

  if (!isOpen) return null;

  function resetState() {
    setSelectedFile(null);
    setPreview(null);
    setMapping({});
    setImportPhotos(false);
    setRemoveBackground(true);
    setErrorMsg(null);
    setResult(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setErrorMsg(null);
    setResult(null);
    setIsLoadingPreview(true);
    try {
      const prev = await api.previewCsvImport(file);
      setPreview(prev);
      setMapping(prev.suggested_mapping);
      const hasImageMapping = Object.values(prev.suggested_mapping).some((v) =>
        ["obverse_image_url", "reverse_image_url", "slab_label_image_url", "image_url"].includes(v)
      );
      setImportPhotos(hasImageMapping);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to preview CSV file.");
      setPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleConfirmImport() {
    if (!selectedFile) return;
    setIsImporting(true);
    setErrorMsg(null);
    try {
      const res = await api.importMappedCsv(selectedFile, mapping, importPhotos, removeBackground);
      setResult(res);
      const summary = `Imported ${res.created_count} items${
        res.errors.length ? ` (${res.errors.length} row errors)` : ""
      }${res.warnings.length ? ` (${res.warnings.length} photo warnings)` : ""}.`;
      onImported(summary);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to import CSV.");
    } finally {
      setIsImporting(false);
    }
  }

  const hasPhotoColumns = Object.values(mapping).some((v) =>
    ["obverse_image_url", "reverse_image_url", "slab_label_image_url", "image_url"].includes(v)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import / Migrate Collection CSV"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-amber-400" />
              Import / Migrate Collection
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Supports CoinSnap, Numista, PCGS/NGC Set Registry, Stacker Stash, or custom CSV spreadsheets.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close import modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {!preview && !result && (
          <div className="border-2 border-dashed border-slate-700 rounded-2xl p-8 text-center space-y-3 bg-slate-950/50">
            <Upload className="h-8 w-8 text-amber-400 mx-auto" />
            <div className="text-sm text-slate-200 font-medium">
              {isLoadingPreview ? "Analyzing CSV headers..." : "Select a CSV export file to preview"}
            </div>
            <p className="text-xs text-slate-400">
              We will auto-detect the source platform and let you review column mappings before importing.
            </p>
            <button
              type="button"
              disabled={isLoadingPreview}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition disabled:opacity-50"
            >
              Choose CSV File
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {errorMsg}
          </div>
        )}

        {preview && !result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Detected Format:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                  {PRESET_LABELS[preview.detected_preset] || preview.detected_preset}
                </span>
              </div>
              <div className="text-slate-300 font-mono">
                {preview.total_rows} rows ready
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Column Mapping
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {preview.headers.map((header) => (
                  <div
                    key={header}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <span className="truncate text-slate-300 font-medium" title={header}>
                      {header}
                    </span>
                    <select
                      aria-label={`Map column ${header}`}
                      value={mapping[header] || ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [header]: e.target.value,
                        }))
                      }
                      className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs max-w-[170px]"
                    >
                      <option value="">— Skip —</option>
                      {preview.target_fields.map((tf) => (
                        <option key={tf} value={tf}>
                          {FIELD_LABELS[tf] || tf}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {hasPhotoColumns && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importPhotos}
                    onChange={(e) => setImportPhotos(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500"
                  />
                  Download and attach photos from mapped Image URL columns (best-effort)
                </label>
                {importPhotos && (
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pl-5">
                    <input
                      type="checkbox"
                      checked={removeBackground}
                      onChange={(e) => setRemoveBackground(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500"
                    />
                    Auto-remove background, crop tightly &amp; enhance coin/slab photos
                  </label>
                )}
              </div>
            )}

            {preview.normalized_preview.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Sample Preview (First {preview.normalized_preview.length} Rows)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Metal</th>
                        <th className="px-3 py-2">Grade</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                      {preview.normalized_preview.map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-medium text-slate-100">{row.title}</td>
                          <td className="px-3 py-2 text-slate-300">{row.metal_type}</td>
                          <td className="px-3 py-2 text-slate-300">{row.grade || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{row.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-300">
                            ${row.market_value_unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  resetState();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
              >
                Choose Another File
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition disabled:opacity-50"
                >
                  {isImporting ? "Importing..." : `Import ${preview.total_rows} Items`}
                </button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <div>
                  Successfully imported <strong>{result.created_count}</strong> items into your vault.
                </div>
                {(result.queued_appraisals ?? 0) > 0 && (
                  <div className="mt-1 text-xs text-emerald-300/90">
                    {result.queued_appraisals} background appraisals queued (running automatically in the background).
                  </div>
                )}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1 max-h-32 overflow-y-auto">
                <div className="font-semibold">Photo warnings ({result.warnings.length}):</div>
                {result.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-1 max-h-32 overflow-y-auto">
                <div className="font-semibold">Row errors ({result.errors.length}):</div>
                {result.errors.map((e, i) => (
                  <div key={i}>
                    Row {e.row}: {e.error}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
