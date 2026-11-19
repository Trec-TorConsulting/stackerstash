const TOKEN_KEY = "stackerstash_token";
const WORKSPACE_ID_KEY = "stackerstash_workspace_id";

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

export function getActiveWorkspaceId(): string | null {
  return localStorage.getItem(WORKSPACE_ID_KEY);
}

export function setActiveWorkspaceId(workspaceId: string | null): void {
  if (workspaceId) {
    localStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
  } else {
    localStorage.removeItem(WORKSPACE_ID_KEY);
  }
}

export type WorkspaceRole = "OWNER" | "EDITOR" | "VIEWER";
export type PlanTierCode = "FREE" | "PLUS" | "UNLIMITED" | "DEDICATED";

export class ApiError extends Error {
  status: number;
  code?: string;
  limit_type?: string;
  current_usage?: number;
  limit?: number | null;
  current_tier?: string;

  constructor(
    message: string,
    opts: {
      status: number;
      code?: string;
      limit_type?: string;
      current_usage?: number;
      limit?: number | null;
      current_tier?: string;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.limit_type = opts.limit_type;
    this.current_usage = opts.current_usage;
    this.limit = opts.limit;
    this.current_tier = opts.current_tier;
  }
}

export function isPlanLimitError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    (err.status === 402 || err.code === "PLAN_LIMIT_REACHED")
  );
}

export interface PlanSummary {
  tier: PlanTierCode | string;
  name: string;
  max_vaults: number | null;
  max_items: number | null;
  owned_vault_count: number;
  active_item_count: number;
  enforce_tiers: boolean;
  dedicated_server: boolean;
}

export interface PlanInfo {
  tier: PlanTierCode | string;
  name: string;
  monthly_price_cents: number;
  price_display: string;
  max_vaults: number | null;
  max_items: number | null;
  dedicated_server: boolean;
  summary: string;
  checkout_enabled: boolean;
}

export interface DedicatedInstanceInfo {
  id: string;
  status: "REQUESTED" | "PROVISIONING" | "ACTIVE" | "SUSPENDED" | string;
  requested_subdomain: string;
  dedicated_url: string;
  admin_notes: string;
  provisioned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingStatus {
  tier: PlanTierCode | string;
  plan_name: string;
  price_display: string;
  source: string;
  status: string;
  enforce_tiers: boolean;
  max_vaults: number | null;
  max_items: number | null;
  owned_vault_count: number;
  active_item_count: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  has_stripe_customer: boolean;
  checkout_configured: boolean;
  dedicated_instance?: DedicatedInstanceInfo | null;
}

export interface AdminDedicatedInstanceRecord extends DedicatedInstanceInfo {
  user_id: string;
  user_email: string;
  user_display_name: string;
}

export interface UserWorkspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  default_currency: string;
  auto_sort_enabled?: boolean;
  is_default?: boolean;
  item_count?: number;
  total_market_value?: string;
  role?: WorkspaceRole;
  is_shared?: boolean;
  owner_email?: string;
}

export interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  default_currency: string;
  auto_sort_enabled: boolean;
  description?: string;
  is_default?: boolean;
  role?: WorkspaceRole;
  is_shared?: boolean;
  owner_email?: string;
}

export function getWorkspaceRole(
  ws?: { role?: WorkspaceRole; is_shared?: boolean } | null
): WorkspaceRole {
  if (ws?.role === "OWNER" || ws?.role === "EDITOR" || ws?.role === "VIEWER") {
    return ws.role;
  }
  return ws?.is_shared ? "VIEWER" : "OWNER";
}

export function canEditWorkspace(
  ws?: { role?: WorkspaceRole; is_shared?: boolean } | null
): boolean {
  const role = getWorkspaceRole(ws);
  return role === "OWNER" || role === "EDITOR";
}

export function isWorkspaceOwner(
  ws?: { role?: WorkspaceRole; is_shared?: boolean } | null
): boolean {
  return getWorkspaceRole(ws) === "OWNER";
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: "EDITOR" | "VIEWER";
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  token: string;
  invite_path: string;
  invited_by_email: string;
  accepted_by_email?: string | null;
  expires_at: string;
  is_expired: boolean;
  created_at: string;
  responded_at?: string | null;
}

