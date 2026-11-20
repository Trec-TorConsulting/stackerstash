export interface GradingServiceSpec {
  id: string;
  name: string;
  category: "Numismatic" | "Banknote" | "Cards" | "Verification / Sticker";
  urlTemplate: string;
  exampleCert: string;
  barcodeFormat: string;
  description: string;
}

export interface StrikeDesignationSpec {
  code: string;
  name: string;
  service: string;
  description: string;
}

export interface SheldonGradeSpec {
  grade: number;
  code: string;
  name: string;
  category: "Circulated" | "About Uncirculated" | "Mint State";
  description: string;
}

export interface CardGradeSpec {
  grade: string;
  name: string;
  description: string;
  psaCentering: string;
  bgsCentering: string;
}

export interface MetalSpec {
  symbol: string;
  name: string;
  standardPurity: string[];
  unit: string;
  conversionToGrams: number;
  description: string;
}

export const GRADING_SERVICES_CATALOG: GradingServiceSpec[] = [
  {
    id: "PCGS",
    name: "Professional Coin Grading Service",
    category: "Numismatic",
    urlTemplate: "https://www.pcgs.com/cert/{cert}",
    exampleCert: "84729182",
    barcodeFormat: "Code 39 / 2D DataMatrix (format: <spec>.<grade>/<cert>)",
    description: "Industry benchmark for US & world coins, strikes, Rattler, Doily, and OGH vintage generations.",
  },
  {
    id: "NGC",
    name: "Numismatic Guaranty Company",
    category: "Numismatic",
    urlTemplate: "https://www.ngccoin.com/certlookup/{cert}/",
    exampleCert: "6023912-001",
    barcodeFormat: "Code 128 / DataMatrix (<7-8 digits>-<3-digit line>)",
    description: "Global numismatic certification for ancient, world, and modern coins including Fatty holders.",
  },
  {
    id: "PMG",
    name: "Paper Money Guaranty",
    category: "Banknote",
    urlTemplate: "https://www.pmgnotes.com/certlookup/{cert}/",
    exampleCert: "1983021-005",
    barcodeFormat: "Code 128 (<7-8 digits>-<3-digit line>)",
    description: "Official grading partner of the ANA for world and US paper currency, verifying EPQ standards.",
  },
  {
    id: "PCGS_BANKNOTE",
    name: "PCGS Banknote",
    category: "Banknote",
    urlTemplate: "https://www.pcgs.com/banknote/cert/{cert}",
    exampleCert: "70192834",
    barcodeFormat: "7-8 digit numeric barcode / QR code",
    description: "Dedicated currency authentication service by Collectors Universe with PPQ designation support.",
  },
  {
    id: "CACG",
    name: "Certified Acceptance Corp Grading (CACG)",
    category: "Numismatic",
    urlTemplate: "https://www.cacgrading.com/cert/{cert}",
    exampleCert: "10029384",
    barcodeFormat: "High-density QR code / numeric 8-digit serial",
    description: "Full-service slab grading entity launched by CAC with strict eye-appeal and surface standards.",
  },
  {
    id: "CAC",
    name: "CAC Verification (Green/Gold Bean)",
    category: "Verification / Sticker",
    urlTemplate: "https://www.caccoin.com/verify-cert/?cert={cert}",
    exampleCert: "48291034",
    barcodeFormat: "Verifies underlying PCGS/NGC slab serial",
    description: "Third-party stickering authority designating top-tier quality for coins certified by PCGS or NGC.",
  },
  {
    id: "ANACS",
    name: "American Numismatic Association Certification Service",
    category: "Numismatic",
    urlTemplate: "https://www.anacs.com/Verify/CertVerification.aspx?cert={cert}",
    exampleCert: "7182941",
    barcodeFormat: "Numeric serial with curved holder barcode",
    description: "America's oldest grading service, famed for attribution of varieties, mint errors, and VAMs.",
  },
  {
    id: "ICG",
    name: "Independent Coin Graders",
    category: "Numismatic",
    urlTemplate: "https://www.icgcoin.com/verify-coin/?cert={cert}",
    exampleCert: "5920192",
    barcodeFormat: "7-digit numeric barcode",
    description: "Independent numismatic grading with anti-counterfeit holographic slab technology.",
  },
  {
    id: "PSA",
    name: "Professional Sports Authenticator",
    category: "Cards",
    urlTemplate: "https://www.psacard.com/cert/{cert}",
    exampleCert: "82716391",
    barcodeFormat: "Code 39 / 2D barcode / Lighthouse QR code",
    description: "World leader in trading and sports card authentication, grading on the classic 1–10 scale.",
  },
  {
    id: "BGS",
    name: "Beckett Grading Services",
    category: "Cards",
    urlTemplate: "https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id={cert}",
    exampleCert: "0014829102",
    barcodeFormat: "10-digit numeric barcode",
    description: "Premium quad-subgrade card slabs (Centering, Corners, Edges, Surface) including Black Label.",
  },
  {
    id: "CGC",
    name: "CGC Cards (Certified Guaranty Company)",
    category: "Cards",
    urlTemplate: "https://www.cgccards.com/certlookup/{cert}/",
    exampleCert: "1403291029",
    barcodeFormat: "10-digit serial / high-density QR code",
    description: "State-of-the-art optical clarity slabs for Pokémon, Magic, Yu-Gi-Oh!, and sports collectibles.",
  },
  {
    id: "SGC",
    name: "Sportscard Guaranty Corporation (The Tuxedo)",
    category: "Cards",
    urlTemplate: "https://www.gosgc.com/cert-code-lookup?cert={cert}",
    exampleCert: "9482710",
    barcodeFormat: "7-digit serial with distinctive black insert",
    description: "Renowned 'Tuxedo' black inserts for vintage baseball and modern pop culture trading cards.",
  },
  {
    id: "TAG",
    name: "Technical Authentication & Grading (TAG)",
    category: "Cards",
    urlTemplate: "https://my.taggrading.com/card/{cert}",
    exampleCert: "N1928374",
    barcodeFormat: "Alphanumeric 8-character ID with embedded NFC & DIG report",
    description: "100% automated photogrammetry and computer-vision card scoring on a 1000-point rubric.",
  },
];

