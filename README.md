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

Always pass the release tag (`YYYYMMDD.N`) that Home Assistant Core pins. Without one, the
script picks the most recently tagged commit, usually the newest beta.

```shell
$ script/upgrade-frontend <tag>
...
```

The script only moves the submodule and merges dependencies. Follow
[the upgrade skill](.agents/skills/upgrading-knx-frontend-submodule/SKILL.md) for choosing the
tag, porting the mirrored build tooling and the checks before opening a PR.

### Dependabot pull requests

Dependabot opens PRs for GitHub Actions and for npm security updates. Bumps of direct dependencies
are closed rather than merged, because `package.json` follows the submodule; lock-only bumps are
merged once their checks pass. Follow
[the Dependabot skill](.agents/skills/merging-knx-frontend-dependabot-prs/SKILL.md) to triage and
merge them.

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
    yarn agent:claude   # Creates CLAUDE.md and links .claude/skills
    yarn agent:gemini   # Creates GEMINI.md  
    yarn agent:codex    # Creates AGENTS.md
    ```

* Agent skills live in `.agents/skills/`, the cross-tool convention from [agentskills.io](https://agentskills.io), which Codex, Gemini CLI and GitHub Copilot read directly. Claude Code only reads `.claude/skills/`, so `yarn agent:claude` links that directory to `.agents/skills`.
