# user-documentation Specification

## Purpose
Defines end-user onboarding documentation, migration how-tos, and operator setup guides maintained alongside Stacker Stash releases.

## Requirements

### Requirement: Comprehensive User Guide and Migration How-Tos
The repository SHALL provide a User Guide at `docs/USER_GUIDE.md` documenting vault creation, Live Spot pricing, Vision AI scanning, CSV migration from CoinSnap/Numista/PCGS/NGC, container organization, BYOK settings, and Django Admin setup.

#### Scenario: User looks up CoinSnap migration steps
- **WHEN** a user opens `docs/USER_GUIDE.md`
- **THEN** they find step-by-step instructions for exporting a CSV from CoinSnap, Numista, PCGS/NGC, or spreadsheets and importing it via the Stacker Stash Migration Wizard

### Requirement: Repository README Quickstart and Feature Overview
The repository root `README.md` SHALL document Stacker Stash's key features, architecture, Docker Compose and local development setup, test commands, OpenSpec workflow, and link to `docs/USER_GUIDE.md`.

#### Scenario: Developer or self-hoster inspects README
- **WHEN** a user visits the repository landing page (`README.md`)
- **THEN** they see an accurate feature summary, quickstart commands, verification commands, and a direct link to the User Guide
