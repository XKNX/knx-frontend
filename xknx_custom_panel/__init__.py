"""Panel for the KNX integration."""
import os


def get_knx_panel() -> str:
    """Get path to KNX Panel."""
    return os.path.dirname(os.path.realpath(__file__)) + "/knx-panel.js"

def is_dev() -> bool:
    """Get development mode."""
    return True
