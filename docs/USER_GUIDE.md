# StackVault User Guide & How-Tos

Welcome to **StackVault** — your self-hosted or SaaS vault for tracking coins, paper currency, bullion bars, rounds, and graded slabs.

---

## Table of Contents
1. [Quick Start: Creating Your Vault](#1-quick-start-creating-your-vault)
2. [Dashboard & Live Spot Prices](#2-dashboard--live-spot-prices)
3. [Adding Items via Vision AI Scan or Presets](#3-adding-items-via-vision-ai-scan-or-presets)
4. [Migrating from CoinSnap, Numista, PCGS/NGC, or Spreadsheets](#4-migrating-from-coinsnap-numista-pcgsngc-or-spreadsheets)
5. [Organizing Storage Containers](#5-organizing-storage-containers)
6. [Appraisals, Cert Verification & Insurance Reports](#6-appraisals-cert-verification--insurance-reports)
7. [Configuring BYOK API Keys (Settings)](#7-configuring-byok-api-keys-settings)
8. [Django Operator Admin Portal](#8-django-operator-admin-portal)

---

## 1. Quick Start: Creating Your Vault
1. Open the StackVault web app (`http://localhost:5173` in local dev, or `http://localhost:8080` via Docker Compose).
2. Click **Create Vault**, enter your email, password (8+ characters), and a workspace/vault name (e.g., `"Personal Stack"`).
3. You are automatically signed into your isolated workspace.

---

## 2. Dashboard & Live Spot Prices
- **Live Spot Ticker**: Displays real-time spot prices (normalized to **USD per troy ounce**) for **Gold (`XAU`)**, **Silver (`XAG`)**, **Platinum (`XPT`)**, **Palladium (`XPD`)**, and **Copper (`HG`)**, plus the **Gold/Silver Ratio (GSR)**.
- **Automatic & Manual Refresh**:
  - The Dashboard automatically refreshes live spot prices when opened and every **5 minutes** while open.
  - Click the **refresh icon** next to the **Live Spot** header at any time to fetch fresh quotes immediately and recalculate melt values across all bullion items.
- **Note on Copper (`HG`)**: COMEX copper futures are quoted in USD/lb; StackVault automatically converts them to USD/troy oz (`÷ 14.583333`) so 1 kg copper bars and 1 avdp oz copper rounds calculate accurate melt values.

---

## 3. Adding Items via Vision AI Scan or Presets
1. Navigate to **Scan / Add** in the top navigation bar.
2. **Option A — Quick Presets**: Pick a common bullion preset (e.g., *1 oz American Silver Eagle*, *1 kg Copper Bar*, *10 oz Geiger Silver Bar*, *1 oz Gold Buffalo*) to pre-fill weight, purity, and metal type.
3. **Option B — Vision AI Scan**: Upload or snap obverse/reverse photos (or enter a slab barcode/cert number) and click **Identify with Vision AI**.
   - Uses your workspace's **Gemini Vision** key first, falls back to self-hosted **Ollama** if configured, or lets you edit fields manually.
4. Assign a storage container, enter purchase price/date if desired, and click **Save to Vault**.

---

## 4. Migrating from CoinSnap, Numista, PCGS/NGC, or Spreadsheets
StackVault includes an **Import / Migrate** wizard on the **Collection** page so you can bring existing collections over in seconds:

1. Export your collection as a **CSV** from your current platform:
   - **CoinSnap**: Use CoinSnap's *Export Collection (CSV via email)* feature.
   - **Numista**: Go to *My Coins -> Export -> CSV*.
   - **PCGS / NGC Set Registry**: Export inventory table to CSV.
   - **Excel / Google Sheets**: Save or download as `.csv`.
2. In StackVault, open **Collection** and click **Import / Migrate CSV**.
3. Select your `.csv` file:
   - StackVault **auto-detects** the source format (`CoinSnap Export`, `Numista Export`, `PCGS / NGC Registry`, `StackVault Native`, or `Custom Spreadsheet`).
   - Review or adjust any **Column Mapping** dropdowns (or set columns to `— Skip —`).
   - Check the **Sample Preview** table to verify synthesized titles, metals, grades, and values.
   - *(Optional)* If your CSV contains image URLs (such as CoinSnap's `Obverse Image` / `Reverse Image`), keep **Download and attach photos** checked to import them best-effort.
4. Click **Import Items**. StackVault strips currency formatting (`$1,250.00`), normalizes metal/composition strings (`"90% Silver"` → `SILVER`, `"Copper-Nickel Clad"` → `NONE`), and synthesizes titles when a dedicated title column isn't present.

---

## 5. Organizing Storage Containers
1. Open **Containers** to create hierarchical physical storage locations (e.g., `Home Safe` → `Monster Box #1` → `ASE Tube A`).
2. Assign items to any container during creation or on the item's detail page.
3. Container cards display direct and rolled-up item counts, total melt value, and total market value.

---

## 6. Appraisals, Cert Verification & Insurance Reports
- **Appraise Item**: On any item's detail page, click **Appraise / Refresh Value** to run the valuation waterfall:
  1. Live Spot Melt (for bullion)
  2. PCGS Price Guide (when BYOK PCGS token is set)
  3. Greysheet CDN (when BYOK Greysheet credentials are set)
  4. AI Estimate fallback (clearly badged `AI Estimate`)
- **Official Cert Links**: Graded slabs (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS) include direct one-click links to the grader's official cert verification page.
- **Insurance / Print Report**: On the **Collection** page, click **Print Report** (or **Export CSV** / download JSON from `/api/v1/catalog/items/export/json`) for a clean, print-ready inventory report.

---

## 7. Configuring BYOK API Keys (Settings)
Navigate to **Settings** to add optional Bring-Your-Own-Key credentials (encrypted at rest with Fernet):
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
