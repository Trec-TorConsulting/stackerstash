const TOKEN_KEY = "stackvault_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export interface UserWorkspace {
  id: string;
  name: string;
  slug: string;
  default_currency: string;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
  workspace: UserWorkspace;
}

export interface ItemPhoto {
  id: string;
  url: string;
  label: string;
  is_primary: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface CollectionItem {
  id: string;
  container_id: string | null;
  container_name: string | null;
  category: string;
  status: string;
  title: string;
  country: string;
  year: string;
  mint_or_refiner: string;
  denomination: string;
  series: string;
  quantity: number;
  metal_type: string;
  weight_value: string;
  weight_unit: string;
  purity: string;
  fine_troy_oz: string;
  grading_service: string;
  cert_number: string;
  grade: string;
  estimated_grade: string;
  ai_confidence: number | null;
  serial_number: string;
  purchase_price: string | null;
  purchase_date: string | null;
  vendor: string;
  sold_price: string | null;
  sold_date: string | null;
  melt_value_unit: string;
  market_value_unit: string;
  total_melt_value: string;
  total_market_value: string;
  collector_premium_total: string;
  unrealized_gain_loss: string | null;
  valuation_source: string;
  is_estimate: boolean;
  valued_at: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  notes: string;
  primary_photo_url: string | null;
  photos: ItemPhoto[];
  created_at: string;
  updated_at: string;
}

export interface ContainerNode {
  id: string;
  name: string;
  container_type: string;
  parent_id: string | null;
  location_notes: string;
  direct_item_count: number;
  total_item_count: number;
  total_market_value: string;
  total_melt_value: string;
  children: ContainerNode[];
}

export interface PortfolioSummary {
  total_items: number;
  unique_entries: number;
  total_market_value: string;
  total_melt_value: string;
  total_cost_basis: string;
  unrealized_pnl: string;
  realized_pnl: string;
  gold_silver_ratio: string | null;
  spot_prices: Record<string, string>;
  metal_breakdown: Array<{
    metal_type: string;
    fine_troy_oz: string;
    melt_value: string;
    market_value: string;
    avg_cost_per_troy_oz: string | null;
  }>;
  category_breakdown: Array<{
    category: string;
    count: number;
    market_value: string;
  }>;
  top_valuable_items: CollectionItem[];
}

export interface CsvImportPreview {
  detected_preset: string;
  headers: string[];
  target_fields: string[];
  suggested_mapping: Record<string, string>;
  total_rows: number;
  sample_rows: Array<Record<string, string>>;
  normalized_preview: Array<{
    title: string;
    category: string;
    metal_type: string;
    grade: string;
    quantity: number;
    purchase_price: string | null;
    market_value_unit: string;
  }>;
}

export interface MappedCsvImportResult {
  created_count: number;
  errors: Array<{ row: number; error: string }>;
  warnings: string[];
}

export interface CredentialStatus {
  provider: string;
  label: string;
  is_configured: boolean;
  masked_hint: string;
  updated_at: string | null;
}

export interface VisionCandidate {
  category: string;
  title: string;
  country: string;
  year: string;
  mint_or_refiner: string;
  denomination: string;
  series: string;
  metal_type: string;
  weight_value: number;
  weight_unit: string;
  purity: number;
  grading_service: string;
  cert_number: string;
  grade: string;
  estimated_grade: string;
  serial_number: string;
  estimated_value_usd: number;
  ai_confidence: number;
  notes: string;
}

export interface VisionIdentifyResponse {
  job_id: string;
  provider_used: string;
  candidate: VisionCandidate;
  warning: string | null;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const resp = await fetch(`/api/v1${path}`, { ...init, headers });
  if (!resp.ok) {
    if (resp.status === 401) {
      setAuthToken(null);
    }
    let detail = `Request failed (${resp.status})`;
    try {
      const err = await resp.json();
      detail = err.detail || err.message || detail;
    } catch {
      // ignore non-json
    }
    throw new Error(detail);
  }
  if (resp.status === 204) {
    return undefined as T;
  }
  return resp.json() as Promise<T>;
}

export const api = {
  register: (payload: { email: string; password: string; display_name?: string }) =>
    apiFetch<{ access_token: string; user: AuthUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<{ access_token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => apiFetch<AuthUser>("/auth/me"),

  getSummary: () => apiFetch<PortfolioSummary>("/analytics/summary"),
  refreshSpots: () => apiFetch<Record<string, string>>("/valuation/spots/refresh", { method: "POST" }),

  getItems: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v !== undefined)
    ).toString();
    return apiFetch<CollectionItem[]>(`/catalog/items${qs ? `?${qs}` : ""}`);
  },
  getPresets: () => apiFetch<Array<Record<string, unknown>>>("/catalog/items/presets"),
  getItem: (id: string) => apiFetch<CollectionItem>(`/catalog/items/${id}`),
  createItem: (payload: Record<string, unknown>) =>
    apiFetch<CollectionItem>("/catalog/items", { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (id: string, payload: Record<string, unknown>) =>
    apiFetch<CollectionItem>(`/catalog/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteItem: (id: string) =>
    apiFetch<void>(`/catalog/items/${id}`, { method: "DELETE" }),

  uploadPhoto: (itemId: string, file: File, label = "OBVERSE", isPrimary = false) => {
    const form = new FormData();
    form.append("file", file);
    form.append("label", label);
    form.append("is_primary", String(isPrimary));
    return apiFetch<ItemPhoto>(`/catalog/items/${itemId}/photos`, { method: "POST", body: form });
  },
  setPrimaryPhoto: (itemId: string, photoId: string) =>
    apiFetch<ItemPhoto>(`/catalog/items/${itemId}/photos/${photoId}/primary`, { method: "PATCH" }),
  deletePhoto: (itemId: string, photoId: string) =>
    apiFetch<void>(`/catalog/items/${itemId}/photos/${photoId}`, { method: "DELETE" }),

  appraiseItem: (id: string) =>
    apiFetch<CollectionItem>(`/valuation/items/${id}/appraise`, { method: "POST" }),
  getCertUrl: (id: string) =>
    apiFetch<{ grading_service: string; cert_number: string; url: string | null }>(
      `/valuation/items/${id}/cert-url`
    ),

  getContainers: () => apiFetch<ContainerNode[]>("/catalog/containers"),
  createContainer: (payload: {
    name: string;
    container_type: string;
    parent_id?: string | null;
    location_notes?: string;
  }) =>
    apiFetch<ContainerNode>("/catalog/containers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteContainer: (id: string) =>
    apiFetch<void>(`/catalog/containers/${id}`, { method: "DELETE" }),

  identifyImages: (files: File[], barcodeHint?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (barcodeHint) form.append("barcode_hint", barcodeHint);
    return apiFetch<VisionIdentifyResponse>("/vision/identify", { method: "POST", body: form });
  },

  importCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ created_count: number; errors: Array<{ row: number; error: string }> }>(
      "/catalog/items/import/csv",
      { method: "POST", body: form }
    );
  },

  previewCsvImport: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<CsvImportPreview>("/catalog/items/import/preview", {
      method: "POST",
      body: form,
    });
  },

  importMappedCsv: (
    file: File,
    mapping: Record<string, string>,
    importPhotos: boolean
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("import_photos", importPhotos ? "true" : "false");
    return apiFetch<MappedCsvImportResult>("/catalog/items/import/mapped", {
      method: "POST",
      body: form,
    });
  },

  getCredentials: () => apiFetch<CredentialStatus[]>("/settings/credentials"),
  upsertCredential: (provider: string, value: string) =>
    apiFetch<CredentialStatus>(`/settings/credentials/${provider}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
  deleteCredential: (provider: string) =>
    apiFetch<void>(`/settings/credentials/${provider}`, { method: "DELETE" }),
};

