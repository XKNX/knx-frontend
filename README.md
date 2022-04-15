# KNX UI

[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/XKNX/custom-panel/main.svg)](https://results.pre-commit.ci/latest/github/XKNX/custom-panel/main)


This is a custom UI for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

KNX UI exists of 2 components right now:
* KNX panel: a GUI to show different KNX related interfaces
* KNX custom integration: a custom component for HA that implements the neccessary websocket commands and also registers the custom panel with HA

## Development

Please install the pre-commit hook by using:

    pip install -r requirements_dev.txt
    pre-commit install