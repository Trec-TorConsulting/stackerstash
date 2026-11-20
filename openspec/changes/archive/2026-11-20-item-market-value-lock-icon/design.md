# Design

## Context

On the item detail page, users can lock an item's market value against automated scheduled re-appraisals by setting `specs_provenance.market_value_unit = "USER"`. Previously, this was a text button in the top action strip ("Lock Value" / "Value Locked"). See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Relocate the lock toggle out of the top item header actions row and into the upper right corner of the Market Value box.
- Use a lock icon (`Lock` when locked, `Unlock` when unlocked) with distinct locked state styling (sky badge highlight) and hover state.
- Keep `aria-label` matching `"Value Locked"` and `"Lock Value"` so accessibility and existing test suites pass without changes.

**Non-Goals:**
- Changing backend appraisal lock mechanisms or schema.
- Changing melt value or grade cards.

## Decisions

### 1. Market Value card header row
- **Choice**: Structure the top of the Market Value card as a flex row with `Market Value {item.is_estimate ? "(Estimate)" : ""}` on the left and the lock icon button on the right.
- **Rationale**: Places the lock action immediately adjacent to the value metric it controls without adding vertical space or clutter.

### 2. Lock Icon and State Representation
- **Choice**: Display `<Lock className="h-3.5 w-3.5 text-sky-300" />` with `bg-sky-500/20 text-sky-200 border-sky-500/40` when locked, and `<Unlock className="h-3.5 w-3.5" />` with `bg-slate-800/80 text-slate-400 border-slate-700/60` when unlocked.
- **Rationale**: Provides clear visual contrast between locked (protected) and unlocked states while maintaining a clean, compact footprint.

## Risks / Trade-offs

- [Test locator regressions] → Ensured `aria-label={isLocked ? "Value Locked" : "Lock Value"}` so existing test locators continue to find the button identically.
