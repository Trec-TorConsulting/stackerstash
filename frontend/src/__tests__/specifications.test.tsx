import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ComingSoonPage } from "../pages/ComingSoonPage";
import { MarketingPage } from "../pages/MarketingPage";
import { SpecificationsPage } from "../pages/SpecificationsPage";
import { MeltCalculatorCard } from "../components/specifications/MeltCalculatorCard";
import { GradingRoiCard } from "../components/specifications/GradingRoiCard";
import { SpecificationsFaqCard } from "../components/specifications/SpecificationsFaqCard";

describe("Specifications Page & Stub Resolution", () => {
  it("renders SpecificationsPage with header, search, category pills, and default services tab", () => {
    render(
      <MemoryRouter initialEntries={["/specifications"]}>
        <SpecificationsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Technical Specifications")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search Sheldon grades/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13 Grading Services & Slabs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Numismatics & Strikes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Banknotes & Goldbacks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bullion & Spot Math/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trading Cards \(1–10\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Valuation & AI Pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Interactive Calculators & FAQ/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All Specifications/i })).toBeInTheDocument();

    // Verify services table present on default tab
    expect(screen.getByText("Professional Coin Grading Service")).toBeInTheDocument();
    expect(screen.getByText("Technical Authentication & Grading (TAG)")).toBeInTheDocument();
    expect(screen.getByText("Paper Money Guaranty")).toBeInTheDocument();
  });

  it("filters specs catalog by keyword search and clears search", () => {
    render(
      <MemoryRouter initialEntries={["/specifications"]}>
        <SpecificationsPage />
      </MemoryRouter>
    );

    // Switch to numismatics tab
    fireEvent.click(screen.getByRole("button", { name: /Numismatics & Strikes/i }));

    const searchInput = screen.getByPlaceholderText(/Search Sheldon grades/i);
    fireEvent.change(searchInput, { target: { value: "DMPL" } });
    expect(screen.getByText("Deep Mirror Prooflike")).toBeInTheDocument();

    // Search for MS-70 to filter Sheldon tiers (AU and Circulated return null)
    fireEvent.change(searchInput, { target: { value: "MS-70" } });
    expect(screen.getByText("Mint State 70 (Perfect)")).toBeInTheDocument();
    expect(screen.queryByText(/About Uncirculated \(AU-50 to AU-58\)/i)).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue("");
  });

  it("switches category tabs to isolate specific spec domains and tools", () => {
    render(
      <MemoryRouter initialEntries={["/specifications"]}>
        <SpecificationsPage />
      </MemoryRouter>
    );

    // Switch to Bullion tab
    fireEvent.click(screen.getByRole("button", { name: /Bullion & Spot Math/i }));
    expect(screen.getByText("Authoritative Mass Conversion Constants (NIST Standard)")).toBeInTheDocument();
    expect(screen.getByText("31.1034768 grams")).toBeInTheDocument();
    expect(screen.getByText("Live Scrap Melt Floor Calculator")).toBeInTheDocument();

    // Switch to Banknotes tab
    fireEvent.click(screen.getByRole("button", { name: /Banknotes & Goldbacks/i }));
    expect(screen.getByText("Fancy Serial Number Recognition Patterns")).toBeInTheDocument();
    expect(screen.getByText("Goldback Fractional Aurum Standard")).toBeInTheDocument();
    expect(screen.getByText("1 Goldback")).toBeInTheDocument();

    // Switch to Cards tab
    fireEvent.click(screen.getByRole("button", { name: /Trading Cards \(1–10\)/i }));
    expect(screen.getByText(/Trading & Sports Card 1–10 Grading Scale/i)).toBeInTheDocument();
    expect(screen.getByText("55/45 to 60/40 front, 75/25 back")).toBeInTheDocument();

    // Switch to Architecture tab
    fireEvent.click(screen.getByRole("button", { name: /Valuation & AI Pipeline/i }));
    expect(screen.getByText("Multi-Source Valuation Pillars")).toBeInTheDocument();
    expect(screen.getByText("Tiered Cascading Comps")).toBeInTheDocument();
    expect(screen.getByText("Camera Reticle & Intake Pipeline")).toBeInTheDocument();

    // Switch to Tools tab
    fireEvent.click(screen.getByRole("button", { name: /Interactive Calculators & FAQ/i }));
    expect(screen.getByText("Grading ROI & Break-Even Simulator")).toBeInTheDocument();
    expect(screen.getByText("Specifications & Standards Knowledge Base")).toBeInTheDocument();

    // Switch to All Specifications tab
    fireEvent.click(screen.getByRole("button", { name: /All Specifications/i }));
    expect(screen.getByText("13 Supported Third-Party Grading Authorities")).toBeInTheDocument();
  });

  it("toggles Sheldon scale collapsible tiers and strike designations expander", () => {
    render(
      <MemoryRouter initialEntries={["/specifications"]}>
        <SpecificationsPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Numismatics & Strikes/i }));

    // Mint State is expanded by default (grade MS-70 is visible)
    expect(screen.getByText("Mint State 70 (Perfect)")).toBeInTheDocument();

    // AU tier button
    const auBtn = screen.getByRole("button", { name: /About Uncirculated \(AU-50 to AU-58\)/i });
    expect(screen.queryByText("Choice About Uncirculated Plus")).not.toBeInTheDocument();

    // Expand AU tier
    fireEvent.click(auBtn);
    expect(screen.getByText("Choice About Uncirculated Plus")).toBeInTheDocument();

    // Collapse Mint State tier
    const msBtn = screen.getByRole("button", { name: /Mint State & Proof \(MS-60 to MS-70\)/i });
    fireEvent.click(msBtn);
    expect(screen.queryByText("Mint State 70 (Perfect)")).not.toBeInTheDocument();

    // Test Strike Designations "Show All" toggle
    const showAllBtn = screen.getByRole("button", { name: /Show All 15/i });
    fireEvent.click(showAllBtn);
    expect(screen.getByText("Show Top 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show Top 6/i }));
    expect(screen.getByRole("button", { name: /Show All 15/i })).toBeInTheDocument();
  });

  it("exercises interactive cert verification link generator", () => {
    render(
      <MemoryRouter initialEntries={["/specifications"]}>
        <SpecificationsPage />
      </MemoryRouter>
    );

    const certInput = screen.getByLabelText("Certification Number");
    const serviceSelect = screen.getByLabelText("Select Grading Service");

    // Select PSA
    fireEvent.change(serviceSelect, { target: { value: "PSA" } });
    expect(certInput).toHaveValue("82716391");

    const verifyBtn = screen.getByRole("link", { name: /Verify on PSA/i });
    expect(verifyBtn).toHaveAttribute("href", "https://www.psacard.com/cert/82716391");

    // Type custom cert
    fireEvent.change(certInput, { target: { value: "99887766" } });
    expect(verifyBtn).toHaveAttribute("href", "https://www.psacard.com/cert/99887766");

    // Clear cert input -> button disabled
    fireEvent.change(certInput, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Enter Cert # to Verify" })).toBeDisabled();
  });

  it("verifies MarketingPage circular features link is resolved to /specifications", () => {
    render(
      <MemoryRouter initialEntries={["/marketing"]}>
        <MarketingPage />
      </MemoryRouter>
    );

    const specLink = screen.getByRole("link", { name: /Explore full specifications →/i });
    expect(specLink).toHaveAttribute("href", "/specifications");
  });

  it("verifies ComingSoonPage has direct /register and /login CTAs with zero mock forms", () => {
    render(
      <MemoryRouter initialEntries={["/coming-soon"]}>
        <ComingSoonPage />
      </MemoryRouter>
    );

    expect(screen.queryByPlaceholderText(/Enter email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Notify Me/i })).not.toBeInTheDocument();

    const registerCta = screen.getByRole("link", { name: /Create Free Account/i });
    expect(registerCta).toHaveAttribute("href", "/register");

    const loginCtas = screen.getAllByRole("link", { name: /Vault Sign In/i });
    expect(loginCtas.length).toBeGreaterThanOrEqual(1);
    expect(loginCtas[0]).toHaveAttribute("href", "/login");
  });
});

describe("Interactive Specifications Calculators & Accordions", () => {
  it("tests MeltCalculatorCard metal changes, unit switching, and custom spot rates", () => {
    render(
      <MeltCalculatorCard spotPrices={{ GOLD: "3000.00", SILVER: "40.00" }} />
    );

    // Initial is Gold with 3000.00 spot
    expect(screen.getByText("$3,000.00/oz t")).toBeInTheDocument();

    // Switch to Silver
    const metalSelect = screen.getByLabelText("Metal");
    fireEvent.change(metalSelect, { target: { value: "SILVER" } });
    expect(screen.getByText("$40.00/oz t")).toBeInTheDocument();

    // Change purity to Sterling Silver (.925)
    const puritySelect = screen.getByLabelText("Purity / Fineness");
    fireEvent.change(puritySelect, { target: { value: "0.925" } });

    // Switch mass unit to Grams
    const gramsBtn = screen.getByRole("button", { name: /Grams \(g\)/i });
    fireEvent.click(gramsBtn);

    // Change gross mass to 31.1034768 grams (~1 oz t)
    const massInput = screen.getByLabelText("Gross Mass / Weight");
    fireEvent.change(massInput, { target: { value: "31.1034768" } });

    // 1 oz t * 0.925 * $40.00 = $37.00
    expect(screen.getByText("$37.00")).toBeInTheDocument();

    // Switch back to oz t
    const oztBtn = screen.getByRole("button", { name: /Troy Ounce \(oz t\)/i });
    fireEvent.click(oztBtn);

    // Test Platinum, Palladium, Copper
    fireEvent.change(metalSelect, { target: { value: "COPPER" } });
    expect(screen.getByText(/fine pure Copper/i)).toBeInTheDocument();

    // Test empty quantity fallback (0)
    fireEvent.change(massInput, { target: { value: "" } });
    expect(screen.getByText("$0.00")).toBeInTheDocument();

    // Test initialMetal fallback, unknown key handling, and NaN spotPrices fallback with a fresh mount
    const { unmount } = render(<MeltCalculatorCard initialMetal="UNKNOWN_KEY" spotPrices={{ GOLD: "invalid" }} />);
    expect(screen.getAllByText(/Gold/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$2,650.00/oz t")).toBeInTheDocument();
    unmount();
  });

  it("tests GradingRoiCard profitable vs deficit calculations and raw cost edit", () => {
    render(<GradingRoiCard />);

    const rawCostInput = screen.getByLabelText(/Raw Acquisition Cost/i);
    const slabValInput = screen.getByLabelText(/Projected Slab Value at Target Grade/i);
    const tierSelect = screen.getByLabelText(/Service & Submission Tier/i);

    // Default: Raw 120 + PCGS Economy (35) = 155 basis. Slab 240 -> +85 net profit
    expect(screen.getByText("Safe margin above break-even")).toBeInTheDocument();
    expect(screen.getByText(/Projected Net Profit/i)).toBeInTheDocument();

    // Change raw acquisition cost
    fireEvent.change(rawCostInput, { target: { value: "100" } });

    // Switch to high tier (PSA Regular = $90)
    fireEvent.change(tierSelect, { target: { value: "psa-regular" } });
    // Cost basis = 100 + 90 = $190 (appears in break-even badge and metric card)
    expect(screen.getAllByText("$190.00").length).toBeGreaterThanOrEqual(2);

    // Reduce slab value to $150 (sub break-even: 150 - 190 = -40 deficit)
    fireEvent.change(slabValInput, { target: { value: "150" } });
    expect(screen.getByText("Value does not cover grading friction")).toBeInTheDocument();
    expect(screen.getByText(/Projected Net Deficit/i)).toBeInTheDocument();
  });

  it("tests SpecificationsFaqCard accordion expansion and toggle", () => {
    render(<SpecificationsFaqCard />);

    // Item 0 is open by default
    expect(screen.getByText(/All three use the 70-point Sheldon scale/i)).toBeInTheDocument();

    // Click item 1 to expand
    const cacBtn = screen.getByRole("button", { name: /What does CAC verification/i });
    fireEvent.click(cacBtn);
    expect(screen.getByText(/A Green Bean sticker signifies/i)).toBeInTheDocument();

    // Click item 0 to collapse
    const item0Btn = screen.getByRole("button", { name: /What is the practical difference between PCGS, NGC, and CACG/i });
    fireEvent.click(item0Btn);
    expect(screen.queryByText(/All three use the 70-point Sheldon scale/i)).not.toBeInTheDocument();
  });
});
