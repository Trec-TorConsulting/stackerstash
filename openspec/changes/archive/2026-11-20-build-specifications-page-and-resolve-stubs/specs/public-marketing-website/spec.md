# Spec Delta: public-marketing-website

## ADDED Requirements

### Requirement: Dedicated technical specifications and data reference page
The application SHALL provide a dedicated public and authenticated route at `/specifications` (with `/specs` as an alias) presenting an exhaustive technical breakdown of supported asset attributes, Sheldon and card grading scales, certified slab deep-link patterns, camera reticles, valuation formulas, container hierarchies, and security specifications.

#### Scenario: Collector visits specifications page
- **WHEN** a visitor or authenticated collector navigates to `/specifications` or `/specs`
- **THEN** the application renders the comprehensive specifications matrix with categorized sections for numismatics, banknotes, bullion, cards, grading slabs, vision intake, and valuation math

#### Scenario: Visitor navigates from features CTA
- **WHEN** a visitor clicks "Explore full specifications →" on `/features` or the home page
- **THEN** the application navigates directly to `/specifications` instead of reloading or linking back to `/features`

### Requirement: Zero circular self-referencing navigation links
All navigation links, feature teasers, and section call-to-actions across the public website SHALL point to distinct destination URLs or semantic anchor targets, and SHALL NOT link to the exact same page path on which they are rendered.

#### Scenario: Visitor inspects slab specifications CTA on features page
- **WHEN** a visitor views the supported grading slabs callout on `/features`
- **THEN** the link destination points to `/specifications` rather than `/features`

## MODIFIED Requirements

### Requirement: Dedicated public routes for SEO and enterprise trust
The application SHALL provide dedicated unauthenticated public routes at `/features`, `/pricing`, `/security`, `/privacy`, `/terms`, and `/specifications` (in addition to `/` and `/marketing`), with frontend-only navigation and contact CTAs (`/register`, `/login`, `mailto:`, and GitHub) and zero fake or unpersisted lead-capture forms.

#### Scenario: Visitor opens enterprise security and legal disclosure routes
- **WHEN** a visitor navigates directly to `/security`, `/privacy`, or `/terms`
- **THEN** the site renders complete architecture security disclosures (tenant isolation, Fernet BYOK encryption, HMAC-signed media, OWASP protections), privacy policy, or terms of service with links back to `/register` and `/`

#### Scenario: Visitor opens specifications route
- **WHEN** a visitor navigates directly to `/specifications`
- **THEN** the site renders complete technical specifications with navigation links back to `/register` and `/`

#### Scenario: Visitor views early access and launch pages
- **WHEN** a visitor visits `/coming-soon`
- **THEN** the page displays direct sign-up and sign-in access CTAs without non-functional or unpersisted email capture forms
