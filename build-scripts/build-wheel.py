"""Build CI packages with a temporary valid version, optionally checking Gallery isolation."""
import argparse
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check-gallery", action="store_true")
args = parser.parse_args()
version = Path("VERSION")
original = version.read_bytes()
try:
    version.write_text("0.0.0.dev0")
    subprocess.run([sys.executable, "-m", "build"], check=True)
finally:
    version.write_bytes(original)
wheels = list(Path("dist").glob("*.whl"))
if len(wheels) != 1:
    raise ValueError(f"Expected one wheel, found {len(wheels)}")
if args.check_gallery:
    with TemporaryDirectory() as unpacked:
        with ZipFile(wheels[0]) as wheel:
            wheel.extractall(unpacked)
        subprocess.run(["node", "gallery/script/check-gallery-exclusion.mjs",
                        "build/checks/production.json", unpacked], check=True)
