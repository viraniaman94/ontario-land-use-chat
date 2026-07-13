#!/usr/bin/env python3
"""
Split large markdown documents into individual section files with
per-document and top-level navigation indexes.

The agent uses these split files to navigate planning documents without
loading entire large documents (200 KB – 900 KB) into context. Instead it
reads a per-document _index.md (with 1-line summaries), then reads only
the relevant section files (typically 2–50 KB each).

Usage:
    uv run --with marko scripts/split_markdown.py [DOCS_DIR]

Defaults:
    DOCS_DIR = ~/.hermes/skills/ontario-land-use-feasibility/documents

Algorithm:
    1. Parse each .md file with marko to find all headings (level + clean text).
    2. Build a heading tree and determine the best split level for each document
       — start shallow (H1/H2) and go deeper only when sections are too large
       (> MAX_SECTION_BYTES). Merge sections that end up too small
       (< MIN_SECTION_BYTES) into the previous section.
    3. Write each section as an individual .md file in a per-document directory.
    4. Generate a per-document _index.md with 1-line summaries.
    5. Generate a top-level sections-index.md listing all documents.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import NamedTuple

import marko


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_SECTION_BYTES = 80_000   # 80 KB — split deeper if a section exceeds this
MIN_SECTION_BYTES = 1_500    # 1.5 KB — merge into previous if smaller
MAX_SUMMARY_LEN = 120        # characters

# Files to skip (indexes, READMEs, reference docs that are already navigation aids)
SKIP_FILES = {
    "document-index.md",
    "municipal-document-urls.md",
    "municipalities-radius.md",
    "sections-index.md",
}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class Heading(NamedTuple):
    level: int          # 1–6
    text: str           # clean heading text
    line_idx: int       # 0-based line index in the source


class Section(NamedTuple):
    number: str         # zero-padded ("00", "01", ...)
    slug: str           # filesystem-safe slug
    heading_text: str   # clean heading text
    level: int          # heading level (0 for preamble)
    summary: str        # 1-line summary
    content: str        # full markdown content
    filepath: str       # filename within the per-doc directory


# ---------------------------------------------------------------------------
# Markdown heading detection
# ---------------------------------------------------------------------------

HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)')

# HTML span/div tags that Marker sometimes embeds in heading text
HTML_TAG_RE = re.compile(r'<[^>]+>')

# Headings that are pure noise and should be ignored
NOISE_HEADING_RE = re.compile(r'^(page\s*\d+|_page_\d+|\d+\s*)$', re.IGNORECASE)



def strip_html_tags(text: str) -> str:
    """Remove HTML tags from text (Marker sometimes embeds <span> in headings)."""
    return HTML_TAG_RE.sub('', text).strip()


def clean_heading_text(raw: str) -> str:
    """Extract clean, readable text from a heading line."""
    m = HEADING_RE.match(raw)
    if not m:
        return raw.strip()
    text = m.group(2).strip()
    # Remove trailing # (closed ATX headings)
    text = re.sub(r'\s+#+\s*$', '', text)
    # Strip HTML tags
    text = strip_html_tags(text)
    # Use marko to parse inline elements and extract pure text
    try:
        parsed = marko.parse(text)
        parts = []
        for child in _walk_inline(parsed):
            if hasattr(child, 'children') and isinstance(child.children, str):
                parts.append(child.children)
        clean = ''.join(parts).strip()
        if clean:
            return clean
    except Exception:
        pass
    # Fallback: strip common markdown formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    return text.strip()


def _walk_inline(element):
    """Recursively yield all leaf inline elements from a marko AST."""
    if hasattr(element, 'children'):
        if isinstance(element.children, str):
            yield element
        elif isinstance(element.children, list):
            for child in element.children:
                yield from _walk_inline(child)


def find_headings(lines: list[str]) -> list[Heading]:
    """Find all ATX headings in the document."""
    headings: list[Heading] = []
    for i, line in enumerate(lines):
        m = HEADING_RE.match(line)
        if not m:
            continue
        level = len(m.group(1))
        text = clean_heading_text(line)
        if not text or len(text) < 2:
            continue
        # Skip pure-noise headings
        if NOISE_HEADING_RE.match(text):
            continue
        headings.append(Heading(level=level, text=text, line_idx=i))
    return headings


# ---------------------------------------------------------------------------
# Splitting logic — size-aware
# ---------------------------------------------------------------------------

def split_at_level(
    lines: list[str],
    headings: list[Heading],
    level: int,
) -> list[tuple[str, int, int, int]]:
    """
    Split the document at the given heading level.
    Returns a list of (heading_text, heading_level, start_line, end_line) tuples.
    Sections include all content from their heading to the next heading at
    the same or higher level.
    """
    # Filter headings at or above the target level
    split_headings = [h for h in headings if h.level <= level]
    if not split_headings:
        return []

    sections: list[tuple[str, int, int, int]] = []

    # Handle preamble (content before first heading)
    first_line = split_headings[0].line_idx
    if first_line > 0:
        preamble = ''.join(lines[:first_line]).strip()
        if len(preamble) > 100:
            sections.append(("Preamble", 0, 0, first_line))

    for i, h in enumerate(split_headings):
        start = h.line_idx
        if i + 1 < len(split_headings):
            end = split_headings[i + 1].line_idx
        else:
            end = len(lines)
        sections.append((h.text, h.level, start, end))

    return sections


def find_split_levels(headings: list[Heading]) -> list[int]:
    """
    Determine which heading levels exist in the document, sorted ascending.
    E.g., [1, 3, 4] if the doc uses H1, H3, and H4 but no H2.
    """
    return sorted(set(h.level for h in headings))


def split_document(lines: list[str], headings: list[Heading]) -> list[tuple[str, int, int, int]]:
    """
    Find the best split strategy: start at the shallowest meaningful level,
    go deeper only for sections that are too large.
    Returns a list of (heading_text, heading_level, start_line, end_line).
    """
    if not headings:
        return [("Full Document", 0, 0, len(lines))]

    levels = find_split_levels(headings)
    if not levels:
        return [("Full Document", 0, 0, len(lines))]

    # Start with the shallowest level (or second-shallowest if the
    # shallowest is just a document title that appears once or twice)
    # Heuristic: if level 1 has ≤2 headings, start at level 2 (or next available)
    start_idx = 0
    level_1_count = sum(1 for h in headings if h.level == levels[0])
    if level_1_count <= 2 and len(levels) > 1:
        start_idx = 1

    # Try each level from shallow to deep, checking section sizes
    for li in range(start_idx, len(levels)):
        level = levels[li]
        raw_sections = split_at_level(lines, headings, level)

        # Check if any section is too large
        too_large = False
        for _, _, start, end in raw_sections:
            size = sum(len(lines[j]) for j in range(start, end))
            if size > MAX_SECTION_BYTES and li + 1 < len(levels):
                too_large = True
                break

        if not too_large:
            # This level produces reasonable section sizes
            return _merge_small_sections(lines, raw_sections)

    # We're at the deepest level — still merge small sections
    deepest_level = levels[-1]
    raw_sections = split_at_level(lines, headings, deepest_level)
    return _merge_small_sections(lines, raw_sections)


def _merge_small_sections(
    lines: list[str],
    sections: list[tuple[str, int, int, int]],
) -> list[tuple[str, int, int, int]]:
    """
    Merge sections smaller than MIN_SECTION_BYTES into the previous section.
    Always keep at least one section.
    """
    if len(sections) <= 1:
        return sections

    merged: list[tuple[str, int, int, int]] = []
    for name, level, start, end in sections:
        size = sum(len(lines[j]) for j in range(start, end))
        if size < MIN_SECTION_BYTES and merged:
            # Extend the previous section's end to include this one
            prev_name, prev_level, prev_start, _ = merged[-1]
            merged[-1] = (prev_name, prev_level, prev_start, end)
        else:
            merged.append((name, level, start, end))

    return merged


# ---------------------------------------------------------------------------
# Summary extraction
# ---------------------------------------------------------------------------

def extract_summary(lines: list[str], max_len: int = MAX_SUMMARY_LEN) -> str:
    """Extract a 1-line summary from a section's lines (first substantive paragraph)."""
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if HEADING_RE.match(stripped):
            continue
        if re.match(r'^!\[', stripped):
            continue
        if re.match(r'^(-{3,}|\*{3,}|_{3,})$', stripped):
            continue
        if stripped.startswith('|'):
            continue
        if stripped.startswith('---') or stripped.startswith('<div'):
            continue
        if stripped.startswith('<span'):
            continue

        # Strip HTML tags
        stripped = strip_html_tags(stripped)
        if not stripped:
            continue

        # Parse with marko for clean text
        try:
            parsed = marko.parse(stripped)
            parts = []
            for child in _walk_inline(parsed):
                if hasattr(child, 'children') and isinstance(child.children, str):
                    parts.append(child.children)
            clean = ''.join(parts).strip()
            if clean:
                if len(clean) > max_len:
                    clean = clean[:max_len - 3] + '...'
                return clean
        except Exception:
            pass

        # Fallback
        clean = re.sub(r'\*\*(.+?)\*\*', r'\1', stripped)
        clean = re.sub(r'\*(.+?)\*', r'\1', clean)
        clean = re.sub(r'`(.+?)`', r'\1', clean)
        clean = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', clean)
        clean = re.sub(r'^>\s*', '', clean)
        if len(clean) > max_len:
            clean = clean[:max_len - 3] + '...'
        return clean

    return "(no summary available)"


