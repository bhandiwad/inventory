#!/usr/bin/env python3
"""Phase 0 catalog loader and candidate normalizer for SMTC_Stock.xlsx.

The script never silently merges fuzzy matches. It imports raw rows, produces
candidate mappings for admin review, and can export seed SQL from reviewed JSON.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd


CATEGORY_MAP = {
    "TRUNK MAT": "TRUNK_MAT",
    "PARCEL TRAY": "PARCEL_TRAY",
    "FOOTSTEP GARNISH": "FOOTSTEP",
    "FOOT STEP GARNISH": "FOOTSTEP",
    "DOOR EDGE GUARD": "DOOR_EDGE",
    "DOOR HANDLE COVER": "DOOR_HANDLE",
    "GRASSMAT": "GRASSMAT",
    "LLM": "LLM",
    "DCC": "DCC",
    "WFK": "WFK",
    "DVSL": "DVSL",
    "DV": "DV",
    "TLC": "TLC",
}

BRAND_SLUGS = {
    "Hyndai": "hyundai",
    "WV": "vw",
    "NEXA": "nexa",
    "FIAT": "fiat",
    "ASHOK LEYLAND": "ashok-leyland",
    "2 WHEELER": "2-wheeler",
    "DOOR EDGE GUARD": "universal-generic",
    "GRASSMAT": "universal-generic",
}

NON_PRODUCT_TOKENS = {
    "",
    "ITEM NAME",
    "O/B",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
    "31",
    "32",
    "33",
    "34",
    "35",
    "36",
    "37",
    "38",
    "39",
    "40",
    "41",
    "42",
    "43",
    "44",
    "45",
    "46",
    "47",
    "48",
    "49",
    "50",
    "51",
}


@dataclass
class RawRow:
    id: str
    source_file: str
    source_sheet: str
    source_row: int
    raw_brand: str
    raw_model: str
    raw_category: str
    raw_variant: str | None
    raw_name: str
    raw_qty: str
    normalized_status: str = "pending"
    mapped_master_product_id: str | None = None
    notes: str | None = None


def slugify(value: str) -> str:
    value = value.strip().lower().replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-") or "unknown"


def clean(value: Any) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def normalize_category(value: str) -> str:
    key = re.sub(r"\s+", " ", value.strip().upper())
    return CATEGORY_MAP.get(key, slugify(key).upper().replace("-", "_"))


def split_model_variant(raw_name: str) -> tuple[str, str | None]:
    text = re.sub(r"\s+", " ", raw_name.strip())
    variant_parts: list[str] = []
    tokens = text.split(" ")
    if tokens and tokens[-1].upper() in {"M", "A", "AUTO", "MANUAL", "EV", "MAX", "NEW", "OLD"}:
        variant_parts.insert(0, tokens.pop())
    model = " ".join(tokens).strip() or text
    variant = " ".join(variant_parts).strip() or None
    return model, variant


def read_workbook(path: Path) -> list[RawRow]:
    rows: list[RawRow] = []
    workbook = pd.ExcelFile(path)
    for sheet in workbook.sheet_names:
        frame = pd.read_excel(path, sheet_name=sheet, header=None, dtype=object)
        current_category = ""
        raw_brand = BRAND_SLUGS.get(sheet, slugify(sheet))
        for idx, row in frame.iterrows():
            category_cell = clean(row.iloc[1]) if len(row) > 1 else ""
            name_cell = clean(row.iloc[2]) if len(row) > 2 else ""
            qty_cell = clean(row.iloc[3]) if len(row) > 3 else ""

            if category_cell and category_cell.upper() not in {"NAN", "ITEM NAME"}:
                current_category = normalize_category(category_cell)

            if not name_cell or name_cell.upper() in NON_PRODUCT_TOKENS or not current_category:
                continue

            model, variant = split_model_variant(name_cell)
            rows.append(
                RawRow(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{path.name}:{sheet}:{idx + 1}:{current_category}:{name_cell}")),
                    source_file=path.name,
                    source_sheet=sheet,
                    source_row=idx + 1,
                    raw_brand=raw_brand,
                    raw_model=model,
                    raw_category=current_category,
                    raw_variant=variant,
                    raw_name=name_cell,
                    raw_qty=qty_cell,
                    notes="owner-confirm-category" if current_category in {"LLM", "DCC", "WFK", "DVSL", "DV", "TLC"} else None,
                )
            )
    return rows


def write_raw_csv(rows: list[RawRow], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(asdict(rows[0]).keys()) if rows else [])
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def sql_literal(value: Any) -> str:
    if value is None or value == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def write_raw_sql(rows: list[RawRow], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    lines = ["truncate public.raw_catalog_rows restart identity;"]
    for row in rows:
        lines.append(
            "insert into public.raw_catalog_rows "
            "(id, source_file, source_sheet, source_row, raw_brand, raw_model, raw_category, raw_variant, raw_name, raw_qty, normalized_status, notes) values "
            f"('{row.id}', {sql_literal(row.source_file)}, {sql_literal(row.source_sheet)}, {row.source_row}, "
            f"{sql_literal(row.raw_brand)}, {sql_literal(row.raw_model)}, {sql_literal(row.raw_category)}, "
            f"{sql_literal(row.raw_variant)}, {sql_literal(row.raw_name)}, {sql_literal(row.raw_qty)}, "
            f"{sql_literal(row.normalized_status)}, {sql_literal(row.notes)});"
        )
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def candidate_review(rows: list[RawRow], output: Path) -> None:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = f"{row.raw_brand}|{row.raw_model}|{row.raw_category}|{row.raw_variant or ''}".lower()
        item = grouped.setdefault(
            key,
            {
                "decision": "create_master",
                "brand_slug": row.raw_brand,
                "model_name": row.raw_model,
                "model_slug": slugify(row.raw_model),
                "category_code": row.raw_category,
                "variant": row.raw_variant,
                "canonical_name": " ".join(x for x in [row.raw_model, row.raw_category, row.raw_variant or ""] if x),
                "aliases": sorted({row.raw_name}),
                "raw_row_ids": [],
                "admin_notes": row.notes,
            },
        )
        item["aliases"] = sorted(set(item["aliases"]) | {row.raw_name})
        item["raw_row_ids"].append(row.id)
        if len(item["raw_row_ids"]) > 1:
            item["possible_duplicate_count"] = len(item["raw_row_ids"])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(list(grouped.values()), indent=2, ensure_ascii=False), encoding="utf-8")


def export_seed_sql(review_json: Path, output: Path) -> None:
    decisions = json.loads(review_json.read_text(encoding="utf-8"))
    lines = [
        "-- Generated from reviewed catalog decisions.",
        "-- Only decisions with create_master or alias are exported.",
    ]
    for item in decisions:
        if item.get("decision") not in {"create_master", "alias"}:
            continue
        model_slug = item["model_slug"]
        brand_slug = item["brand_slug"]
        aliases = "array[" + ",".join(sql_literal(a) for a in item.get("aliases", [])) + "]"
        lines.append(
            "insert into public.vehicle_models (brand_id, name, slug, aliases) "
            f"select b.id, {sql_literal(item['model_name'])}, {sql_literal(model_slug)}, {aliases}::text[] "
            f"from public.brands b where b.slug = {sql_literal(brand_slug)} "
            "on conflict (brand_id, slug) do update set aliases = excluded.aliases;"
        )
        lines.append(
            "insert into public.master_products (vehicle_model_id, category_id, canonical_name, aliases, variant) "
            "select vm.id, pc.id, "
            f"{sql_literal(item['canonical_name'])}, {aliases}::text[], {sql_literal(item.get('variant'))} "
            "from public.vehicle_models vm "
            "join public.brands b on b.id = vm.brand_id "
            "join public.product_categories pc on pc.code = "
            f"{sql_literal(item['category_code'])} "
            f"where b.slug = {sql_literal(brand_slug)} and vm.slug = {sql_literal(model_slug)};"
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    load = sub.add_parser("load")
    load.add_argument("xlsx", type=Path)
    load.add_argument("--csv", type=Path, default=Path("catalog/raw_catalog_rows.csv"))
    load.add_argument("--sql", type=Path, default=Path("catalog/raw_catalog_rows.sql"))
    load.add_argument("--review", type=Path, default=Path("catalog/review_candidates.json"))
    seed = sub.add_parser("export-seed")
    seed.add_argument("review_json", type=Path)
    seed.add_argument("--sql", type=Path, default=Path("catalog/clean_seed.sql"))
    args = parser.parse_args()

    if args.command == "load":
        rows = read_workbook(args.xlsx)
        write_raw_csv(rows, args.csv)
        write_raw_sql(rows, args.sql)
        candidate_review(rows, args.review)
        print(json.dumps({"raw_rows": len(rows), "csv": str(args.csv), "sql": str(args.sql), "review": str(args.review)}, indent=2))
        return 0
    if args.command == "export-seed":
        export_seed_sql(args.review_json, args.sql)
        print(json.dumps({"seed_sql": str(args.sql)}, indent=2))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
