# Design: Type-Tailored Item Details and Specifications

## Context
See `proposal.md` for motivation and background.

Currently, `ItemDetailPage.tsx` displays metadata fields and hero cards uniformly across all item categories:
- A generic row unconditionally renders `Metal & Fine Weight: None / Non-Bullion (0 ozt)`.
- The valuation hero displays "Melt Value: $0.00 / Premium: $0.00" for non-metallic items like paper currency.
- Right-hand specifications card only branches between `isCardItem(item) ? <CardSpecsCard /> : <NumismaticSpecsCard />`, forcing paper banknotes to render coin-specific numismatic specifications (diameter, edge type, VAM variety, mint mark).
- The item edit form and `ScanAddPage` render all bullion inputs (metal type, weight value, weight unit, purity) for all items.

## Goals / Non-Goals

**Goals:**
- Provide clean, category-specific visual hierarchy across all item views:
  - Coins (`COIN`)
  - Bars / Ingots (`BAR`)
  - Rounds (`ROUND`)
  - Paper Currency / Banknotes (`PAPER`)
  - Trading Cards (`CARD`)
  - Other Collectibles (`OTHER`)
- Suppress irrelevant bullion fields ("Metal & Fine Weight Non-Bullion (0 ozt)", "$0.00 Melt") for non-metallic items (`CARD`, `PAPER`, non-bullion `OTHER`).
- Introduce a dedicated `BanknoteSpecsCard` component for paper currency, showing denomination, series, serial number, fancy serial analysis, catalog numbers, paper quality (EPQ/PPQ), and holder fit.
- Partition the item edit form and `ScanAddPage` to display only fields pertinent to the active category.
- Adapt labels and collectibility thesis tips to match the asset class (e.g., PSA/CGC for cards, PMG for paper, PCGS/NGC for coins).

**Non-Goals:**
- Breaking changes to database schema or existing API response schemas (existing `CollectionItem` columns and `attributes` JSON handle all metadata seamlessly).
- Disallowing precious metal on paper notes entirely (Goldbacks, which are 24k thin-film gold notes, will continue to support gold weight when `metal_type !== "NONE"`).

## Decisions

### Decision 1: Item Category Classification Helpers
Consolidate classification helpers in `frontend/src/lib/format.ts`:
- `isCardItem(item)`: Retained and expanded (checks `category === "CARD"`, `sort_category === "CARD"`, card grading services, or presence of `card_game`).
- `isBanknoteItem(item)`: Checks `item.category === "PAPER"`, `item.sort_category === "PAPER"`, grading service in `{"PMG", "PCGS_BANKNOTE"}`, or banknote attributes.
- `isBullionItem(item)`: Checks `item.category === "BAR" || item.category === "ROUND" || (item.category === "COIN" && item.metal_type !== "NONE")`.
- `hasPreciousMetal(item)`: Checks `item.metal_type && item.metal_type !== "NONE" && Number(item.fine_troy_oz || item.weight_value || 0) > 0`.

*Alternatives Considered:* Checking `item.category === "CARD"` inline everywhere. Rejected because slabbed items (`category === "SLAB"`) require inspecting grading service and attributes to determine the underlying asset class.

### Decision 2: Contextual Item Detail Overview
In `ItemDetailPage.tsx`:
1. **Metal & Fine Weight Row**: Render only when `hasPreciousMetal(item) || isBullionItem(item)`. Hides for cards, paper notes, and non-bullion collectibles.
2. **Denomination Row**: Render only when `item.denomination && (item.category === "COIN" || isBanknoteItem(item) || item.category === "OTHER")`. Hides for cards, bars, and rounds.
3. **Mint / Refiner Label**:
   - Cards: "Manufacturer / Publisher"
   - Banknotes: "Issuing Bank / Facility"
   - Coins / Bullion: "Mint / Refiner"
4. **Year Label**:
   - Cards: "Release Year"
   - Banknotes: "Series / Year"
   - Coins: "Mint Year"
   - Bullion Bars: "Production Year / Vintage"
5. **Valuation Hero (Right Card)**:
   - For Cards: Grade / Condition + Franchise / Set / Rarity.
   - For Banknotes: Grade / Condition + Serial Number & Fancy Serial badge / Series.
   - For Bullion / Coins with Metal: Melt Value + Collector Premium.
   - For Other Collectibles: Grade / Condition or Item Category.

### Decision 3: Dedicated `BanknoteSpecsCard` Component
Create `frontend/src/components/valuation/BanknoteSpecsCard.tsx`:
- Mirror the modular pattern of `CardSpecsCard` and `NumismaticSpecsCard`.
- Render:
  - Country / Issuing Authority
  - Face Denomination
  - Series Year & Name
  - Issuing District / Federal Reserve Bank
  - Serial Number with Star Note ★ / Fancy Serial classification (radar, repeater, binary, etc.)
  - Signatures (Treasurer / Register)
  - Catalog Numbers (Friedberg Fr. #, Pick P. #)
  - Paper Quality Designation (EPQ / PPQ)
  - Holder Sizing & PMG Storage Fit
- Provide inline editing support via `onSaveSpecs`.

### Decision 4: Category-Scoped Edit & Add Forms
In both `ItemDetailPage` edit form and `ScanAddPage`:
- Group fields into logical sections:
  - **Common Fields**: Title, Category, Quantity, Status, Container, Cost Basis, Purchase Date, Vendor, Market Value, Notes.
  - **Category-Specific Blocks**:
    - **Card Fields**: Card Game, Set Name, Set Code, Card Number, Rarity, Finish, Edition, Language, Raw Condition.
    - **Banknote Fields**: Country, Denomination, Series Year, Series, Serial Number, District / Bank.
    - **Bullion Fields**: Metal Type, Weight Value, Weight Unit, Purity, Assay Serial Number.
    - **Coin Numismatic Fields**: Mint Mark, Mintage, Variety, Composition, Dimensions (diameter, thickness, gross weight), Edge Type, Designer.
    - **Grading & Certification**: Filter available grading services by asset class (e.g. PSA/BGS/CGC for cards; PMG/PCGS Banknote for paper; PCGS/NGC/ANACS/CACG for coins).

### Decision 5: Collectibility Thesis Contextualization
Update `CollectibilityThesisCard.tsx`:
- If `isCardItem(item)`: Display "TCG / Sports Collectible" badge; advise third-party grading through PSA, BGS, CGC, or TAG.
- If `isBanknoteItem(item)`: Display "Paper Currency Collectible" badge; advise certification through PMG or PCGS Banknote.
- If `isBullionItem(item)`: Display "Bullion / Melt-Driven" badge.
- If `COIN`: Display Numismatic / Semi-Numismatic badge; advise PCGS/NGC/CACG grading.

## Risks / Trade-offs

- **[Risk]** Paper currency with precious metal (e.g., Goldbacks) might lose bullion display if checked by category alone.
  → **Mitigation:** The helper `hasPreciousMetal(item)` explicitly checks `metal_type !== "NONE"` and weight, ensuring Goldbacks retain their gold weight and live melt valuation.
- **[Risk]** Existing test cases asserting that "Metal & Fine Weight" is rendered for all items or card fixtures.
  → **Mitigation:** Inspect all tests across `frontend/src/__tests__/` and update assertions to reflect the improved type-tailored rendering.