export const SHELDON_SCALE_CATALOG: SheldonGradeSpec[] = [
  { grade: 1, code: "PO-1", name: "Poor", category: "Circulated", description: "Identifiable type and date, heavily worn smooth." },
  { grade: 2, code: "FR-2", name: "Fair", category: "Circulated", description: "Mostly worn smooth, major details faintly visible in outline." },
  { grade: 3, code: "AG-3", name: "About Good", category: "Circulated", description: "Heavily worn with portions of lettering blending into rim." },
  { grade: 4, code: "G-4", name: "Good", category: "Circulated", description: "Heavily worn, major designs visible in full outline." },
  { grade: 6, code: "G-6", name: "Good Plus", category: "Circulated", description: "Fully distinct rim and complete outer devices." },
  { grade: 8, code: "VG-8", name: "Very Good", category: "Circulated", description: "Well worn with design details beginning to show internal lines." },
  { grade: 10, code: "VG-10", name: "Very Good Plus", category: "Circulated", description: "Clearer inner design elements and complete lettering." },
  { grade: 12, code: "F-12", name: "Fine", category: "Circulated", description: "Moderate wear on higher points, all legends sharp and complete." },
  { grade: 15, code: "F-15", name: "Fine Plus", category: "Circulated", description: "Recessed areas sharp, higher points moderately flattened." },
  { grade: 20, code: "VF-20", name: "Very Fine", category: "Circulated", description: "Moderate wear on high relief areas, clear hairline and feather detail." },
  { grade: 25, code: "VF-25", name: "Very Fine Plus", category: "Circulated", description: "All major features sharp with light-to-moderate high point wear." },
  { grade: 30, code: "VF-30", name: "Choice Very Fine", category: "Circulated", description: "Light wear on high points, crisp legends and strong eye appeal." },
  { grade: 35, code: "VF-35", name: "Choice Very Fine Plus", category: "Circulated", description: "Light wear, traces of mint luster in protected recessed areas." },
  { grade: 40, code: "EF-40", name: "Extremely Fine", category: "Circulated", description: "Light wear on highest points, luster evident in protected areas." },
  { grade: 45, code: "EF-45", name: "Choice Extremely Fine", category: "Circulated", description: "Very light wear, substantial remaining mint luster." },
  { grade: 50, code: "AU-50", name: "About Uncirculated", category: "About Uncirculated", description: "Traces of friction on high points, half of original mint luster remains." },
  { grade: 53, code: "AU-53", name: "About Uncirculated Plus", category: "About Uncirculated", description: "Light friction on high points, more than half of mint luster present." },
  { grade: 55, code: "AU-55", name: "Choice About Uncirculated", category: "About Uncirculated", description: "Slight friction on high points, 75%+ mint luster present." },
  { grade: 58, code: "AU-58", name: "Choice About Uncirculated Plus", category: "About Uncirculated", description: "Virtually uncirculated with slight cabinet friction; outstanding eye appeal." },
  { grade: 60, code: "MS-60", name: "Mint State 60", category: "Mint State", description: "Strictly uncirculated with heavy bag marks or impaired luster." },
  { grade: 61, code: "MS-61", name: "Mint State 61", category: "Mint State", description: "Uncirculated, multiple contact marks, scuffs, or rim nicks." },
  { grade: 62, code: "MS-62", name: "Mint State 62", category: "Mint State", description: "Uncirculated with noticeable contact marks and average luster." },
  { grade: 63, code: "MS-63", name: "Mint State 63 (Choice)", category: "Mint State", description: "Moderate contact marks, attractive luster and pleasing eye appeal." },
  { grade: 64, code: "MS-64", name: "Mint State 64 (Near Gem)", category: "Mint State", description: "Few scattered contact marks, very pleasing luster and strike." },
  { grade: 65, code: "MS-65", name: "Mint State 65 (Gem)", category: "Mint State", description: "High quality luster and sharp strike, minimal minor contact marks." },
  { grade: 66, code: "MS-66", name: "Mint State 66 (Premium Gem)", category: "Mint State", description: "Exceptional strike and luster, few minor distractions." },
  { grade: 67, code: "MS-67", name: "Mint State 67 (Superb Gem)", category: "Mint State", description: "Sharp strike, pristine luster, virtually mark-free." },
  { grade: 68, code: "MS-68", name: "Mint State 68", category: "Mint State", description: "Near perfection, microscopic contact marks only visible under magnification." },
  { grade: 69, code: "MS-69", name: "Mint State 69 (Near Perfect)", category: "Mint State", description: "Virtually flawless with extraordinary eye appeal and full strike." },
  { grade: 70, code: "MS-70", name: "Mint State 70 (Perfect)", category: "Mint State", description: "Flawless coin under 5x magnification, full strike and immaculate luster." },
];

