# Spec Delta

## MODIFIED Requirements

### Requirement: Guided Front and Back capture flow
The camera flow SHALL guide the user to capture **Front (Obverse)** first, display an auto-cropped local preview when enabled, and immediately prompt for **Back (Reverse)** while allowing single-photo completion for bars or slabs, retaining the normalized uncropped capture for authoritative server-side vault trimming unless the user manually crops or undoes auto-crop.

#### Scenario: Capturing Front and Back of a raw coin
- **WHEN** the user captures the Front (Obverse) photo with auto-crop enabled
- **THEN** the camera locks a preview thumbnail, advances the prompt to "Now capture Back (Reverse)", and retains the normalized uncropped original for upload with `auto_crop=true`

## ADDED Requirements

### Requirement: Preview-only client auto-crop with server-authoritative upload
When auto-crop is enabled during intake, the client SHALL treat client-side edge-detection cropping as a non-destructive local preview and AI identification input while uploading the normalized uncropped original with `auto_crop=true` (sequentially with `OBVERSE` before `REVERSE` per item), and SHALL send `auto_crop=false` only when the user manually crops/rotates, clicks Undo Auto, or disables auto-crop.

#### Scenario: Client auto-crop succeeds during intake staging
- **WHEN** the user captures or selects an item photo with auto-crop enabled and does not manually adjust or undo the crop
- **THEN** the staging UI displays the client auto-cropped preview (and uses it for AI identification), while saving the item uploads the normalized uncropped original with `auto_crop=true` so the server performs category-aware trimming, deskewing, and Obverse/Reverse size alignment

#### Scenario: Batch cataloging preserves preview identification and sequential server symmetry
- **WHEN** the user runs Batch Catalog on paired items with auto-crop enabled
- **THEN** AI identification runs on the staged preview images, and photo uploads send each photo's normalized uncropped original with `auto_crop=true` sequentially (`OBVERSE` before `REVERSE` per item) so server-side sibling size alignment runs

#### Scenario: User opens manual crop/rotate on a preview-cropped photo
- **WHEN** the user opens the manual crop/rotate editor on a staged photo that had a client auto-crop preview applied and confirms custom framing
- **THEN** the editor loads the uncropped original (when available) so any edge clipped in the preview can be recovered, and saving uploads the user-framed image with `auto_crop=false`

#### Scenario: User clicks Undo Auto on a preview-cropped photo
- **WHEN** the user clicks Undo Auto on a staged photo
- **THEN** the client restores the uncropped original for preview and uploads it with `auto_crop=false` so the server respects the user's explicit request to keep the full frame uncropped

#### Scenario: User disables auto-crop
- **WHEN** the user toggles auto-crop off during intake
- **THEN** the client skips client-side auto-crop preview and uploads the normalized uncropped image with `auto_crop=false`
