# Spec Delta

## ADDED Requirements

### Requirement: Goldback Exchange Rate valuation benchmark
The system SHALL compute a Goldback Exchange Rate benchmark (`~1.95x–2.10x` live 24K gold melt value, reflecting Aurum manufacturing and official Goldback currency exchange parity) for recognized Goldback items, expose it in appraisal source breakdowns and drivers, and ground unverified AI estimates against the Goldback benchmark band when realized comps are absent.

#### Scenario: Appraise a 1/4 Goldback with live gold spot price
- **WHEN** `appraise_item` evaluates a `1/4 Goldback` (`0.000250 ozt` 24K gold) with a live gold melt value of `$0.96`
- **THEN** the appraisal records a `GOLDBACK_EXCHANGE` benchmark around `$1.87–$2.02` (`~2.0x` melt) and prevents unverified AI estimates from inflating the market value to unrealistic multiples (such as `$45.00`)
