"""KNX Frontend"""
from .constants import FILE_HASH


def locate_dir():
    """Return the location of the frontend files."""
    return __path__[0]


def get_build_id(is_dev):
    """Get the KNX panel build id."""
    if is_dev:
        return "dev"
    return FILE_HASH
