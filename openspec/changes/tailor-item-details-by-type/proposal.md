# Proposal: Tailor Item Details and Views by Category / Type

## Why
Currently, the item detail page (`ItemDetailPage.tsx`), item editing modal, and item creation flows treat all collection items almost homogeneously. As a result, non-bullion collectibles like Trading Cards and Paper Currency display irrelevant bullion and coin metrics—such as "Metal & Fine Weight Non-Bullion (0 ozt)", "Melt Value $0.00", "Premium $0.00", coin "Diameter", "Thickness", and "Edge Type". 

This clutter distracts collectors, degrades information hierarchy, and creates confusion. Tailoring item detail views, valuation cards, and edit forms to the specific collectible type (`COIN`, `BAR`, `ROUND`, `PAPER`, `CARD`, `OTHER`) ensures collectors immediately see pertinent, category-specific information without distracting placeholder data.

## What Changes
- **Category-Tailored Item Detail Overview**:
  - Suppress "Metal & Fine Weight" for non-metallic items (`CARD`, `PAPER`, non-bullion `OTHER`). Only display it when `item.metal_type !== "NONE"` or category is `BAR`, `ROUND`, or metallic `COIN`.
  - Replace the "Melt Value / Premium" hero card for `PAPER` (banknotes) with a dedicated "Grade / Condition & Serial" hero card (similar to cards), eliminating meaningless "$0.00 Melt" readouts.
  - Adapt field labels based on asset class (e.g., "Mint / Refiner" for bullion/coins vs. "Manufacturer / Publisher" for cards vs. "Issuing Bank / Printer" for currency; "Mint Year" vs. "Series / Year" vs. "Release Year").
  - Hide "Denomination" for categories where it does not exist (`CARD`, `BAR`, `ROUND`).
- **Dedicated Banknote Specifications UI Panel**:
  - Introduce `BanknoteSpecsCard` for `PAPER` items (and banknote slabs like PMG / PCGS Banknote), replacing the coin-focused `NumismaticSpecsCard`.
  - Display banknote-specific attributes: Country/Issuing Authority, Denomination, Series Year, Serial Number with Fancy Serial classification (Star note ★, Radar, Repeater, Binary, etc.), Friedberg / Pick catalog numbers, Issuing District / Federal Reserve Bank, Signatures, Paper Quality designations (EPQ, PPQ), and PMG/PCGS Banknote slab holder sizing.
- **Category-Scoped Edit and Add Forms**:
  - Partition the item edit form and scan/add form so users only see fields applicable to the selected category:
    - **Trading Cards (`CARD`)**: Display Card Game, Set Name, Set Code, Card Number, Rarity, Finish, Edition, Language, Condition, Card Grading (PSA, BGS, CGC, SGC, TAG). Suppress metal type, weight, and purity.
    - **Paper Currency (`PAPER`)**: Display Country, Denomination, Series, Serial Number, District/Bank, Banknote Grading (PMG, PCGS Banknote). Suppress metal type and weight (unless Goldback).
    - **Bars & Ingots (`BAR`)** / **Rounds (`ROUND`)**: Display Refiner/Mint, Metal Type, Weight, Weight Unit, Purity, Assay Serial Number, Bar/Round Dimensions. Suppress card and banknote fields.
    - **Coins (`COIN`)**: Display Country, Denomination, Year, Mint Mark, Mintage, Metal/Weight (if bullion), Numismatic Specs, Coin Grading.
- **Enhanced Collectibility & Valuation Context**:
  - Tailor `CollectibilityThesisCard` to reference appropriate grading services (PSA/BGS/CGC for cards, PMG/PCGS Banknote for paper, PCGS/NGC/CACG for coins) and collectible terms (TCG/Sports collectible vs Numismatic).

## Capabilities

### New Capabilities
- `banknote-specs-and-catalog`: Structured metadata, fancy serial analysis, catalog reference matching, and dedicated Banknote Specifications UI presentation for paper currency and banknotes.

### Modified Capabilities
- `catalog-inventory`: Type-tailored item detail views, valuation cards, and edit/add modal forms that hide non-pertinent fields (e.g. "Metal & Fine Weight Non-Bullion (0 ozt)" and "$0.00 Melt") and emphasize category-specific attributes.
- `trading-card-specs-and-catalog`: Ensure complete isolation of trading card detail presentations from numismatic and bullion fields across all item detail, edit, and summary views.

## Impact
- **Frontend**:
  - `frontend/src/pages/ItemDetailPage.tsx`: Tailor read-only detail grid, valuation hero cards, and edit form based on item category.
  - `frontend/src/components/valuation/BanknoteSpecsCard.tsx`: New component displaying banknote specifications, fancy serials, catalog IDs, and storage fit.
  - `frontend/src/components/valuation/CollectibilityThesisCard.tsx`: Contextualize advice and grading services based on category.
  - `frontend/src/components/valuation/NumismaticSpecsCard.tsx` / `CardSpecsCard.tsx`: Ensure clean category bounds.
  - `frontend/src/pages/ScanAddPage.tsx`: Dynamically adjust visible form inputs when category changes.
- **Backend**:
  - Reference models (`StaticBanknoteSpec`) and catalog schemas are already established; enhance serializer or attributes payload if needed to support seamless front-end binding of banknote specs and storage fit recommendations.
- **Specs & Tests**:
  - Delta specs in `openspec/changes/tailor-item-details-by-type/specs/`.
  - Comprehensive unit and integration test coverage for type-tailored view rendering.