# ---------------------------------------------------------------------------
# Section file generation
# ---------------------------------------------------------------------------

def slugify(text: str, max_len: int = 60) -> str:
    """Convert heading text to a filesystem-safe slug."""
    slug = re.sub(r'[^\w\s-]', '', text)
    slug = re.sub(r'[\s_-]+', '-', slug).strip('-').lower()
    if len(slug) > max_len:
        slug = slug[:max_len].rsplit('-', 1)[0]
    if not slug:
        slug = "section"
    return slug


def build_sections(
    lines: list[str],
    split_points: list[tuple[str, int, int, int]],
) -> list[Section]:
    """Convert split points into Section objects with content, summaries, and filenames."""
    sections: list[Section] = []

    for i, (name, level, start, end) in enumerate(split_points):
        content = ''.join(lines[start:end])
        summary = extract_summary(lines[start:end])
        num = f"{i:02d}"
        slug = slugify(name)
        filepath = f"{num}-{slug}.md"
        sections.append(Section(
            number=num,
            slug=slug,
            heading_text=name,
            level=level,
            summary=summary,
            content=content,
            filepath=filepath,
        ))

    return sections


# ---------------------------------------------------------------------------
# Index generation
# ---------------------------------------------------------------------------

def generate_per_doc_index(doc_name: str, doc_rel_path: str, sections: list[Section]) -> str:
    """Generate the _index.md for a single document."""
    lines = [
        f"# Section Index — {doc_name}",
        "",
        f"**Source file:** `{doc_rel_path}`",
        f"**Sections:** {len(sections)}",
        "",
        "Read individual section files listed below. Each contains one section",
        "of the document with its full content, so you can load only what you need.",
        "",
        "| # | Section | Level | Summary | File |",
        "|---|---------|-------|---------|------|",
    ]

    for s in sections:
        summary_esc = s.summary.replace('|', '\\|').replace('\n', ' ')
        heading_esc = s.heading_text.replace('|', '\\|')
        level_str = f"H{s.level}" if s.level > 0 else "—"
        lines.append(f"| {s.number} | {heading_esc} | {level_str} | {summary_esc} | `{s.filepath}` |")

    lines.extend(["", "---", "*Generated by `scripts/split_markdown.py`*"])
    return '\n'.join(lines) + '\n'


