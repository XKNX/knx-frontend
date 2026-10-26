"""Generate offline backend fixtures from a pinned public Home Assistant Core revision."""
import argparse
from functools import cache
import json
from pathlib import Path
import re
import urllib.request

CORE_REF = "d8668bb69320af8d50182091f48fcec6699d7185"
OUTPUT = Path(__file__).resolve().parents[1] / "src/localize/backend-en.json"


@cache
def source(namespace: tuple[str, ...]) -> dict:
    path = "homeassistant/strings.json" if namespace == ("common",) else f"homeassistant/components/{namespace[1]}/strings.json"
    with urllib.request.urlopen(f"https://raw.githubusercontent.com/home-assistant/core/{CORE_REF}/{path}", timeout=30) as response:
        data = json.load(response)
        return data["common"] if namespace == ("common",) else data


def resolved(value: str, seen: tuple[str, ...] = ()) -> str:
    def reference(match):
        key = match[1]
        if key in seen:
            raise ValueError(f"Cyclic translation reference: {key}")
        parts = key.split("::")
        count = 1 if parts[0] == "common" else 2
        target = source(tuple(parts[:count]))
        for part in parts[count:]:
            target = target[part]
        if not isinstance(target, str):
            raise ValueError(f"Translation reference is not text: {key}")
        return resolved(target, (*seen, key))
    return re.sub(r"\[%key:([^%]+)%\]", reference, value)


def generate() -> dict[str, str]:
    result = {}
    def flatten(value, key):
        if isinstance(value, str):
            result[key] = resolved(value)
        else:
            for name, child in value.items():
                flatten(child, f"{key}.{name}")
    flatten(source(("component", "knx"))["config_panel"], "component.knx.config_panel")
    for platform in ["light", "sensor"]:
        result[f"component.{platform}.title"] = resolved(source(("component", platform))["title"])
    return dict(sorted(result.items()))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(generate(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text() != rendered:
            raise SystemExit("Backend fixtures differ from pinned Core; run gallery:translations")
    else:
        OUTPUT.write_text(rendered)