export const STRIKE_DESIGNATIONS_CATALOG: StrikeDesignationSpec[] = [
  { code: "DMPL", name: "Deep Mirror Prooflike", service: "PCGS", description: "6+ inch clear mirror reflection on both obverse and reverse (Morgan Dollars)." },
  { code: "DPL", name: "Deep Prooflike", service: "NGC", description: "NGC equivalent of DMPL with 6+ inch clear mirror fields." },
  { code: "PL", name: "Prooflike", service: "PCGS / NGC", description: "2 to 4 inch mirror reflection in fields on business strike coins." },
  { code: "CAM", name: "Cameo", service: "PCGS / NGC", description: "Frosted devices contrasting sharply against deep mirror fields on proof coins." },
  { code: "DCAM", name: "Deep Cameo", service: "PCGS", description: "Heavy frost on all devices with deep black reflective mirror fields." },
  { code: "UCAM", name: "Ultra Cameo", service: "NGC", description: "NGC designation for intense frost devices and mirror fields on proofs." },
  { code: "FB", name: "Full Bands", service: "PCGS / NGC", description: "Complete separation of horizontal split bands on Mercury Dimes and Roosevelt Dimes." },
  { code: "FS", name: "Full Steps", service: "PCGS / NGC", description: "At least 5 or 6 complete, unbroken steps on Monticello (Jefferson Nickels)." },
  { code: "FBL", name: "Full Bell Lines", service: "PCGS / NGC", description: "Complete lower set of lines on the Liberty Bell (Franklin Half Dollars)." },
  { code: "FH", name: "Full Head", service: "PCGS / NGC", description: "Distinct hairline, ear hole, and three leaves in wreath (Standing Liberty Quarters)." },
  { code: "RD", name: "Red", service: "PCGS / NGC", description: "Copper coins retaining 95% or more original red mint color." },
  { code: "RB", name: "Red and Brown", service: "PCGS / NGC", description: "Copper coins showing a mixture of red and brown surfaces (5% to 95% red)." },
  { code: "BN", name: "Brown", service: "PCGS / NGC", description: "Copper coins that have toned to less than 5% original red luster." },
  { code: "EPQ", name: "Exceptional Paper Quality", service: "PMG", description: "Note is original without physical, chemical, or mechanical processing." },
  { code: "PPQ", name: "Premium Paper Quality", service: "PCGS Banknote", description: "Completely original paper surfaces and inks without restoration." },
];

