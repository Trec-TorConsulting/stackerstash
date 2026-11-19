# Spec Delta

## MODIFIED Requirements

### Requirement: Local-first background execution without cloud dependency
The system SHALL execute auto-sort classification using deterministic local rules and optional self-hosted local model inference (e.g., Ollama) when configured, without requiring external cloud APIs, running asynchronously via Celery when a broker is configured or synchronously inline in serverless environments where Celery/Redis is absent.

#### Scenario: Item created via intake or import triggers background sort
- **WHEN** a user creates an item manually, via camera/upload intake, or via CSV import in a workspace with auto-sort enabled
- **THEN** the item is saved and auto-sort populates `sort_category` and `sort_subcategory` either via the configured background worker or inline during serverless execution

#### Scenario: Cloud providers are unconfigured or disabled
- **WHEN** auto-sort runs in an environment with no Gemini or external cloud API key configured
- **THEN** the system completes classification using local deterministic rules (and local Ollama if configured)

#### Scenario: Serverless execution without Celery or Redis broker
- **WHEN** an item is created or a workspace re-sort is triggered on Vercel (`VERCEL=1` or no `REDIS_URL` configured)
- **THEN** auto-sort classification executes synchronously inline without attempting a Redis connection or spawning an untracked daemon thread
