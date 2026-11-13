from __future__ import annotations

from cryptography.fernet import Fernet
from django.conf import settings


def _get_fernet() -> Fernet:
    return Fernet(settings.FIELD_ENCRYPTION_KEY)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a sensitive string using the configured Fernet key."""
    token = _get_fernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a previously encrypted string."""
    if not ciphertext:
        return ""
    return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")


def mask_secret(plaintext: str) -> str:
    """Return a non-sensitive masked preview showing only the last 4 chars."""
    stripped = plaintext.strip()
    if len(stripped) <= 4:
        return "••••"
    return f"••••{stripped[-4:]}"

