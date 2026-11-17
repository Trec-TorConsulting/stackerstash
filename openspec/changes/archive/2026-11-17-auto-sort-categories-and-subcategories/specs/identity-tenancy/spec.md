# Spec Delta

## ADDED Requirements

### Requirement: Workspace auto-sort preference
The system SHALL store a per-workspace `auto_sort_enabled` preference (enabled by default) and allow workspace owners to toggle it in Settings.

#### Scenario: User disables auto-sort in Settings
- **WHEN** a workspace owner toggles "Auto-Sort Collection Items" off in Settings and saves
- **THEN** the system persists `auto_sort_enabled = false` for the active workspace and stops automatic background sorting for newly added items until re-enabled

