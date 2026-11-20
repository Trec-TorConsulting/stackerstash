# Design

## Context

The item detail page previously displayed an "Edit Details" button alongside top action buttons (`Appraise Now`, `Lock Value`, `Duplicate Item`, `Delete`). Meanwhile, specification cards such as `CardSpecsCard` and `NumismaticSpecsCard` render inline edit controls positioned in their upper right corners using small text and an icon (`Edit3` or `Pencil`). See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Move the item details editing button out of the header actions row and into the upper right corner of the Item Details card box.
- Match the visual appearance of the specification cards with a pencil icon (`Pencil`) and small text (`text-xs`) reading "Edit details".
- Maintain backward compatibility for screen readers and automated test suites by providing accessible name matching ("Edit Details").
- Render a matching Cancel action in the upper right corner when editing mode is active.

**Non-Goals:**
- Changing the schema or backend endpoints for updating collection items.
- Modifying the fields or structure of the edit form itself.
- Changing `CardSpecsCard` or `NumismaticSpecsCard` specifications.

## Decisions

### 1. Header placement and styling in the details box
- **Choice**: Introduce a card header bar with title `Item Details` on the left and the edit toggle button on the right, using `pb-2 border-b border-slate-800` to maintain clean visual separation from the details fields.
- **Rationale**: Follows the exact layout used by `CardSpecsCard` and `NumismaticSpecsCard` (`flex items-center justify-between`), making all card headers visually unified.
- **Alternatives considered**: Floating an absolute button in the corner without a header row; rejected because it risks overlapping data rows and creates layout inconsistency.

### 2. Button Icon and Text
- **Choice**: Use `<Pencil className="h-3.5 w-3.5" />` with `Edit details` text in `text-xs text-slate-400 hover:text-amber-300`, and `aria-label="Edit Details"`.
- **Rationale**: User requested a pencil icon and "Edit details in small letters like the card specs". Setting `aria-label="Edit Details"` preserves test suite assertions expecting `getByRole("button", { name: "Edit Details" })` and `getByRole("button", { name: /Edit Details/i })`.

## Risks / Trade-offs

- [Test locator regressions] → Ensured `aria-label="Edit Details"` so existing tests locate the button with identical accessible names.