export const CARD_GRADES_CATALOG: CardGradeSpec[] = [
  { grade: "10", name: "Gem Mint / Pristine", description: "Four sharp corners, 55/45 or better centering, unbroken gloss, no staining.", psaCentering: "55/45 to 60/40 front, 75/25 back", bgsCentering: "50/50 Black Label, 55/45 Pristine" },
  { grade: "9.5", name: "Gem Mint (BGS / SGC)", description: "Premium card with nearly imperceptible corner touch or slight centering offset.", psaCentering: "N/A (PSA uses 9 Mint)", bgsCentering: "50/50 to 55/45 front, 60/40 back" },
  { grade: "9", name: "Mint", description: "High-end card with minor flaw: microscopic wax stain, slight centering shift, or tiny foil imperfection.", psaCentering: "65/35 front, 90/10 back", bgsCentering: "60/40 front, 70/30 back" },
  { grade: "8.5", name: "Near Mint-Mint Plus", description: "Pleasing high-grade card midway between Mint and NM-MT.", psaCentering: "65/35 front, 90/10 back", bgsCentering: "65/35 front, 75/25 back" },
  { grade: "8", name: "Near Mint-Mint", description: "Super-clean card with minor edge chipping, slight corner wear, or 70/30 centering.", psaCentering: "70/30 front, 90/10 back", bgsCentering: "65/35 front, 80/20 back" },
  { grade: "7", name: "Near Mint", description: "Slight surface wear, minor fraying on corners, light printing defect.", psaCentering: "75/25 front, 90/10 back", bgsCentering: "70/30 front, 85/15 back" },
  { grade: "6", name: "Excellent-Mint", description: "Noticeable corner softness, light scratching or minor border wear.", psaCentering: "80/20 front, 90/10 back", bgsCentering: "75/25 front, 90/10 back" },
  { grade: "5", name: "Excellent", description: "Minor rounding of corners, surface loss, minor crease or scuff marks.", psaCentering: "85/15 front, 90/10 back", bgsCentering: "80/20 front, 90/10 back" },
  { grade: "4", name: "Very Good-Excellent", description: "Corners noticeably rounded, light creases, moderate surface scratches.", psaCentering: "85/15 front, 90/10 back", bgsCentering: "85/15 front, 90/10 back" },
  { grade: "3", name: "Very Good", description: "Corners rounded, scuffing, distinct creases, loss of surface gloss.", psaCentering: "90/10 front, 90/10 back", bgsCentering: "90/10 front, 90/10 back" },
  { grade: "2", name: "Good", description: "Heavily worn corners, multiple creases, staining, or pinholes.", psaCentering: "90/10 front or worse", bgsCentering: "90/10 front or worse" },
  { grade: "1", name: "Poor", description: "Severely damaged, torn, major creasing, warped, or heavy pencil marks.", psaCentering: "Miscut / Off-center", bgsCentering: "Miscut / Off-center" },
];

export const METALS_CATALOG: MetalSpec[] = [
  {
    symbol: "XAU",
    name: "Gold",
    standardPurity: [".9999 (24K)", ".999", ".9167 (22K - American Eagle)", ".900 (Pre-1933 US)"],
    unit: "Troy Ounce",
    conversionToGrams: 31.1034768,
    description: "Primary reserve metal. Stacker Stash evaluates pure fine gold content across sovereign coins, bars, and Goldback notes.",
  },
  {
    symbol: "XAG",
    name: "Silver",
    standardPurity: [".9999", ".999 (Fine Silver)", ".925 (Sterling)", ".900 (Junk / Constitutional)"],
    unit: "Troy Ounce",
    conversionToGrams: 31.1034768,
    description: "Monetary and industrial metal. Full automatic conversion from gross weight to fine troy ounces for constitutional coinage.",
  },
  {
    symbol: "XPT",
    name: "Platinum",
    standardPurity: [".9995 (American Eagle / Maple Leaf)", ".999"],
    unit: "Troy Ounce",
    conversionToGrams: 31.1034768,
    description: "Dense catalytic metal tracked against live LBMA and NYMEX market fixes.",
  },
  {
    symbol: "XPD",
    name: "Palladium",
    standardPurity: [".9995 (American Eagle / Ballerina)", ".999"],
    unit: "Troy Ounce",
    conversionToGrams: 31.1034768,
    description: "Precious platinum-group element valued in real-time for collector coins and industrial ingots.",
  },
  {
    symbol: "COPPER",
    name: "Copper",
    standardPurity: [".999 (Bullion Bars / Rounds)", ".950 (Pre-1982 US Cents)", ".900"],
    unit: "Pound (Avoirdupois) & Troy Oz",
    conversionToGrams: 28.349523125,
    description: "Industrial bullion. COMEX spot quotes ($/lb) are automatically normalized into troy ounce melt values.",
  },
];

