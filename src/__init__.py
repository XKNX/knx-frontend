"""KNX Frontend."""
from .constants import FILE_HASH


def locate_dir() -> str:
    """Return the location of the frontend files."""
    return __path__[0]


def get_build_id() -> str:
    """Get the panel build id."""
    return FILE_HASH


def is_dev_build() -> bool:
    """Check if this is a dev build."""
    return FILE_HASH == "dev"


def entrypoint_js() -> str:
    """Return the name of the entrypoint js file."""
    return f"entrypoint-{FILE_HASH}.js"
