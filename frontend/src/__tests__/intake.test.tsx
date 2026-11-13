import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GuidedCameraModal } from "../components/GuidedCameraModal";
import { api } from "../lib/api";
import { ScanAddPage } from "../pages/ScanAddPage";

beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock-preview");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
});

function renderScanAdd() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ScanAddPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("GuidedCameraModal", () => {
  it("renders reticle toggles, zoom slider, and native camera fallback", () => {
    render(
      <GuidedCameraModal
        open={true}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        requireBack={true}
        initialShape="circle"
      />
    );

    expect(screen.getByText(/Guided Capture — Step 1: Front/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coin (Circle)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Note / Bar (Rect)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Camera zoom")).toBeInTheDocument();
    expect(screen.getByText(/Capture Front Photo/i)).toBeInTheDocument();
  });
});

describe("ScanAddPage Unified Intake", () => {
  it("enforces Front and Back photos for Coin uploads", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);

    const { container } = renderScanAdd();
    expect(screen.queryByText(/Quick-Add Presets/i)).not.toBeInTheDocument();
    const uploadInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    expect(uploadInput).toBeTruthy();

    const frontFile = new File(["front"], "front.jpg", { type: "image/jpeg" });
    fireEvent.change(uploadInput, { target: { files: [frontFile] } });

    expect(
      await screen.findByText(/Upload requires both Front \(Obverse\) and Back \(Reverse\) photos/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Identify with AI/i })).toBeDisabled();

    const backFile = new File(["back"], "back.jpg", { type: "image/jpeg" });
    const uploadInput2 = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    // Pick both together to auto-assign OBVERSE & REVERSE, or change select
    const selects = screen.getAllByRole("combobox");
    // The photo label select is inside the uploaded file card
    const photoSelect = selects.find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === "REVERSE")
    ) as HTMLSelectElement;
    expect(photoSelect).toBeTruthy();

    fireEvent.change(uploadInput2, { target: { files: [backFile] } });
    const allSelects = screen.getAllByRole("combobox").filter((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === "REVERSE")
    ) as HTMLSelectElement[];
    fireEvent.change(allSelects[1], { target: { value: "REVERSE" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Identify with AI/i })).not.toBeDisabled();
    });
  });

  it("displays verification warnings and allows explicit Proceed Anyway override", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    vi.spyOn(api, "identifyImages").mockResolvedValue({
      job_id: "job-1",
      provider_used: "mock",
      warning: null,
      verification_status: "FLAGGED",
      verification_warnings: ["Possible screen moire pattern detected."],
      candidate: {
        category: "COIN",
        title: "1921 Morgan Dollar",
        country: "United States",
        year: "1921",
        mint_or_refiner: "US Mint",
        denomination: "$1",
        series: "Morgan",
        metal_type: "SILVER",
        weight_value: 0.7734,
        weight_unit: "OZ_T",
        purity: 0.9,
        grading_service: "NONE",
        cert_number: "",
        grade: "",
        slab_designation: "",
        estimated_grade: "XF-45",
        serial_number: "",
        estimated_value_usd: 35,
        ai_confidence: 0.91,
        notes: "",
      },
    });
    const createSpy = vi.spyOn(api, "createItem").mockResolvedValue({
      id: "item-123",
      appraisal_job_id: "appraisal-123",
    } as never);
    vi.spyOn(api, "uploadPhoto").mockResolvedValue({} as never);

    const { container } = renderScanAdd();
    const uploadInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const f1 = new File(["front"], "front.jpg", { type: "image/jpeg" });
    const f2 = new File(["back"], "back.jpg", { type: "image/jpeg" });
    fireEvent.change(uploadInput, { target: { files: [f1, f2] } });

    const identifyBtn = await screen.findByRole("button", { name: /Identify with AI/i });
    fireEvent.click(identifyBtn);

    expect(await screen.findByText(/Photo Authenticity \/ Quality Warning/i)).toBeInTheDocument();
    expect(screen.getByText(/Possible screen moire pattern detected\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proceed Anyway" }));
    expect(await screen.findByText(/Warning acknowledged/i)).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Save Item to Vault/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          intake_source: "UPLOAD",
          photo_verification_status: "OVERRIDDEN",
          auto_appraise: true,
        })
      );
    });
  });
});