export interface InvitePreview {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_email: string;
  invited_by_email: string;
  email: string;
  role: "EDITOR" | "VIEWER";
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  expires_at: string;
  is_expired: boolean;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: WorkspaceRole;
  is_owner: boolean;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  workspace: UserWorkspace;
  workspaces?: UserWorkspace[];
  plan?: PlanSummary | null;
}

export interface AdminOverview {
  total_users: number;
  active_users: number;
  admin_users: number;
  recent_signups_7d: number;
  total_workspaces: number;
  total_items: number;
  total_containers: number;
  total_market_value: string;
  total_melt_value: string;
  last_spot_sync: string | null;
  pending_appraisals?: number;
  running_appraisals?: number;
  failed_appraisals_24h?: number;
  deferred_ai_items?: number;
  recent_identifications_24h?: number;
  db_healthy?: boolean;
  redis_healthy?: boolean;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  workspace_count: number;
  primary_workspace: { id: string; name: string; slug: string } | null;
  item_count: number;
  container_count: number;
  total_market_value: string;
  tier?: string;
  subscription_source?: string;
  subscription_status?: string;
  owned_vault_count?: number;
  active_item_count?: number;
}

export interface AdminWorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  default_currency: string;
  owner_email: string;
  member_count: number;
  item_count: number;
  container_count: number;
  total_market_value: string;
  total_melt_value: string;
  configured_providers: string[];
  created_at: string;
}