def generate_top_level_index(doc_entries: list[dict]) -> str:
    """Generate the top-level sections-index.md."""
    lines = [
        "# Sections Index — Document Navigation",
        "",
        "This index lets you navigate the planning document knowledge base without",
        "loading entire large documents into context. Each document has been split",
        "into individual section files with a per-document index.",
        "",
        "## How to Navigate",
        "",
        "1. **Find the relevant document** in the table below.",
        "2. **Read its `_index.md`** to see all sections with 1-line summaries.",
        "3. **Read individual section files** that are relevant to your assessment.",
        "",
        "Each section file is typically 2–80 KB vs. 200 KB – 900 KB for a full document.",
        "",
        "## Documents by Category",
        "",
    ]

    categories: dict[str, list[dict]] = {}
    for entry in doc_entries:
        categories.setdefault(entry["category"], []).append(entry)

    cat_order = [
        ("provincial", "Provincial Documents"),
        ("upper-tier", "Upper-Tier Municipal Official Plans"),
        ("single-tier", "Single-Tier Municipal Documents"),
        ("zoning", "Zoning By-laws"),
    ]

    for cat_key, cat_name in cat_order:
        if cat_key not in categories:
            continue
        lines.append(f"### {cat_name}")
        lines.append("")
        lines.append("| Document | Sections | Section Index | Full Document |")
        lines.append("|----------|----------|---------------|---------------|")
        for entry in sorted(categories[cat_key], key=lambda e: e["doc_name"]):
            lines.append(
                f"| {entry['doc_name']} | {entry['section_count']} | "
                f"`{entry['index_rel_path']}` | `{entry['doc_rel_path']}` |"
            )
        lines.append("")

    # Non-standard categories
    done = {ck for ck, _ in cat_order}
    for cat_key, entries in sorted(categories.items()):
        if cat_key in done:
            continue
        cat_name = cat_key.replace('-', ' ').title()
        lines.append(f"### {cat_name}")
        lines.append("")
        lines.append("| Document | Sections | Section Index | Full Document |")
        lines.append("|----------|----------|---------------|---------------|")
        for entry in sorted(entries, key=lambda e: e["doc_name"]):
            lines.append(
                f"| {entry['doc_name']} | {entry['section_count']} | "
                f"`{entry['index_rel_path']}` | `{entry['doc_rel_path']}` |"
            )
        lines.append("")

    total_sections = sum(e["section_count"] for e in doc_entries)
    lines.extend([
        "---",
        "",
        f"**Total:** {len(doc_entries)} documents, {total_sections} sections",
        "",
        "*Generated by `scripts/split_markdown.py`*",
    ])
    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------------------
