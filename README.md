# KNX UI

This is the KNX panel for the KNX core integration in Home Assistant. It
provides a user interface for interacting with the KNX integration.

## Features

* Info:
  ![Info](./screenshots/info.png?raw=true)
  * Get an overview of your current KNX installation state (shows if connected
    to the Bus, which XKNX version is running and the currently assigned
    Individual address)
  * Upload ETS project file (which is used in the Group Monitor to provide
    destination names and DPT interpretation) and delete it again from Home
    Assistant.
  * Get key information about the parsed ETS project which has been uploaded
* Group Monitor: Use the interactive bus monitor to view all incoming and
  outgoing telegrams on the bus.
  ![Group Monitor](./screenshots/bus_monitor.png?raw=true)
* ETS Project: Displays the Group Addresses provided via ETS Project in a tree view
  ![Project](./screenshots/project.png?raw=true)

## Development

If you check this repository out for the first time please run the following command to init the submodules:

```shell
$ make bootstrap
...
```

### Development build (watcher)

```shell
$ make develop
...
```

### Production build

```shell
$ make build
...
```

### Update the home assistant frontend

Replace latest_tag with the current release tag.

```shell
$ cd homeassistant-frontend
$ git fetch
...
$ git checkout latest_tag
...
$ cd ..
$ rm -f yarn.lock
$ node ./script/merge_requirements.js
...
$ script/bootstrap
...
```

### Testing the panel

First of all we recommend to follow the instructions for
[preparing a home assistant development environment](hassos_dev_env).

You can test the panel by symlinking the build result directory `knx_frontend`
into your Home Assistant configuration directory.

Assuming:

* The `knx-frontend` repository is located at `<knx-frontend-dir>` path
* The `home-assistant-core` repository is located at `<hass-dir>` path (Remark: per default the Home Assistant configuration directory will be created within `<hass-dir>/config`)

```shell
$ ln -s <knx-frontend-dir>/knx_frontend <hass-dir>/config/
$ cd <hass-dir>
# Next step might be optional and depends on how you setup your python environment
$ source venv/bin/activate
$ hass -c config
...
```

Now `hass` (Home Assistant Core) should run on your machine and the knx panel is
accessible at http://localhost:8123/knx.


[hassos_dev_env]: https://developers.home-assistant.io/docs/development_environment/