#!/usr/bin/env python3
"""Extract page-bounded text from the pinned Comprehensive Rules PDF."""

from __future__ import annotations

import hashlib
import json
import signal
import sys
from pathlib import Path

from pypdf import PdfReader

EXPECTED_VERSION = "2026-08-07"
EXPECTED_DATE_TEXT = "August 7, 2026"
EXPECTED_SHA256 = (
    "9e2268a0ed58f229c5b974a3ae7986c5f91a5a052c4af1a9e672906a427c044c"
)
EXPECTED_PAGES = 312
TIMEOUT_SECONDS = 90


def fail_timeout(_signum: int, _frame: object) -> None:
    raise TimeoutError(f"PDF extraction exceeded {TIMEOUT_SECONDS} seconds")


def main() -> None:
    output_directory = (
        Path(sys.argv[1]).resolve()
        if len(sys.argv) > 1
        else (Path(__file__).parents[2] / "rules-data").resolve()
    )
    pdf_path = output_directory / "MagicCompRules-20260807.pdf"
    metadata_path = output_directory / "source.json"
    output_path = output_directory / "extracted-pages.json"

    if not pdf_path.is_file() or not metadata_path.is_file():
        raise FileNotFoundError("Run scripts/rules/fetch.mjs before extraction")
    if pdf_path.stat().st_size > 5 * 1024 * 1024:
        raise ValueError("Rules PDF exceeds the 5 MiB extraction limit")

    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError(f"Rules PDF checksum mismatch: {digest}")

    source = json.loads(metadata_path.read_text(encoding="utf-8"))
    if source.get("version") != EXPECTED_VERSION or source.get("sha256") != digest:
        raise ValueError("Source metadata does not match the pinned version/checksum")

    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, fail_timeout)
        signal.alarm(TIMEOUT_SECONDS)
    try:
        reader = PdfReader(pdf_path, strict=True)
        if len(reader.pages) != EXPECTED_PAGES:
            raise ValueError(
                f"Expected {EXPECTED_PAGES} PDF pages, found {len(reader.pages)}"
            )
        pages = []
        for page_number, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").replace("\x00", "")
            text = text.strip()
            pages.append({"page": page_number, "text": text})
    finally:
        if hasattr(signal, "SIGALRM"):
            signal.alarm(0)

    first_page = pages[0]["text"]
    if (
        "Magic: The Gathering Comprehensive Rules" not in first_page
        or f"effective as of {EXPECTED_DATE_TEXT}" not in first_page
    ):
        raise ValueError("PDF title/effective date did not match the pinned version")
    if not any(page["text"].startswith("Glossary") for page in pages[5:]):
        raise ValueError("Extracted PDF does not contain the expected glossary")

    temporary_path = output_path.with_suffix(f".json.{os_getpid()}.tmp")
    temporary_path.write_text(
        json.dumps({"source": source, "pages": pages}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary_path.chmod(0o600)
    temporary_path.replace(output_path)
    print(f"Extracted {len(pages)} validated pages to {output_path}")


def os_getpid() -> int:
    # Kept local so importing this script has no filesystem side effects.
    import os

    return os.getpid()


if __name__ == "__main__":
    main()
