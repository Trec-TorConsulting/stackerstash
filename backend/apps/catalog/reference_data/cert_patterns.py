from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Authoritative Cert Verification Deep-Link Schemas (Zero-API deterministic)
# ---------------------------------------------------------------------------
CERT_VERIFICATION_URLS: dict[str, str] = {
    "PCGS": "https://www.pcgs.com/cert/{cert}",
    "NGC": "https://www.ngccoin.com/certlookup/{cert}/",
    "PMG": "https://www.pmgnotes.com/certlookup/{cert}/",
    "PCGS_BANKNOTE": "https://www.pcgs.com/banknote/cert/{cert}",
    "CACG": "https://www.cacgrading.com/cert/{cert}",
    "CAC": "https://www.caccoin.com/verify-cert/?cert={cert}",
    "ANACS": "https://www.anacs.com/Verify/CertVerification.aspx?cert={cert}",
    "ICG": "https://www.icgcoin.com/verify-coin/?cert={cert}",
    "PSA": "https://www.psacard.com/cert/{cert}",
    "BGS": "https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id={cert}",
    "CGC": "https://www.cgccards.com/certlookup/{cert}/",
    "SGC": "https://www.gosgc.com/cert-code-lookup?cert={cert}",
    "TAG": "https://my.taggrading.com/card/{cert}",
}


def build_cert_verification_url(grading_service: str, cert_number: str) -> str | None:
    """Return official third-party cert lookup URL deterministically without API calls."""
    srv = (grading_service or "").strip().upper()
    cert = (cert_number or "").strip()
    if not cert or srv not in CERT_VERIFICATION_URLS:
        return None
    template = CERT_VERIFICATION_URLS[srv]
    return template.format(cert=cert)


# ---------------------------------------------------------------------------
# Slab Barcode / 2D DataMatrix Regex Parsers
# ---------------------------------------------------------------------------
_BARCODE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # NGC / PMG: 7-8 digits followed by hyphen and 3-digit line/spec (e.g. 1234567-001)
    (re.compile(r"^\s*(\d{7,8}-\d{3})\s*$"), "NGC"),
    # PCGS composite slab format: <spec>.<grade>/<cert> (e.g. 7226.64/12345678)
    (re.compile(r"^\s*\d{3,6}\.\d{1,2}/(\d{7,9})\s*$"), "PCGS"),
    # TAG: 8-9 character uppercase alphanumeric (e.g. N1234567 or A1B2C3D4)
    (re.compile(r"^\s*([A-Z0-9]{8,10})\s*$", re.I), "TAG"),
    # General numeric 7-10 digits (PSA, PCGS, BGS, CGC, SGC, ANACS)
    (re.compile(r"^\s*(\d{7,10})\s*$"), "GENERIC"),
]


def parse_slab_barcode(raw_code: str) -> dict[str, str] | None:
    """
    Parse a scanned 1D/2D barcode or DataMatrix string from a grading slab.
    Returns dict with detected service, cert_number, and optional deep-link URL.
    """
    cleaned = (raw_code or "").strip()
    if not cleaned:
        return None

    # Handle URL strings that directly contain cert verification links
    for service, base_pattern in [
        ("PCGS", r"pcgs\.com/cert/(\d{7,9})"),
        ("NGC", r"ngccoin\.com/certlookup/(\d{7,8}(?:-\d{3})?)"),
        ("PMG", r"pmgnotes\.com/certlookup/(\d{7,8}(?:-\d{3})?)"),
        ("PSA", r"psacard\.com/cert/(\d{7,10})"),
        ("CGC", r"cgccards\.com/certlookup/(\d{7,10})"),
        ("TAG", r"taggrading\.com/card/([A-Za-z0-9]{7,10})"),
        ("CACG", r"cacgrading\.com/cert/(\d{7,9})"),
    ]:
        m = re.search(base_pattern, cleaned, re.I)
        if m:
            cert = m.group(1)
            return {
                "grading_service": service,
                "cert_number": cert,
                "verification_url": build_cert_verification_url(service, cert) or "",
            }

    # Match barcode patterns
    # 1. NGC / PMG hyphenated cert
    m_hyphen = re.search(r"\b(\d{7,8}-\d{3})\b", cleaned)
    if m_hyphen:
        cert = m_hyphen.group(1)
        return {
            "grading_service": "NGC",
            "cert_number": cert,
            "verification_url": build_cert_verification_url("NGC", cert) or "",
        }

    # 2. PCGS slash composite format (7226.64/12345678)
    m_pcgs = re.search(r"\b\d{3,6}\.\d{1,2}/(\d{7,9})\b", cleaned)
    if m_pcgs:
        cert = m_pcgs.group(1)
        return {
            "grading_service": "PCGS",
            "cert_number": cert,
            "verification_url": build_cert_verification_url("PCGS", cert) or "",
        }

    # 3. TAG alphanumeric format (only if prefixed or exactly 8-char alnum)
    if re.match(r"^[A-Za-z0-9]{8}$", cleaned) and any(c.isalpha() for c in cleaned):
        cert = cleaned.upper()
        return {
            "grading_service": "TAG",
            "cert_number": cert,
            "verification_url": build_cert_verification_url("TAG", cert) or "",
        }

    # 4. Standard 7-10 digit numeric barcode
    m_num = re.search(r"\b(\d{7,10})\b", cleaned)
    if m_num:
        cert = m_num.group(1)
        return {
            "grading_service": "PSA",  # Default most prevalent slab barcode format
            "cert_number": cert,
            "verification_url": build_cert_verification_url("PSA", cert) or "",
        }

    return None