# Document processing
# ---------------------------------------------------------------------------

def should_skip(filename: str) -> bool:
    if filename in SKIP_FILES:
        return True
    if filename.startswith('_') or filename.startswith('README'):
        return True
    return False


def process_document(md_path: Path, docs_dir: Path) -> dict | None:
    """Process one .md file: split it, write sections + index, return metadata."""
    rel_path = md_path.relative_to(docs_dir)
    doc_name = md_path.stem

    content = md_path.read_text(encoding='utf-8')
    lines = content.splitlines(keepends=True)

    headings = find_headings(lines)
    if not headings:
        print(f"  SKIP (no headings): {rel_path}")
        return None

    split_points = split_document(lines, headings)
    if not split_points:
        print(f"  SKIP (no sections): {rel_path}")
        return None

    sections = build_sections(lines, split_points)

    # Create per-document directory
    doc_dir = md_path.parent / doc_name
    doc_dir.mkdir(exist_ok=True)

    # Clear out old section files (from previous runs)
    for old_file in doc_dir.glob("*.md"):
        old_file.unlink()

    # Write section files
    for s in sections:
        (doc_dir / s.filepath).write_text(s.content, encoding='utf-8')

    # Write per-document index
    index_content = generate_per_doc_index(doc_name, str(rel_path), sections)
    (doc_dir / "_index.md").write_text(index_content, encoding='utf-8')

    parent = rel_path.parent
    index_rel = f"{parent}/{doc_name}/_index.md" if str(parent) != "." else f"{doc_name}/_index.md"

    # Compute total size for reporting
    total_kb = sum(len(s.content) for s in sections) // 1024
    print(f"  OK: {rel_path} → {len(sections)} sections ({total_kb} KB total)")

    return {
        "doc_name": doc_name,
        "doc_rel_path": str(rel_path),
        "index_rel_path": index_rel,
        "section_count": len(sections),
        "category": rel_path.parts[0] if len(rel_path.parts) > 1 else "root",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Split markdown documents into individual section files with navigation indexes."
    )
    parser.add_argument(
        "docs_dir", nargs="?", default=None,
        help="Directory containing .md files (default: skill documents dir)",
    )
    args = parser.parse_args()

    if args.docs_dir:
        docs_dir = Path(args.docs_dir).resolve()
    else:
        skill_dir = Path.home() / ".hermes" / "skills" / "ontario-land-use-feasibility"
        docs_dir = skill_dir / "documents"

    if not docs_dir.exists():
        print(f"ERROR: Documents directory not found: {docs_dir}")
        sys.exit(1)

    print(f"Splitting markdown documents in: {docs_dir}")
    print()

    # Find all .md files, excluding split directories and index files.
    # Materialize the list BEFORE any processing so newly-created split
    # directories are not picked up.
    all_md = sorted(docs_dir.rglob("*.md"))
    # Build a set of directories that already exist as split dirs (contain _index.md)
    split_dirs = {p.parent for p in all_md if p.name == "_index.md"}

    md_files: list[Path] = []
    for md_path in all_md:
        if should_skip(md_path.name):
            continue
        # Skip files inside a split directory
        if md_path.parent in split_dirs:
            continue
        # Skip files inside a subdirectory that matches a document stem
        # (e.g., zoning/pps-2024/00-intro.md where pps-2024.md exists)
        if len(md_path.relative_to(docs_dir).parts) > 2:
            # File is nested deeper than category/file.md — likely in a split dir
            continue
        md_files.append(md_path)

    print(f"Found {len(md_files)} markdown files to process")
    print()

    doc_entries: list[dict] = []
    for md_path in md_files:
        entry = process_document(md_path, docs_dir)
        if entry:
            doc_entries.append(entry)

    print()
    print(f"Processed {len(doc_entries)} documents")

    # Write top-level index
    top_index = docs_dir / "sections-index.md"
    top_index.write_text(generate_top_level_index(doc_entries), encoding='utf-8')
    print(f"Top-level index: {top_index}")
    print("Done!")


if __name__ == "__main__":
    main()