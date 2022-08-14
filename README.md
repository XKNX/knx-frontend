# KNX UI

This is the KNX custom panel for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

## Features

* Get an overview of your current KNX installation state (shows if connected to the Bus, which XKNX version is running and the currently assigned Individual address)
* Use the interactive bus monitor to view all incoming and outgoing telegrams on the bus

![Bus Monitor](./screenshots/bus_monitor.png?raw=true)

## Development

If you check this repository out for the first time please run the following command to init the submodules:

    script/bootstrap

### Development build (watcher)

    yarn run develop

### Production build

    yarn run build