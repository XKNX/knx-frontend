# KNX UI

This is a custom UI for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

KNX UI exists of 2 components right now:
* KNX panel: a GUI to show different KNX related interfaces
* KNX custom integration: a custom component for HA that implements the neccessary websocket commands and also registers the custom panel with HA

## Features

* Get an overview of your current KNX installation state (shows if connected to the Bus, which XKNX version is running and the currently assigned Individual address)
* Use the interactive bus monitor to view all incoming and outgoing telegrams on the bus

![Bus Monitor](./screenshots/bus_monitor.png?raw=true)

## Development

Please install the pre-commit hook by using:

    pip install -r requirements_dev.txt
    pre-commit install

Start the frontend with:

    nvm use && npm install && ng watch
