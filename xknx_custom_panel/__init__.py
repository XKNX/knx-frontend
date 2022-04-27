"""Custom panel for the KNX integration."""
import os


def get_knx_ui() -> str:
    """Get path to KNX UI."""
    return os.path.dirname(os.path.realpath(__file__)) + "/knx_ui.js"

