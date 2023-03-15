"""KNX Frontend"""
from .constants import DEV, FILE_HASH


def locate_dir():
    """Return the location of the frontend files."""
    return __path__[0]


def get_build_id():
    """Get the KNX panel build id."""
    if DEV:
        return "dev"
    return FILE_HASH
