# KNX UI

This is a custom UI for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

KNX UI exists of 2 components right now:
* KNX panel: a GUI to show different KNX related interfaces
* KNX custom integration: a custom component for HA that implements the neccessary websocket commands and also registers the custom panel with HA

```yaml
# Example configuration.yaml entry
knx_panel:
```

## Installation

### Manual

- Place the custom_components folder in your configuration directory (or add its contents to an existing custom_components folder). It should look similar to this:

```
<config directory>/
|-- custom_components/
|   |-- knx_panel/
|       |-- __init__.py
|       |-- knx_ui.js
|       |-- ...
```

- Edit your configuration.yaml file according to the example above


### HACS (Not yet supported!)

If you want HACS to handle installation and updates, add _KNX Panel_ as a custom repository.

NOTE: This is currently not yet supported!



## Development

Please install the pre-commit hook by using:

    pip install -r requirements_dev.txt
    pre-commit install