# KNX UI

This is a custom UI for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

KNX UI exists of 2 components right now:
* KNX panel: a GUI to show different KNX related interfaces
* KNX custom integration: a custom component for HA that implements the neccessary websocket commands and also registers the custom panel with HA

## Todos

* Create basic frontend version including package.json, compiler stuff, bundling etc.
* Register the frontend panel in the custom integration
* Add GH actions for validation