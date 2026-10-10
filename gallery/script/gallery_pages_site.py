"""Bounded, non-executable artifact handling for the trusted Pages publisher."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import stat
import unicodedata
import zipfile

MAX_GALLERY_BYTES = 128 * 1024 * 1024
MAX_FILES = 10_000
MAX_SITE_BYTES = 900 * 1024 * 1024
STATE = ".gallery-pages.json"


def validate_preview_changes(changes: dict) -> None:
    if not isinstance(changes, dict) or type(changes.get("shared")) is not bool:
        raise ValueError("Invalid preview changes")
    components = changes.get("components")
    if not isinstance(components, list) or len(components) > 1000:
        raise ValueError("Invalid preview components")
    identifiers = set()
    for entry in components:
        if (not isinstance(entry, dict) or not isinstance(entry.get("id"), str)
                or not entry["id"].strip() or len(entry["id"]) > 120
                or any(ord(c) < 32 for c in entry["id"])
                or entry["id"] in identifiers or not isinstance(entry.get("title"), str)
                or not entry["title"].strip() or len(entry["title"]) > 160
                or any(ord(c) < 32 for c in entry["title"])):
            raise ValueError("Invalid preview component")
        identifiers.add(entry["id"])


def read_catalog(root: Path) -> list[dict] | None:
    path = root / "catalog.json"
    if not path.exists():
        return None  # Previously published galleries have no catalog asset.
    with path.open("rb") as stream:
        raw = stream.read(256 * 1024 + 1)
    if len(raw) > 256 * 1024:
        raise ValueError("Gallery catalog exceeds size limit")
    catalog = json.loads(raw)
    validate_preview_changes({"components": catalog, "shared": False})
    tags = set()
    for entry in catalog:
        covers = entry.get("covers")
        if (not isinstance(covers, list) or not 1 <= len(covers) <= 100
                or any(not isinstance(tag, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,119}-[a-z0-9-]+", tag)
                       or tag in tags for tag in covers) or len(set(covers)) != len(covers)):
            raise ValueError("Invalid gallery coverage")
        tags.update(covers)
    return catalog


def extract_gallery(archive: Path, destination: Path) -> None:
    if destination.exists():
        raise ValueError("Extraction destination must not exist")
    with zipfile.ZipFile(archive) as source:
        infos = source.infolist()
        if len(infos) > MAX_FILES or sum(i.file_size for i in infos) > MAX_GALLERY_BYTES:
            raise ValueError("Gallery exceeds extraction limits")
        seen = set()
        files = set()
        for info in infos:
            name = info.filename.rstrip("/")
            parts = name.split("/")
            mode = stat.S_IFMT(info.external_attr >> 16)
            if (info.orig_filename != info.filename or not name or "\\" in name or any(ord(c) < 32 for c in name)
                    or any(not p or p.startswith(".") or ":" in p for p in parts)
                    or parts[0].casefold() in {"pr", "cname"}
                    or mode not in {0, stat.S_IFREG, stat.S_IFDIR}
                    or info.flag_bits & 1):
                raise ValueError("Unsafe gallery archive entry")
            key = unicodedata.normalize("NFC", name).casefold()
            if key in seen or any("/".join(key.split("/")[:i]) in files for i in range(1, len(parts))):
                raise ValueError("Ambiguous gallery archive path")
            if not info.is_dir() and any(k.startswith(key + "/") for k in seen):
                raise ValueError("File conflicts with archive directory")
            seen.add(key)
            if not info.is_dir():
                files.add(key)
        if not {"index.html", "preview.html"} <= {i.filename for i in infos if not i.is_dir()}:
            raise ValueError("Missing gallery entrypoints")
        destination.mkdir(parents=True)
        total = 0
        try:
            for info in infos:
                target = destination / info.filename
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(info) as inp, target.open("xb") as out:
                    while chunk := inp.read(1024 * 1024):
                        total += len(chunk)
                        if total > MAX_GALLERY_BYTES:
                            raise ValueError("Gallery exceeds extraction limit")
                        out.write(chunk)
            read_catalog(destination)
        except Exception:
            shutil.rmtree(destination)
            raise


def validate_gallery_base(root: Path, base: str) -> None:
    """Reject bundles compiled for a different placement; never rewrite PR code."""
    class Scripts(HTMLParser):
        def __init__(self):
            super().__init__()
            self.sources = []

        def handle_starttag(self, tag, attrs):
            if tag == "script":
                source = dict(attrs).get("src")
                if source is not None:
                    self.sources.append(source)

    for name in ["index.html", "preview.html"]:
        parser = Scripts()
        parser.feed((root / name).read_text())
        if not parser.sources or any(not source.startswith(base)
                or not re.fullmatch(r"[A-Za-z0-9_.-]+\.js", source[len(base):])
                or not (root / source[len(base):]).is_file() for source in parser.sources):
            raise ValueError("Gallery artifact was built for a different base path")


def gallery_path(pr_number: int | None) -> Path:
    if pr_number is None:
        return Path("gallery")
    if type(pr_number) is not int or pr_number <= 0:
        raise ValueError("Invalid PR number")
    return Path("pr") / str(pr_number) / "gallery"


def validate_site_size(root: Path) -> int:
    size = 0
    for path in root.rglob("*"):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError("Site contains non-regular files")
        if path.is_file():
            size += path.stat().st_size
            if size > MAX_SITE_BYTES:
                raise ValueError("Pages site exceeds 900 MiB; remove closed previews first")
    return size


def compose_site(published: Path, output: Path, candidate: Path | None,
                 pr_number: int | None, remove_prs: set[int], *, legacy_main=False) -> None:
    if output.exists():
        raise ValueError("Site output must not exist")
    if published.exists():
        shutil.copytree(published, output, ignore=shutil.ignore_patterns(".git", STATE))
    else:
        output.mkdir(parents=True)
    for number in remove_prs:
        if not isinstance(number, int) or number <= 0:
            raise ValueError("Invalid PR number")
        shutil.rmtree(output / "pr" / str(number), ignore_errors=True)
    if candidate is not None:
        target = output / gallery_path(pr_number)
        if pr_number is None:
            if legacy_main:
                # The former publisher owned the entire root apart from PR slots.
                for path in output.iterdir():
                    if path.name in {"pr", "gallery"}:
                        continue
                    shutil.rmtree(path) if path.is_dir() else path.unlink()
            shutil.rmtree(target, ignore_errors=True)
        else:
            # Replace the owned PR slot, including any legacy root-level bundle.
            shutil.rmtree(target.parent, ignore_errors=True)
        shutil.copytree(candidate, target)
    validate_site_size(output)


def empty_state(repository: str) -> dict:
    return dict(schema=1, repository=repository, published_commit=None, deployment_run=None,
                deployment_pending=False, main=None, previews={}, comments={}, requests={})


def read_state(root: Path, repository: str) -> dict:
    data = json.loads((root / STATE).read_text())
    if data["schema"] != 1 or data["repository"] != repository:
        raise ValueError("Foreign or unsupported Pages state")
    if type(data["deployment_pending"]) is not bool:
        raise ValueError("Invalid pending deployment state")
    pointer = data["published_commit"]
    if pointer is not None and not re.fullmatch("[a-f0-9]{40}", pointer):
        raise ValueError("Invalid published pointer")
    for number, entry in data["previews"].items():
        if not re.fullmatch(r"[1-9][0-9]*", number):
            raise ValueError("Invalid preview key")
    for entry in [data["main"], *data["previews"].values()]:
        if entry is None:
            continue
        if "layout" in entry and entry["layout"] != "gallery":
            raise ValueError("Invalid gallery layout")
        if not re.fullmatch("[a-f0-9]{40}", entry["sha"]):
            raise ValueError("Invalid gallery commit")
        for field in ["run_id", "run_attempt", "artifact_id", "actor_id"]:
            if type(entry[field]) is not int or entry[field] <= 0:
                raise ValueError("Invalid gallery provenance")
        if entry["comment_id"] is not None and (type(entry["comment_id"]) is not int or entry["comment_id"] <= 0):
            raise ValueError("Invalid approval comment")
        if entry.get("changes") is not None:
            validate_preview_changes(entry["changes"])
    for field in ["comments", "requests"]:
        if not isinstance(data[field], dict):
            raise ValueError("Invalid control state")
    return data


def write_state(root: Path, state: dict) -> None:
    (root / STATE).write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