export const GOLDBACK_AURUM_DENOMINATIONS = [
  { denomination: "1", fineTroyOz: "0.001000", aurumMg: "31.103 mg", goldGrams: "0.0311 g", desc: "1/1000th oz 24K pure gold layer" },
  { denomination: "5", fineTroyOz: "0.005000", aurumMg: "155.517 mg", goldGrams: "0.1555 g", desc: "1/200th oz 24K pure gold layer" },
  { denomination: "10", fineTroyOz: "0.010000", aurumMg: "311.035 mg", goldGrams: "0.3110 g", desc: "1/100th oz 24K pure gold layer" },
  { denomination: "25", fineTroyOz: "0.025000", aurumMg: "777.587 mg", goldGrams: "0.7776 g", desc: "1/40th oz 24K pure gold layer" },
  { denomination: "50", fineTroyOz: "0.050000", aurumMg: "1555.174 mg", goldGrams: "1.5552 g", desc: "1/20th oz 24K pure gold layer" },
  { denomination: "100", fineTroyOz: "0.100000", aurumMg: "3110.348 mg", goldGrams: "3.1103 g", desc: "1/10th oz 24K pure gold layer (Oklahoma/Alpha)" },
];

export const VALUATION_ENGINE_SPECS = [
  {
    pillar: "Tiered Cascading Comps",
    formula: "Tier 1 (Official eBay API) → Tier 2 (Zero-Key Public Endpoint) → Tier 3 (Search Grounding Citation Harvesting)",
    description: "Ensures comprehensive secondary market comps coverage with zero required API keys. If API credentials are not provisioned, public endpoints and grounded search citations provide immediate sold and asking quotes.",
  },
  {
    pillar: "Multi-Source Consensus Blending",
    formula: "Consensus = (0.50 × Sold Comps Median) + (0.30 × Price Guide FMV) + (0.20 × Grounded AI Estimate)",
    description: "Blends 2 to 3 independent signals. Never relies on a single erratic auction or inflated asking price. Downgrades confidence to LOW if only active asks exist without confirmed realized sales.",
  },
  {
    pillar: "Live Spot & Melt Floor",
    formula: "Melt Floor = Gross Weight × Purity Normalization × Metal Spot Price",
    description: "Refreshed every 5 minutes across 5 precious metals. High-precision conversions (31.1034768g per troy oz) guarantee mathematical accuracy for bullion and junk silver bags.",
  },
  {
    pillar: "Break-Even Raw-to-Grade ROI",
    formula: "ROI = Graded Fair Market Value - Raw Fair Market Value - Service Fee - Shipping/Insurance",
    description: "Calculates whether submitting a raw coin or card to PCGS, NGC, PMG, or PSA yields positive expected financial return before spending grading fees.",
  },
];

export const VISION_PIPELINE_SPECS = [
  {
    step: "Guided Reticle Capture",
    spec: "Square (1:1 Coins/Rounds) • Slab / Banknote (1.586:1) • Portrait (3:4 Cards)",
    detail: "Dynamic viewport guides align device cameras for edge detection, reflection suppression, and perspective correction.",
  },
  {
    step: "Anti-Spoofing & Quality Checks",
    spec: "Glint & Glare Luminance Ratio < 18% • Moiré Frequency Filter",
    detail: "Rejects unreadable glare or photos of computer monitors to prevent hallucination in multimodal appraisal models.",
  },
  {
    step: "Edge OCR Pre-Fill",
    spec: "Tesseract WASM & Deterministic Regex",
    detail: "Instantly extracts dates, mint marks, denominations, serial numbers, and slab cert numbers locally on-device.",
  },
  {
    step: "Multimodal AI Enrichment",
    spec: "Gemini 2.5 Flash / Pro + BYOK Local Ollama (Qwen2-VL, LLaVA)",
    detail: "Synthesizes obverse and reverse photos into standardized catalog records, grade ranges, and collectibility theses.",
  },
];
