import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ComingSoonPage } from "../pages/ComingSoonPage";
import { MarketingPage } from "../pages/MarketingPage";
import { SpecificationsPage } from "../pages/SpecificationsPage";

describe("Specifications Page & Stub Resolution", () => {
  it("renders SpecificationsPage with header, search, category pills, and tables", () => {
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

    // Verify services table present
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

    const searchInput = screen.getByPlaceholderText(/Search Sheldon grades/i);
    fireEvent.change(searchInput, { target: { value: "DMPL" } });
    expect(screen.getByText("Deep Mirror Prooflike")).toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue("");
  });

  it("switches category tabs to isolate specific spec domains", () => {
    render(
      <MemoryRouter initialEntries={["/specifications"]}>
        <SpecificationsPage />
      </MemoryRouter>
    );

    // Switch to Bullion tab
    fireEvent.click(screen.getByRole("button", { name: /Bullion & Spot Math/i }));
    expect(screen.getByText("Authoritative Mass Conversion Constants (NIST Standard)")).toBeInTheDocument();
    expect(screen.getByText("31.1034768 grams")).toBeInTheDocument();

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
