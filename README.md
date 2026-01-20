# KNX UI

This is the KNX panel for the KNX core integration in Home Assistant. It
provides a user interface for interacting with the KNX integration.

## Development

If you check out this repository for the first time please run the following command to init the submodules:

```shell
$ nvm use
$ script/bootstrap
...
```

### Development build (watcher)

```shell
$ script/develop
...
```

### Production build

```shell
$ script/build
...
```

### Update the home assistant frontend

Get the latest release tag.

```shell
$ script/upgrade-frontend
...
```

Or get a specific tag or sha.

```shell
$ script/upgrade-frontend <tag-or-sha>
...
```

### Testing the panel

First of all we recommend to follow the instructions for
[preparing a home assistant development environment][hassos_dev_env].

You can test the panel by symlinking the build result directory `knx_frontend`
into your Home Assistant configuration directory.

Assuming:

* The `knx-frontend` repository is located at `<knx-frontend-dir>` path
* The `home-assistant-core` repository is located at `<hass-dir>` path (Remark: per default the Home Assistant configuration directory will be created within `<hass-dir>/config`)

```shell
$ ln -s <knx-frontend-dir>/knx_frontend <hass-dir>/config/deps/lib/python3.xx/site-packages/
$ hass -c config
...
```

Or on a venv-install

```shell
$ cd <hass-dir>
$ script/setup
# Next step might be optional
$ source .venv/bin/activate
$ export PYTHONPATH=<knx-frontend-dir>
$ hass
...
```

Now `hass` (Home Assistant Core) should run on your machine and the knx panel is
accessible at http://localhost:8123/knx.

[hassos_dev_env]: https://developers.home-assistant.io/docs/development_environment/

On Home Assistant OS you might use https://github.com/home-assistant/addons-development/tree/master/custom_deps

### AI Agent Support

This repository ships a set of instructions for AI coding agents.

* GitHub Copilot comes pre-configured — its guidance lives in `.github/copilot-instructions.md`.
* For other agents, you can easy symlink the Copilot instructions with:

    ```shell
    yarn agent:claude   # Creates CLAUDE.md
    yarn agent:gemini   # Creates GEMINI.md  
    yarn agent:codex    # Creates AGENTS.md
    ```
