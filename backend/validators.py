"""
validators.py — Input validation utilities.

Centralised password strength checking and input sanitisation
for the AEGIS IT Policy Manager.
"""

import re


def validate_password_strength(password: str) -> str | None:
    """
    Validate password against enterprise security requirements.
    Returns an error message string if invalid, or None if valid.

    Requirements (aligned with NESA IA-5 and ISO 27001:2022 Annex A.8.5):
      - Minimum 12 characters (admin accounts)
      - At least one uppercase letter
      - At least one lowercase letter
      - At least one digit
      - At least one special character
    """
    if len(password) < 12:
        return "Password must be at least 12 characters."

    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter."

    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter."

    if not re.search(r"\d", password):
        return "Password must contain at least one digit."

    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]", password):
        return "Password must contain at least one special character (!@#$%^&*...)."

    return None


def sanitize_text_input(text: str, max_length: int = 5000) -> str:
    """
    Basic sanitisation for free-text inputs.
    Strips control characters and enforces max length.
    """
    # Remove null bytes and other control characters (keep \n, \r, \t)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return cleaned[:max_length].strip()
