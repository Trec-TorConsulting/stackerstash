# Spec Delta: valuation-explainability-and-collectibility

## MODIFIED Requirements

### Requirement: "Why It's Valued Here" rationale card
The system SHALL render a dedicated "Why It's Valued Here" section on the item detail page listing concrete value drivers, source comparison table, last appraisal timestamp, and an explicit breakdown of blended real-world comps (realized sold average, active asking mean, and blended market value).

#### Scenario: Viewing value drivers on ItemDetailPage
- **WHEN** a collector opens an item that has been appraised
- **THEN** the UI displays bulleted value drivers (such as mintage scarcity, grade/slab premium, spot sensitivity, or realized comp range) and lists each evaluated source's quote or status

#### Scenario: Viewing blended real-world comps breakdown
- **WHEN** an appraisal incorporates dual-stream eBay comps with both sold sales and active asking listings
- **THEN** the Valuation Breakdown UI displays a dedicated comps card or driver detailing the realized sold average ($P_{\text{sold}}$ across $N_{\text{sold}}$ sales), active asking mean ($P_{\text{ask}}$ across $N_{\text{ask}}$ listings), and the resulting blended market value
