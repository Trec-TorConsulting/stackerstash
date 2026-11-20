export const CERT_VERIFICATION_URLS: Record<string, string> = {
  PCGS: "https://www.pcgs.com/cert/{cert}",
  NGC: "https://www.ngccoin.com/certlookup/{cert}/",
  PMG: "https://www.pmgnotes.com/certlookup/{cert}/",
  CACG: "https://www.cacgrading.com/cert/{cert}",
  CAC: "https://www.caccoin.com/lookup/?cert={cert}",
  ANACS: "https://www.anacs.com/verify-cert/?cert={cert}",
  ICG: "https://www.icgcoin.com/verify-cert/?cert={cert}",
  PSA: "https://www.psacard.com/cert/{cert}",
  BGS: "https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id={cert}",
  CGC: "https://www.cgccards.com/certlookup/{cert}/",
  SGC: "https://www.gosgc.com/cert-verification?certNumber={cert}",
  TAG: "https://taggrading.com/verify/{cert}",
  GENERIC: "https://www.google.com/search?q={service}+cert+{cert}",
};

export function buildCertVerificationUrl(service: string, certNumber: string): string {
  const svc = (service || "").trim().toUpperCase();
  const cert = (certNumber || "").trim().replace(/[^A-Za-z0-9]/g, "");
  if (!cert) return "";
  const tmpl = CERT_VERIFICATION_URLS[svc] || CERT_VERIFICATION_URLS.GENERIC;
  return tmpl.replace("{cert}", cert).replace("{service}", encodeURIComponent(svc || "collectible"));
}

export function parseSlabBarcode(
  rawCode: string
): { grading_service: string; cert_number: string; grade?: string } | null {
  const clean = (rawCode || "").trim();
  if (!clean) return null;

  // 1. PCGS 2D / 1D format: e.g. 12345678.65/87654321
  const pcgsMatch = clean.match(/^(\d+)\.(\d+)\/(\d+)$/);
  if (pcgsMatch) {
    return {
      grading_service: "PCGS",
      cert_number: pcgsMatch[3],
      grade: pcgsMatch[2],
    };
  }

  // 2. NGC format: e.g. 1234567-001
  const ngcMatch = clean.match(/^(\d{7,8})-?(\d{3})$/);
  if (ngcMatch) {
    return {
      grading_service: "NGC",
      cert_number: `${ngcMatch[1]}-${ngcMatch[2]}`,
    };
  }

  // 3. PSA 1D barcode: 8 to 10 digits
  const psaMatch = clean.match(/^(\d{8,10})$/);
  if (psaMatch) {
    return {
      grading_service: "PSA",
      cert_number: psaMatch[1],
    };
  }

  return null;
}
