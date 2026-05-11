import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("catalog_normalize", Path("scripts/catalog_normalize.py"))
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)


def test_category_normalization_preserves_unknown_abbreviations():
    assert mod.normalize_category("TRUNK MAT") == "TRUNK_MAT"
    assert mod.normalize_category("LLM") == "LLM"
    assert mod.normalize_category("FootStep Garnish") == "FOOTSTEP"


def test_slugify_common_sheet_typos():
    assert mod.BRAND_SLUGS["Hyndai"] == "hyundai"
    assert mod.BRAND_SLUGS["WV"] == "vw"