export interface ItemPhoto {
  id: string;
  url: string;
  thumbnail_url?: string | null;
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
  slab_designation?: string;
  estimated_grade: string;
  estimated_grade_range?: string;
  estimated_grade_rationale?: string;
  grading_upside_usd?: string | null;
  ai_confidence: number | null;
  serial_number: string;
  purchase_price: string | null;
  purchase_date: string | null;
  vendor: string;
  sold_price: string | null;
  sold_date: string | null;
  melt_value_unit: string;
  market_value_unit: string;
  market_value_low?: string | null;
  market_value_high?: string | null;
  total_melt_value: string;
  total_market_value: string;
  collector_premium_total: string;
  collector_premium_pct?: number | null;
  unrealized_gain_loss: string | null;
  valuation_source: string;
  valuation_confidence?: "HIGH" | "MEDIUM" | "LOW" | string;
  collectibility_tier?: "BULLION" | "SEMI_NUMISMATIC" | "KEY_DATE_COLLECTIBLE" | "NUMISMATIC" | string;
  hold_outlook?: string;
  valuation_drivers?: string[];
  is_estimate: boolean;
  valued_at: string | null;
  mint_mark?: string;
  mintage?: number | null;
  variety?: string;
  composition?: string;
  gross_weight_grams?: string | null;
  diameter_mm?: string | null;
  thickness_mm?: string | null;
  edge_type?: string;
  designer?: string;
  catalog_numbers?: Record<string, string>;
  specs_provenance?: Record<string, string>;
  tags: string[];
  attributes: Record<string, unknown>;
  notes: string;
  primary_photo_url: string | null;
  primary_thumbnail_url?: string | null;
  photos: ItemPhoto[];
  intake_source?: string;
  photo_verification_status?: string;
  photo_verification_notes?: string[];
  sort_category?: string;
  sort_subcategory?: string;
  sort_override?: boolean;
  sort_updated_at?: string | null;
  is_graded?: boolean;
  is_card_item?: boolean;
  card_game?: string;
  set_name?: string;
  set_code?: string;
  card_number?: string;
  rarity?: string;
  card_finish?: string;
  card_edition?: string;
  language?: string;
  raw_condition?: string;
  appraisal_job_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValuationSourceQuote {
  value: string | null;
  low?: string | null;
  high?: string | null;
  count?: number;
  photo_inspected?: boolean;
  verification_url?: string | null;
  status: string;
}

export interface ValuationHistoryEntry {
  id: string;
  melt_value_unit: string;
  market_value_unit: string;
  source: string;
  is_estimate: boolean;
  raw_payload: {
    sources?: Record<string, ValuationSourceQuote>;
    low_usd?: string | null;
    high_usd?: string | null;
    confidence?: string;
    collectibility_tier?: string;
    hold_outlook?: string;
    valuation_drivers?: string[];
    grounded_sources?: { title: string; uri: string }[];
    errors?: Record<string, string>;
  };
  recorded_at: string;
}

export interface AppraisalJob {
  id: string;
  item_id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  steps: Record<string, string>;
  error_message: string;
  created_at: string;
  completed_at: string | null;
  item: CollectionItem | null;
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
  queued_appraisals?: number;
  errors: Array<{ row: number; error: string }>;
  warnings: string[];
}

export interface CredentialStatus {
  provider: string;
  label: string;
  is_configured: boolean;
  masked_hint: string;
  updated_at: string | null;
  is_inherited?: boolean;
  inherited_from_workspace_name?: string | null;
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
  slab_designation?: string;
  estimated_grade: string;
  serial_number: string;
  card_game?: string;
  set_name?: string;
  set_code?: string;
  card_number?: string;
  rarity?: string;
  card_finish?: string;
  card_edition?: string;
  language?: string;
  raw_condition?: string;
  estimated_value_usd: number;
  ai_confidence: number;
  notes: string;
}

export interface VisionIdentifyResponse {
  job_id: string;
  provider_used: string;
  candidate: VisionCandidate;
  warning: string | null;
  verification_status?: "VERIFIED" | "FLAGGED" | string;
  verification_warnings?: string[];
  quota_deferred?: boolean;
}

async function _authorizedFetch(
  path: string,
  init: RequestInit = {},
  allowStaleWorkspaceRetry = true
): Promise<Response> {
  const token = getAuthToken();
  const activeWorkspaceId = getActiveWorkspaceId();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (activeWorkspaceId && !headers.has("X-Workspace-Id")) {
    headers.set("X-Workspace-Id", activeWorkspaceId);
  }
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const resp = await fetch(`/api/v1${path}`, { ...init, headers });
  if (resp.status === 403 && activeWorkspaceId) {
    setActiveWorkspaceId(null);
    if (allowStaleWorkspaceRetry && path.startsWith("/auth/me")) {
      const retryHeaders = new Headers(init.headers);
      if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
      if (!(init.body instanceof FormData) && !retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }
      const retryResp = await fetch(`/api/v1${path}`, { ...init, headers: retryHeaders });
      if (retryResp.ok) {
        return retryResp;
      }
    }
  }
  if (!resp.ok) {
    if (resp.status === 401) {
      setAuthToken(null);
    }
    let detail = `Request failed (${resp.status})`;
    let code: string | undefined;
    let limit_type: string | undefined;
    let current_usage: number | undefined;
    let limit: number | null | undefined;
    let current_tier: string | undefined;
    try {
      const err = await resp.json();
      detail = err.detail || err.message || detail;
      code = err.code;
      limit_type = err.limit_type;
      current_usage = err.current_usage;
      limit = err.limit;
      current_tier = err.current_tier;
    } catch {
      // ignore non-json
    }
    throw new ApiError(detail, {
      status: resp.status,
      code,
      limit_type,
      current_usage,
      limit,
      current_tier,
    });
  }
  return resp;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await _authorizedFetch(path, init);
  if (resp.status === 204) {
    return undefined as T;
  }
  return resp.json() as Promise<T>;
}

export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const resp = await _authorizedFetch(path, init);
  return resp.blob();
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
  getWorkspaces: () => apiFetch<UserWorkspace[]>("/auth/workspaces"),
  createWorkspace: (payload: {
    name: string;
    description?: string;
    default_currency?: string;
    auto_sort_enabled?: boolean;
  }) =>
    apiFetch<UserWorkspace>("/auth/workspaces", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkspace: (
    workspaceId: string,
    payload: {
      name?: string;
      description?: string;
      default_currency?: string;
      auto_sort_enabled?: boolean;
    }
  ) =>
    apiFetch<UserWorkspace>(`/auth/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  setDefaultWorkspace: (workspaceId: string) =>
    apiFetch<UserWorkspace>(`/auth/workspaces/${workspaceId}/set-default`, {
      method: "POST",
    }),
  deleteWorkspace: (workspaceId: string) =>
    apiFetch<void>(`/auth/workspaces/${workspaceId}`, { method: "DELETE" }),
  listWorkspaceInvites: (workspaceId: string) =>
    apiFetch<WorkspaceInvitation[]>(`/auth/workspaces/${workspaceId}/invites`),
  createWorkspaceInvite: (
    workspaceId: string,
    payload: { email: string; role: "EDITOR" | "VIEWER" }
  ) =>
    apiFetch<WorkspaceInvitation>(`/auth/workspaces/${workspaceId}/invites`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  revokeWorkspaceInvite: (workspaceId: string, inviteId: string) =>
    apiFetch<void>(`/auth/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: "DELETE",
    }),
  listWorkspaceMembers: (workspaceId: string) =>
    apiFetch<WorkspaceMember[]>(`/auth/workspaces/${workspaceId}/members`),
  updateWorkspaceMember: (
    workspaceId: string,
    membershipId: string,
    role: "EDITOR" | "VIEWER"
  ) =>
    apiFetch<WorkspaceMember>(
      `/auth/workspaces/${workspaceId}/members/${membershipId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }
    ),
  removeWorkspaceMember: (workspaceId: string, membershipId: string) =>
    apiFetch<void>(`/auth/workspaces/${workspaceId}/members/${membershipId}`, {
      method: "DELETE",
    }),
  leaveWorkspace: (workspaceId: string) =>
    apiFetch<void>(`/auth/workspaces/${workspaceId}/leave`, {
      method: "POST",
    }),
  listPendingInvites: () =>
    apiFetch<WorkspaceInvitation[]>("/auth/invites/pending"),
  previewInvite: (token: string) =>
    apiFetch<InvitePreview>(`/auth/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    apiFetch<UserWorkspace>(`/auth/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),
  declineInvite: (token: string) =>
    apiFetch<void>(`/auth/invites/${encodeURIComponent(token)}/decline`, {
      method: "POST",
    }),
  updateProfile: (payload: { display_name: string }) =>
    apiFetch<AuthUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    apiFetch<{ detail: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteAccount: (password: string) =>
    apiFetch<void>("/auth/me", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    }),

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
  duplicateItem: (id: string) =>
    apiFetch<CollectionItem>(`/catalog/items/${id}/duplicate`, { method: "POST" }),
  deleteItem: (id: string) =>
    apiFetch<void>(`/catalog/items/${id}`, { method: "DELETE" }),
  exportCsv: () => apiFetchBlob("/catalog/items/export/csv"),
  exportJson: () => apiFetchBlob("/catalog/items/export/json"),
  exportInsuranceReport: () => apiFetchBlob("/catalog/items/export/insurance-report"),
  resortCollection: () =>
    apiFetch<{ queued_count: number }>("/catalog/items/resort", { method: "POST" }),
  bulkDeleteItems: (itemIds: string[]) =>
    apiFetch<{ deleted_count: number }>("/catalog/items/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ item_ids: itemIds }),
    }),
  bulkUpdateItems: (payload: {
    item_ids: string[];
    category?: string;
    status?: string;
    container_id?: string | null;
    clear_container?: boolean;
    metal_type?: string;
    grading_service?: string;
    clear_slab?: boolean;
    add_tags?: string[];
    remove_tags?: string[];
  }) =>
    apiFetch<{ updated_count: number }>("/catalog/items/bulk-update", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadPhoto: (
    itemId: string,
    file: File,
    label = "OBVERSE",
    isPrimary = false,
    options: { autoCrop?: boolean } = {}
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("label", label);
    form.append("is_primary", String(isPrimary));
    // Server-side edge-detect crop. Disable when the client already cropped or the
    // user explicitly kept/edited the framing, so we never second-guess them.
    form.append("auto_crop", String(options.autoCrop ?? true));
    return apiFetch<ItemPhoto>(`/catalog/items/${itemId}/photos`, { method: "POST", body: form });
  },
  rotatePhoto: (itemId: string, photoId: string, degrees: number = 90) =>
    apiFetch<ItemPhoto>(`/catalog/items/${itemId}/photos/${photoId}/rotate`, {
      method: "POST",
      body: JSON.stringify({ degrees }),
    }),
  setPrimaryPhoto: (itemId: string, photoId: string) =>
    apiFetch<ItemPhoto>(`/catalog/items/${itemId}/photos/${photoId}/primary`, { method: "PATCH" }),
  deletePhoto: (itemId: string, photoId: string) =>
    apiFetch<void>(`/catalog/items/${itemId}/photos/${photoId}`, { method: "DELETE" }),

  appraiseItem: (id: string) =>
    apiFetch<AppraisalJob>(`/valuation/items/${id}/appraise`, { method: "POST" }),
  getAppraisalJob: (jobId: string) =>
    apiFetch<AppraisalJob>(`/valuation/jobs/${jobId}`),
  getItemValuations: (itemId: string) =>
    apiFetch<ValuationHistoryEntry[]>(`/valuation/items/${itemId}/valuations`),
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
  updateContainer: (
    id: string,
    payload: {
      name: string;
      container_type: string;
      parent_id?: string | null;
      location_notes?: string;
    }
  ) =>
    apiFetch<ContainerNode>(`/catalog/containers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteContainer: (id: string) =>
    apiFetch<void>(`/catalog/containers/${id}`, { method: "DELETE" }),

  identifyImages: (
    files: File[],
    barcodeHint?: string,
    intakeMode: "camera" | "upload" = "camera",
    identifyMode: "full" | "fast_local" = "full"
  ) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (barcodeHint) form.append("barcode_hint", barcodeHint);
    form.append("intake_mode", intakeMode);
    if (identifyMode !== "full") {
      form.append("identify_mode", identifyMode);
    }
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

  getWorkspaceSettings: () => apiFetch<WorkspaceSettings>("/settings/workspace"),
  updateWorkspaceSettings: (payload: {
    name?: string;
    description?: string;
    default_currency?: string;
    auto_sort_enabled?: boolean;
  }) =>
    apiFetch<WorkspaceSettings>("/settings/workspace", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getCredentials: () => apiFetch<CredentialStatus[]>("/settings/credentials"),
  upsertCredential: (provider: string, value: string) =>
    apiFetch<CredentialStatus>(`/settings/credentials/${provider}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
  deleteCredential: (provider: string) =>
    apiFetch<void>(`/settings/credentials/${provider}`, { method: "DELETE" }),

  adminOverview: () => apiFetch<AdminOverview>("/admin/overview"),
  adminUsers: (params?: { q?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status && params.status !== "all") qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch<AdminUserRecord[]>(`/admin/users${suffix}`);
  },
  adminUpdateUser: (
    userId: string,
    payload: { is_active?: boolean; is_staff?: boolean; display_name?: string }
  ) =>
    apiFetch<AdminUserRecord>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  adminWorkspaces: (q?: string) => {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
    return apiFetch<AdminWorkspaceRecord[]>(`/admin/workspaces${suffix}`);
  },
  getPlans: () => apiFetch<PlanInfo[]>("/billing/plans"),
  getBillingStatus: () => apiFetch<BillingStatus>("/billing/status"),
  createCheckoutSession: (payload: {
    tier: "PLUS" | "UNLIMITED" | "DEDICATED";
    requested_subdomain?: string;
  }) =>
    apiFetch<{ url: string; session_id: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createPortalSession: () =>
    apiFetch<{ url: string }>("/billing/portal", {
      method: "POST",
    }),
  adminUpdateUserSubscription: (
    userId: string,
    payload: {
      tier?: string;
      clear_override?: boolean;
      admin_notes?: string;
      requested_subdomain?: string;
    }
  ) =>
    apiFetch<AdminUserRecord>(`/admin/users/${userId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  adminListDedicatedInstances: () =>
    apiFetch<AdminDedicatedInstanceRecord[]>("/admin/dedicated-instances"),
  adminUpdateDedicatedInstance: (
    instanceId: string,
    payload: {
      status?: string;
      dedicated_url?: string;
      admin_notes?: string;
    }
  ) =>
    apiFetch<AdminDedicatedInstanceRecord>(
      `/admin/dedicated-instances/${instanceId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    ),
};

