# Spec Delta: multi-source-appraisal-engine

## ADDED Requirements

### Requirement: Multi-source consensus pricing across 2 to 3 independent sources
The appraisal engine SHALL aggregate and synthesize market pricing from at least 2 to 3 independent sources when available (combining realized sold comps, active asking supply, spot melt floor, official cert/guide pricing, and search-grounded estimates) to produce an accurate, balanced real-world market value.

#### Scenario: Synthesis of 3 independent sources
- **WHEN** an item appraisal collects quotes from live spot melt, marketplace sold/active comps, and an official price guide or grounded citation
- **THEN** the system reconciles the sources into a multi-source blended market value, calculates confidence as `HIGH`, and records all contributing sources in the appraisal history

#### Scenario: Fallback when only 1 or 2 sources exist
- **WHEN** an item lacks price guide coverage and only has live spot melt plus marketplace comps
- **THEN** the engine blends the available sources, enforces the melt floor invariant ($P_{\text{market}} \ge P_{\text{melt}}$), and assigns confidence as `MEDIUM`
