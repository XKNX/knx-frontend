# KNX UI

This is the KNX custom panel for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

## Features

* Get an overview of your current KNX installation state (shows if connected to the Bus, which XKNX version is running and the currently assigned Individual address)
* Use the interactive bus monitor to view all incoming and outgoing telegrams on the bus

![Bus Monitor](./screenshots/bus_monitor.png?raw=true)

## Development

Please install the pre-commit hook by using:

    pip install -r requirements_dev.txt
    pre-commit install

Start the frontend with:

    cd frontend && nvm use && npm install && npm run start