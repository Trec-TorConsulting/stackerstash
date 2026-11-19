# Stacker Stash User Guide & How-Tos

Welcome to **Stacker Stash** — your self-hosted or SaaS vault for tracking coins, paper currency, bullion bars, rounds, and graded slabs.

---

## Table of Contents
1. [Quick Start: Creating Your Vault](#1-quick-start-creating-your-vault)
2. [Dashboard & Live Spot Prices](#2-dashboard--live-spot-prices)
3. [Adding Items via Vision AI Scan or Presets](#3-adding-items-via-vision-ai-scan-or-presets)
4. [Migrating from CoinSnap, Numista, PCGS/NGC, or Spreadsheets](#4-migrating-from-coinsnap-numista-pcgsngc-or-spreadsheets)
5. [Organizing Storage Containers](#5-organizing-storage-containers)
6. [Appraisals, Cert Verification & Insurance Reports](#6-appraisals-cert-verification--insurance-reports)
7. [Multi-Vault Management, Shared Vaults & BYOK API Keys (Settings)](#7-multi-vault-management-account-security--byok-api-keys-settings)
8. [Django Operator Admin Portal](#8-django-operator-admin-portal)
9. [Subscription Tiers, Billing & Dedicated Hosting](#9-subscription-tiers-billing--dedicated-hosting)

---

## 1. Quick Start: Creating Your Vault
1. Open the Stacker Stash web app (`http://localhost:5173` in local dev, or `http://localhost:8080` via Docker Compose).
2. Click **Create Vault**, enter your email, password (8+ characters), and a workspace/vault name (e.g., `"Personal Stack"`).
3. You are automatically signed into your isolated workspace.

---

## 2. Dashboard & Live Spot Prices
- **Live Spot Ticker**: Displays real-time spot prices (normalized to **USD per troy ounce**) for **Gold (`XAU`)**, **Silver (`XAG`)**, **Platinum (`XPT`)**, **Palladium (`XPD`)**, and **Copper (`HG`)**, plus the **Gold/Silver Ratio (GSR)**.
- **Automatic & Manual Refresh**:
  - The Dashboard automatically refreshes live spot prices when opened and every **5 minutes** while open.
  - Click the **refresh icon** next to the **Live Spot** header at any time to fetch fresh quotes immediately and recalculate melt values across all bullion items.
- **Note on Copper (`HG`)**: COMEX copper futures are quoted in USD/lb; Stacker Stash automatically converts them to USD/troy oz (`÷ 14.583333`) so 1 kg copper bars and 1 avdp oz copper rounds calculate accurate melt values.

---

## 3. Adding Items via Vision AI Scan or Presets
1. Navigate to **Scan / Add** in the top navigation bar.
2. **Option A — Quick Presets**: Pick a common bullion preset (e.g., *1 oz American Silver Eagle*, *1 kg Copper Bar*, *10 oz Geiger Silver Bar*, *1 oz Gold Buffalo*) to pre-fill weight, purity, and metal type.
3. **Option B — Guided Camera Capture**: Click **Take Photo** to open the CoinSnap-style guided viewfinder:
   - Choose a **Coin (Circle)** or **Note / Bar (Rect)** reticle and adjust **1x–3x zoom** to center the item.
   - Live framing feedback monitors brightness and edge sharpness (*"Sharp & well-lit — ready"*).
   - Capture **Front (Obverse)** followed by **Back (Reverse)** (or skip the back for single-sided bars/slabs). A native camera capture fallback is provided automatically if browser camera access is unavailable.
4. **Option C — Upload Photos**: Click **Upload Obverse / Reverse** to upload existing images.
   - **Coins & Paper Notes** require both **Front (Obverse)** and **Back (Reverse)** photos before AI identification; Bars and Slabs accept a single photo.
   - Uploaded photos undergo deeper quality and authenticity checks (resolution, blur, exposure, EXIF software/AI/screenshot markers, and screen-moiré detection). If a photo is flagged, you can review the warning and either replace the photo or click **Proceed Anyway** (which records an `OVERRIDDEN` verification badge on the item).
5. Click **Identify with AI** to auto-fill specs, metal, estimated raw grade, and market value, then click **Save Item to Vault**.
   - The **Item Details** section below photo capture starts collapsed by default and opens automatically once **Identify with AI** returns item details (you can also click **Item Details** anytime to expand it for manual entry).
   - Titles are automatically normalized for uniformity across your vault, and a background appraisal job starts immediately upon saving (you will see live appraisal progress on the item's detail page).

---

## 4. Migrating from CoinSnap, Numista, PCGS/NGC, or Spreadsheets
Stacker Stash includes an **Import / Migrate** wizard on the **Collection** page so you can bring existing collections over in seconds:

1. Export your collection as a **CSV** from your current platform:
   - **CoinSnap**: Use CoinSnap's *Export Collection (CSV via email)* feature.
   - **Numista**: Go to *My Coins -> Export -> CSV*.
   - **PCGS / NGC Set Registry**: Export inventory table to CSV.
   - **Excel / Google Sheets**: Save or download as `.csv`.
2. In Stacker Stash, open **Collection** and click **Import / Migrate CSV**.
3. Select your `.csv` file:
   - Stacker Stash **auto-detects** the source format (`CoinSnap Export`, `Numista Export`, `PCGS / NGC Registry`, `Stacker Stash Native`, or `Custom Spreadsheet`).
   - Review or adjust any **Column Mapping** dropdowns (or set columns to `— Skip —`).
   - Check the **Sample Preview** table to verify synthesized titles, metals, grades, and values.
   - *(Optional)* If your CSV contains image URLs (such as CoinSnap's `Obverse Image` / `Reverse Image`), keep **Download and attach photos** checked to import them best-effort.
4. Click **Import Items**. Stacker Stash strips currency formatting (`$1,250.00`), normalizes metal/composition strings (`"90% Silver"` → `SILVER`, `"Copper-Nickel Clad"` → `NONE`), cleans up item titles for vault uniformity, and automatically queues throttled background appraisals for newly imported items.

---

## 5. Organizing Storage Containers
1. Open **Containers** to create hierarchical physical storage locations of any depth (e.g., `Home Safe` → `Monster Box #1` → `ASE Tube A`), including optional `Location Notes`.
2. Click the edit icon on any container to rename it, change its type or parent container, or update location notes; click **View Items** to open `/collection` filtered to that container.
3. Deleting a container prompts for confirmation before removing nested child containers (stored items stay in your vault as Unassigned).

---

## 6. Appraisals, Editing, Duplication & Offline Coin-Show Mode
- **Item Editing, Duplication & Photo Management**: On any item's detail page, click **Edit Details** to update cost basis (`purchase_price`), sold tracking (`sold_price`/`sold_date`), bullion weight/purity, tags, or trading card specs; use **Duplicate Item** to clone specs (clearing `cert_number` and sold fields); upload labeled photos (`Obverse`, `Reverse`, `Slab Label`, `Assay`, `Receipt`) and remove individual photos after confirmation.
- **Multi-Source Appraise Now**: On any item's detail page, click **Appraise Now** to run a non-blocking, concurrent appraisal pipeline:
  1. **Live Spot Melt Floor**: Immediately updates precious-metal melt value and ensures market value never drops below melt.
  2. **Numismatic Specs Enrichment**: Pulls mintage, composition, diameter, weight, edge, designer, and catalog numbers from PCGS, Numista, or AI (preserving any specs you manually edited).
  3. **Price Guides & Certs**: Evaluates PCGS, Greysheet CDN, NumisMedia FMV, and official cert links (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS).
  4. **Realized Sold Comps & Active Market Asks**: Aggregates recent eBay sold listings (or falls back to eBay Browse active asking prices when Marketplace Insights access isn't enabled), plus zero-key **Verify Comps** quick links to eBay Sold, Heritage Auctions, GreatCollections, and Stack's Bowers.
  5. **Multimodal AI Vision & Raw Grade Estimation**: Analyzes your obverse/reverse/slab photos alongside metadata (and optional Gemini Google Search grounding) to produce a price range, value drivers, collectibility thesis, and—for raw/unslabbed coins and notes—an **Estimated Grade**, likely grade range, and **Grading ROI** analysis.
- **Why It's Valued Here**: View the Melt vs. Collector Premium % bar, Low–Fair–High range, Confidence badge (`HIGH` / `MEDIUM` / `LOW`), key value drivers, and expandable Source Comparison table.
- **Collectibility & Hold Thesis**: Understand whether an item is *Bullion / Melt-Driven*, *Semi-Numismatic*, *Key Date / Scarce*, or *Numismatic*, including grading upside tips for raw coins.
- **Offline Coin-Show Mode (PWA)**: Viewed items, their valuation breakdowns, specs, and photos are cached locally in the PWA so you can inspect them at coin shows or local coin shops even without internet access.
- **Authenticated Exports & Print Reports**: On the **Collection** page, click **Export CSV**, **Export JSON**, or **Print Report** for authenticated downloads and print-ready inventory reports.

---

## 7. Multi-Vault Management, Account Security & BYOK API Keys (Settings)
- **Managing Multiple Vaults**: Use the **Vault Switcher** in the sidebar/header (or **My Vaults** in **Settings**) to create isolated vaults (e.g., *Personal Stack*, *IRA Bullion*, *Trading Cards*), switch active vaults, edit vault names/descriptions/currencies, set a **Default** vault, or delete non-final vaults safely. Each vault keeps its own items, containers, dashboard totals, exports, and slab cert uniqueness.
- **Shared Vaults & Role-Based Collaboration**:
  - **Invite Collaborators**: As a vault **Owner**, open **Settings → Vault Sharing & Members** while your vault is active, enter the collaborator's email, pick a role, and click **Send Invite** (or copy/revoke pending invite links).
  - **Roles**:
    - **Owner**: Full control over items, containers, appraisals, vault settings, member invitations, and BYOK API keys.
    - **Editor (`View & Catalog`)**: Can view the vault, export reports, manage items/containers/photos/CSV imports, and run Vision AI identification & appraisals using the vault owner's encrypted credentials — without seeing or modifying owner API keys or vault configuration.
    - **Viewer (`Read-only`)**: Can browse Dashboard/Collection/Containers/Item Details, refresh spot prices, and export CSV/JSON/Insurance reports, with all write controls hidden in the UI and blocked (`403`) on the API.
  - **Joining & Leaving**: Accept or decline pending invites from the **Pending Vault Invitations** banner at the top of the app or via a shared `/invite/<token>` link (with automatic prefill and post-login redirect). Collaborators can inspect their shared role in **Settings → Shared Vault Access** and click **Leave Shared Vault** at any time.
- **Account Security**: Update your display name, change your password, or permanently delete your account under **Profile & Account Security**.
- **BYOK Inheritance & Per-Vault Overrides**: Configure Bring-Your-Own-Key API credentials encrypted at rest in **Settings**:
  - Keys saved on your **Default** vault are automatically inherited across secondary vaults (Vision AI, appraisals, deferred AI enrichment, and Ollama auto-sort).
  - Saving a key while a secondary vault is active creates a **Vault Override**; removing that override cleanly restores inheritance from your Default vault.
- **Gemini API Key**: Enables Gemini Vision coin/banknote identification & AI valuation.
- **Ollama URL / Model**: Self-hosted vision fallback (e.g., `http://localhost:11434`).
- **PCGS Public API Token**: Enables automated PCGS Price Guide lookups by cert number.
- **Greysheet API Key / Token**: Enables Greysheet CDN pricing lookups.

---

## 8. Django Operator Admin Portal
The Django Admin portal is available at `/admin/` on the backend (`http://localhost:8000/admin/`).

There is no default admin password. To create an operator superuser:
```bash
cd backend
.venv/bin/python manage.py createsuperuser
```

---

## 9. Subscription Tiers, Billing & Dedicated Hosting

Stacker Stash offers four transparent access plans while keeping **CSV import/export, BYOK AI, and Shared Vaults** enabled on every tier:

| Plan | Monthly Price | Owned Vaults | Active Items | Hosting |
| :--- | :--- | :--- | :--- | :--- |
| **Collector Vault (Free)** | `$0` | `1` vault | `100` active entries | Shared cloud |
| **Plus** | `$9.99/mo` | `10` vaults | Unlimited | Shared cloud |
| **Unlimited** | `$19.99/mo` | Unlimited | Unlimited | Shared cloud |
| **Dedicated Server** | `$99.99/mo` | Unlimited | Unlimited | Isolated dedicated server |

- **How Vaults & Items Are Counted**:
  - **Owned Vaults**: Only vaults you own count against your vault cap; shared vaults you join as an `Editor` or `Viewer` do not consume your quota.
  - **Active Items**: Each non-`SOLD` catalog entry counts as `1` item regardless of quantity (for example, a tube of `20` Silver Eagles counts as `1` active entry). Marking items `SOLD` frees active quota, and downgrading never deletes existing vaults or items.
  - **Shared Vault Quotas**: Shared vaults evaluate active-item capacity against the **vault owner's** plan tier.
- **Stripe Checkout & Billing Portal**: Open **Settings → Plan & Billing** to view live usage meters, upgrade via **Stripe Checkout**, or click **Manage Subscription** for invoices and cancellations.
- **Dedicated Server Provisioning (`$99.99/mo`)**: Subscribing to **Dedicated Server** automatically creates a tracking request (`REQUESTED` → `PROVISIONING` → `ACTIVE`). Once provisioned by a Global Admin in **Admin → Dedicated Servers**, an **Open Dedicated Server** link appears in your **Plan & Billing** panel.
- **Self-Hosted Instances (`BILLING_ENFORCE_TIERS`)**: Self-hosted operators can set `BILLING_ENFORCE_TIERS=false` in `.env` to bypass plan paywalls (displayed in Settings as **Self-Hosted Mode (Unmetered)**).


