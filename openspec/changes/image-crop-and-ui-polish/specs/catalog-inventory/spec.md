# Delta Spec: catalog-inventory

## ADDED Requirements

### Requirement: Direct circular coin detection and small-denomination slab extraction
The system SHALL detect circular coins and rounds directly on the original image using contrast-enhanced circle detection (`CLAHE` + `HoughCircles` with angular edge coverage and radial LAB contrast) when extracting raw, flipped, or capsuled coins (`COIN`/`ROUND`), and SHALL support smaller-radius coins (`min_r >= 0.13 * slab_w`) inside tall grading slabs (`detect_coin_in_slab`) so dimes, cents, nickels, and quarters are extracted cleanly alongside larger dollars and rounds.

#### Scenario: Proof silver round with dark mirror fields on dark mat
- **WHEN** a user uploads or cleans an `OBVERSE` or `REVERSE` photo of a raw `COIN` or `ROUND` with dark mirror fields or underexposed lighting
- **THEN** `detect_circular_coin` locates the coin's circular rim on the original image and `extract_coin_cutout` produces a tightly cropped, anti-aliased circular PNG preserving the entire coin interior and dropping the surrounding mat or 2×2 holder.

#### Scenario: Small-denomination coin inside a tall grading slab
- **WHEN** a user uploads an `OBVERSE` or `REVERSE` photo of a slabbed dime, cent, nickel, or quarter
- **THEN** `detect_coin_in_slab` detects the smaller coin radius (`>= 0.13 * slab_w`) and extracts the circular coin cutout as `OBVERSE`/`REVERSE` while preserving the full slab as `SLAB_LABEL`.

### Requirement: In-app 90-degree photo rotation
The system SHALL provide a `POST /api/v1/catalog/items/{item_id}/photos/{photo_id}/rotate` endpoint (accepting `degrees` in `{90, 180, 270, -90}`) and a **Rotate 90°** action in the item detail photo viewer so users can correct upside-down or sideways photos without re-uploading.

#### Scenario: Rotating an upside-down coin photo
- **WHEN** an authenticated user triggers **Rotate 90°** on an item photo
- **THEN** the backend rotates the stored image by the requested angle (preserving alpha transparency), updates stored `width` and `height`, and returns the updated `PhotoOut` payload.

### Requirement: Shape-aware background removal and tight cropping for bars and notes
When background removal runs on a `BAR`, `PAPER`, or banknote slab (`PMG`/`PCGS_BANKNOTE`) photo—including items inside a clear plastic sleeve over a dark mat—the system SHALL detect a darker outer rim or irregular contour (`extent < 0.96`, `area_ratio <= 0.94`) via LAB-distance Otsu separation, snap the oriented rounded-rectangle cutout to the inner bar or note, and avoid locking outer mat fringes as definite foreground during RGBA re-cleans or inverted GrabCut masks.

#### Scenario: Goldback note inside a clear plastic sleeve on a dark mat
- **WHEN** background removal runs on a `PAPER` item photographed inside a clear plastic sleeve over a dark textured mat
- **THEN** `detect_rectangular_subject` detects the darker outer sleeve/mat rim and snaps the rounded-rectangle cutout tightly to the inner note.

