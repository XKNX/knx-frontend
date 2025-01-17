"""KNX Frontend."""

from typing import Final

from .constants import FILE_HASH


def locate_dir() -> str:
    """Return the location of the frontend files."""
    return __path__[0]


# Filename of the entrypoint.js to import the panel
entrypoint_js: Final = f"entrypoint.{FILE_HASH}.js"

# The webcomponent name that loads the panel (main.ts)
webcomponent_name: Final = "knx-frontend"

is_dev_build: Final = FILE_HASH == "dev"
is_prod_build: Final = not is_dev_build
