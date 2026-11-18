# Spec Delta

## ADDED Requirements

### Requirement: Server-authoritative vault auto-trim and deskew
When an item photo is uploaded with `auto_crop=true` (the default), the server SHALL apply category- and label-aware shape hinting, deskew tilted rectangular subjects, crop tightly to detected subject edges, align Obverse/Reverse dimensions to an existing sibling photo when applicable, and apply detail enhancement before encoding and thumbnail generation.

#### Scenario: Uploading an uncropped coin or slab photo from intake or item detail
- **WHEN** a client uploads an uncropped photo with `auto_crop=true` for a `COIN`, `BAR`, `PAPER`, or `SLAB` item
- **THEN** the server applies the item's shape hint, deskews tilted rectangular subjects, crops to the detected subject bounds, and stores the enhanced WebP image and 480px thumbnail

#### Scenario: Uploading Obverse and Reverse pair with auto-crop enabled
- **WHEN** the Reverse photo is uploaded with `auto_crop=true` after an Obverse photo already exists for the item
- **THEN** the server aligns the Reverse crop box and aspect ratio to match the Obverse sibling's dimensions for uniform vault gallery presentation

#### Scenario: Uploading an assay card or rectangular document photo for a coin item
- **WHEN** a photo with label `ASSAY`, `RECEIPT`, or `SLAB_LABEL`—or for an item whose title/notes indicate an assay card, certificate of authenticity, or proof set—is uploaded with `auto_crop=true`
- **THEN** the server resolves the shape hint to `rect` so cropping frames the entire rectangular card or document rather than collapsing onto an embedded coin

### Requirement: Manual crop override bypasses server auto-crop
When an item photo is uploaded with `auto_crop=false`, the server SHALL preserve the uploaded framing without running edge-detection cropping or tilt deskewing, while still normalizing EXIF orientation, enforcing the `1600` pixel dimension cap, applying detail enhancement, and generating the thumbnail derivative.

#### Scenario: Uploading a manually cropped photo
- **WHEN** a client uploads a user-cropped photo with `auto_crop=false`
- **THEN** the server stores the photo with the user's exact framing, capped at `1600` pixels on the longest edge, with a freshly generated thumbnail
