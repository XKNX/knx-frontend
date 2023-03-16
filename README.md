# KNX UI

This is the KNX panel for the KNX core integration in Home Assistant. It provides a user interface for interacting with the
KNX integration.

## Features

* Get an overview of your current KNX installation state (shows if connected to the Bus, which XKNX version is running and the currently assigned Individual address)
* Use the interactive bus monitor to view all incoming and outgoing telegrams on the bus

![Bus Monitor](./screenshots/bus_monitor.png?raw=true)

## Development

If you check this repository out for the first time please run the following command to init the submodules:

    make bootstrap

### Development build (watcher)

    make develop

### Production build

    make build

### Update the home assistant frontend

Replace latest_tag with the current release tag.

    cd homeassistant-frontend
    git fetch
    git checkout latest_tag
    cd ..
    rm -f yarn.lock
    node ./script/merge_requirements.js
    script/bootstrap

### Testing the panel

You can test the panel by symlinking the build result directory `knx_frontend` into your Home Assistant configuration directory.

    ln -s /Users/me/dev/knx-frontend/knx_frontend ~/.homeassistant/
