# Spec Delta: guided-camera-capture

## ADDED Requirements

### Requirement: Mobile-optimized client upload encoding and dimension cap
The client capture, auto-crop, and upload normalization pipeline SHALL cap output dimensions at `1600` pixels on the longest edge and encode uploads at `0.82–0.84` quality (using `image/webp` when supported by the browser canvas, with `image/jpeg` fallback).

#### Scenario: Guided camera capture produces compact upload
- **WHEN** the guided camera captures a frame
- **THEN** the resulting upload file is bounded to at most `1600` pixels on its longest edge and encoded at `0.82–0.84` quality

#### Scenario: Client auto-crop respects mobile dimension and quality bounds
- **WHEN** client-side auto-crop crops a high-resolution photo from the camera or file picker
- **THEN** the cropped output is capped at `1600` pixels on its longest edge and encoded at `0.82–0.84` quality

#### Scenario: Upload normalization compresses medium-sized picker photos
- **WHEN** a user selects a JPEG, PNG, or WebP photo larger than `350,000` bytes
- **THEN** the client normalizes and compresses it to at most `1600` pixels at `0.82–0.84` quality before upload
