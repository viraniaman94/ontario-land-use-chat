#!/usr/bin/env python3
"""
Batch-convert PDFs to LLM-friendly Markdown using Marker + an LLM backend.

Default backend: OpenCode Go (OpenAI-compatible, https://opencode.ai/zen/go/v1)
with the deepseek-v4-flash model. Marker's `--use_llm` mode is text-only — it
sends detected text/table blocks to the LLM for cleanup, cross-page table
merging, inline math formatting, and form-value extraction. It does NOT send
page images, so any chat model works.

Env (read from process env, or from ../.env.local if present):
  OPENCODE_GO_API_KEY   Required. Your OpenCode Go subscription API key.
  OPENCODE_GO_BASE_URL  Default: https://opencode.ai/zen/go/v1
  OPENCODE_GO_MODEL     Default: opencode-go/deepseek-v4-flash
  MARKER_CMD            Default: uvx --from marker-pdf marker_single
                         (override to e.g. "marker_single" if you have it on PATH)

Usage:
  python3 scripts/convert_pdfs.py [options]

Examples:
  # Convert every PDF under the default skill documents dir, one at a time
  python3 scripts/convert_pdfs.py

  # Convert a specific folder, allow 2 parallel jobs, force re-convert
  python3 scripts/convert_pdfs.py --input ./pdfs --output ./md --jobs 2 --force

  # Use a different Go model for this run
  OPENCODE_GO_MODEL=opencode-go/kimi-k2 python3 scripts/convert_pdfs.py

Output:
  <output>/<relpath>.md            — the converted markdown (tables as GFM)
  <output>/<relpath>.meta.json     — marker's metadata sidecar
  scripts/convert-report.json       — table-quality log (per-file stats)
  scripts/convert-report.csv        — same, tabular

The script is resumable: a PDF whose .md output already exists is skipped
unless --force is passed.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env.local"
REPORT_JSON = Path(__file__).resolve().parent / "convert-report.json"
REPORT_CSV = Path(__file__).resolve().parent / "convert-report.csv"

DEFAULT_SKILL_DOCS = Path.home() / ".hermes/skills/ontario-land-use-feasibility/documents"
DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1"
DEFAULT_MODEL = "opencode-go/deepseek-v4-flash"
DEFAULT_MARKER_CMD = "uvx --from marker-pdf marker_single"


def load_env_file(env_path: Path) -> None:
    """Load simple KEY=VALUE lines from a .env file into os.environ (without
    overriding values already set in the real environment)."""
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip("'\"")
        os.environ.setdefault(key, val)


def get_config() -> dict:
    api_key = os.environ.get("OPENCODE_GO_API_KEY", "").strip()
    return {
        "api_key": api_key,
        "base_url": os.environ.get("OPENCODE_GO_BASE_URL", DEFAULT_BASE_URL).strip(),
        "model": os.environ.get("OPENCODE_GO_MODEL", DEFAULT_MODEL).strip(),
        "marker_cmd": os.environ.get("MARKER_CMD", DEFAULT_MARKER_CMD).strip(),
    }


# ----------------------------------------------------------------------------
# Table-quality metrics (operate on produced markdown)
# ----------------------------------------------------------------------------
GFM_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
GFM_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")


def count_tables(md: str) -> tuple[int, int]:
    """Return (num_table_blocks, total_data_rows). A table block is a maximal
    run of consecutive GFM table rows containing a separator line."""
    blocks = 0
    rows = 0
    in_table = False
    seen_sep = False
    for line in md.splitlines():
        if GFM_TABLE_ROW.match(line):
            if not in_table:
                in_table = True
                seen_sep = False
            if GFM_TABLE_SEP.match(line):
                seen_sep = True
            else:
                # only count as table if a separator was seen; otherwise it's
                # just a bordered paragraph line
                if seen_sep:
                    rows += 1
        else:
            if in_table and seen_sep:
                blocks += 1
            in_table = False
            seen_sep = False
    if in_table and seen_sep:
        blocks += 1
    return blocks, rows


# ----------------------------------------------------------------------------
# Marker execution
# ----------------------------------------------------------------------------
def build_marker_command(cfg: dict, pdf: Path, tmp_out: Path, extra: list[str]) -> list[str]:
    parts = shlex.split(cfg["marker_cmd"])
    parts += [
        str(pdf),
        "--output_dir", str(tmp_out),
        "--use_llm",
        "--llm_service", "marker.services.openai.OpenAIService",
        "--openai_base_url", cfg["base_url"],
        "--openai_api_key", cfg["api_key"],
        "--openai_model", cfg["model"],
    ]
    parts += extra
    return parts


def run_one(pdf: Path, out_md: Path, cfg: dict, extra: list[str], force: bool) -> dict:
    """Convert one PDF. Returns a result record dict."""
    rec: dict = {
        "input": str(pdf),
        "output": str(out_md),
        "status": "skipped",
        "elapsed_s": 0.0,
        "tables": 0,
        "table_rows": 0,
        "chars": 0,
        "pages": 0,
        "error": "",
    }
    if out_md.exists() and not force:
        # Still compute metrics on existing output
        md = out_md.read_text(encoding="utf-8", errors="replace")
        rec["tables"], rec["table_rows"] = count_tables(md)
        rec["chars"] = len(md)
        rec["status"] = "skipped-existing"
        return rec

    start = time.time()
    # marker writes <tmp_out>/<stem>/<stem>.md (+ meta.json, images)
    tmp_out = out_md.parent / f".{out_md.stem}.marker_tmp"
    if tmp_out.exists():
        shutil.rmtree(tmp_out)
    tmp_out.mkdir(parents=True, exist_ok=True)

    cmd = build_marker_command(cfg, pdf, tmp_out, extra)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60 * 60,  # 1h per file hard cap
        )
        if proc.returncode != 0:
            rec["status"] = "error"
            tail = (proc.stderr or proc.stdout or "")[-1500:]
            rec["error"] = tail
            rec["elapsed_s"] = round(time.time() - start, 1)
            return rec
    except subprocess.TimeoutExpired:
        rec["status"] = "timeout"
        rec["error"] = "marker exceeded 1h timeout"
        rec["elapsed_s"] = round(time.time() - start, 1)
        return rec
    except FileNotFoundError as e:
        rec["status"] = "error"
        rec["error"] = f"command not found: {e}"
        rec["elapsed_s"] = round(time.time() - start, 1)
        return rec

    # Locate generated markdown (marker creates a subdir named after the pdf stem)
    produced = list(tmp_out.rglob("*.md"))
    if not produced:
        rec["status"] = "error"
        rec["error"] = "marker produced no .md output"
        rec["elapsed_s"] = round(time.time() - start, 1)
        return rec
    md_file = produced[0]
    out_md.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(md_file), str(out_md))

    # Move meta.json sidecar next to the .md if present
    metas = list(tmp_out.rglob("meta.json"))
    if metas:
        shutil.move(str(metas[0]), str(out_md.with_suffix(".meta.json")))

    md = out_md.read_text(encoding="utf-8", errors="replace")
    rec["tables"], rec["table_rows"] = count_tables(md)
    rec["chars"] = len(md)
    rec["status"] = "ok"
    rec["elapsed_s"] = round(time.time() - start, 1)

    # pages from meta if available, else blank
    meta_path = out_md.with_suffix(".meta.json")
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            rec["pages"] = int(meta.get("page_count", meta.get("total_pages", 0)) or 0)
        except Exception:
            pass

    shutil.rmtree(tmp_out, ignore_errors=True)
    return rec


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def find_pdfs(input_dir: Path) -> list[Path]:
    return sorted(p for p in input_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".pdf")


def output_path_for(pdf: Path, input_dir: Path, output_dir: Path) -> Path:
    rel = pdf.relative_to(input_dir)
    return (output_dir / rel).with_suffix(".md")


def main() -> int:
    ap = argparse.ArgumentParser(description="Batch-convert PDFs to LLM-friendly markdown via Marker + OpenCode Go.")
    ap.add_argument("--input", "-i", default=str(DEFAULT_SKILL_DOCS),
                    help=f"Input directory to scan for PDFs (default: {DEFAULT_SKILL_DOCS})")
    ap.add_argument("--output", "-o", default=str(REPO_ROOT / "converted-docs"),
                    help="Output directory for .md files (default: ./converted-docs)")
    ap.add_argument("--jobs", "-j", type=int, default=1,
                    help="Parallel conversion jobs (default 1; OpenCode Go rate-limits)")
    ap.add_argument("--force", action="store_true", help="Re-convert even if .md output exists")
    ap.add_argument("--force-ocr", action="store_true",
                    help="Pass --force_ocr to marker (use for scanned/image PDFs)")
    ap.add_argument("--format-lines", action="store_true",
                    help="Pass --format_lines to marker (fix garbled digital text lines)")
    ap.add_argument("--dry-run", action="store_true", help="List what would be converted and exit")
    args = ap.parse_args()

    load_env_file(ENV_FILE)
    cfg = get_config()

    if not cfg["api_key"]:
        print("ERROR: OPENCODE_GO_API_KEY not set. Add it to .env.local or the "
              "environment, or run with OPENCODE_GO_API_KEY=...", file=sys.stderr)
        return 2

    input_dir = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output).expanduser().resolve()
    pdfs = find_pdfs(input_dir)
    if not pdfs:
        print(f"No PDFs found under {input_dir}", file=sys.stderr)
        return 1
    print(f"Found {len(pdfs)} PDF(s) under {input_dir}")
    print(f"Output dir : {output_dir}")
    print(f"Backend    : {cfg['base_url']}  model={cfg['model']}")
    print(f"Marker cmd : {cfg['marker_cmd']}")
    print(f"Jobs       : {args.jobs}")

    extra: list[str] = []
    if args.force_ocr:
        extra.append("--force_ocr")
    if args.format_lines:
        extra.append("--format_lines")

    plan: list[tuple[Path, Path]] = []
    for pdf in pdfs:
        out_md = output_path_for(pdf, input_dir, output_dir)
        plan.append((pdf, out_md))

    if args.dry_run:
        for pdf, out_md in plan:
            skip = "" if args.force or not out_md.exists() else "  (exists, will skip)"
            print(f"  {pdf}  ->  {out_md}{skip}")
        return 0

    results: list[dict] = []
    jobs = max(1, args.jobs)
    start_all = time.time()

    def emit(rec: dict) -> None:
        results.append(rec)
        flag = ""
        if rec["status"] == "ok":
            flag = f" tables={rec['tables']} rows={rec['table_rows']} chars={rec['chars']}"
        elif rec["status"].startswith("error") or rec["status"] == "timeout":
            flag = f" ERR: {rec['error'][:160]}"
        print(f"[{len(results)}/{len(plan)}] {rec['status']:16s} {rec['elapsed_s']:6.1f}s  "
              f"{Path(rec['input']).name}{flag}")

    if jobs == 1:
        for pdf, out_md in plan:
            emit(run_one(pdf, out_md, cfg, extra, args.force))
    else:
        with ThreadPoolExecutor(max_workers=jobs) as ex:
            futs = {ex.submit(run_one, pdf, out_md, cfg, extra, args.force): (pdf, out_md)
                    for pdf, out_md in plan}
            for fut in as_completed(futs):
                try:
                    emit(fut.result())
                except Exception as e:
                    pdf, out_md = futs[fut]
                    emit({"input": str(pdf), "output": str(out_md), "status": "error",
                          "elapsed_s": 0.0, "tables": 0, "table_rows": 0,
                          "chars": 0, "pages": 0, "error": f"{type(e).__name__}: {e}"})

    total_s = round(time.time() - start_all, 1)
    ok = sum(1 for r in results if r["status"] == "ok")
    skipped = sum(1 for r in results if r["status"].startswith("skipped"))
    errors = sum(1 for r in results if r["status"] in ("error", "timeout"))
    total_tables = sum(r["tables"] for r in results)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "backend": {"base_url": cfg["base_url"], "model": cfg["model"]},
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "totals": {
            "files": len(results), "ok": ok, "skipped": skipped, "errors": errors,
            "tables": total_tables, "elapsed_s": total_s,
        },
        "files": results,
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    with REPORT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["input", "output", "status", "elapsed_s", "pages",
                    "tables", "table_rows", "chars", "error"])
        for r in results:
            w.writerow([r["input"], r["output"], r["status"], r["elapsed_s"],
                        r["pages"], r["tables"], r["table_rows"], r["chars"], r["error"]])

    print("\n================ SUMMARY ================")
    print(f"ok={ok}  skipped={skipped}  errors={errors}  total_tables={total_tables}")
    print(f"elapsed={total_s}s")
    print(f"report: {REPORT_JSON}")
    print(f"report: {REPORT_CSV}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())