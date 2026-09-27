# Checks on the local toolchain and generated files: nvm and Node, Yarn, node_modules, the git
# hook, agent instruction links, the build output and the inputs for lint:types.

NVM_HOME=${NVM_DIR:-$HOME/.nvm}
NVM_USE='source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use'

nvmrc_version() { tr -d ' \r\n' <.nvmrc 2>/dev/null | sed 's/^v//'; }

check_nvm() {
  local want
  want=$(nvmrc_version)
  if [ ! -s "$NVM_HOME/nvm.sh" ]; then
    report nvm warn "nvm not found in $NVM_HOME" \
      "install nvm: https://github.com/nvm-sh/nvm#installing-and-updating   (the user does this)"
  elif [ ! -d "$NVM_HOME/versions/node/v$want" ]; then
    report nvm warn "Node $want from .nvmrc is not installed in nvm" \
      "source \"$NVM_HOME/nvm.sh\" && nvm install   (downloads Node: ask the user first)"
  else
    report nvm ok "nvm has Node $want"
  fi
}

NODE_OK=0

check_node() {
  local want have
  want=$(nvmrc_version)
  have=$(node --version 2>/dev/null)
  have=${have#v}
  if [ -z "$have" ]; then
    report node fail "node is not on PATH" "$NVM_USE"
  elif [ "$have" != "$want" ]; then
    report node fail "node $have is active, .nvmrc wants $want (tests fail on other versions)" \
      "$NVM_USE   (in every new shell)"
  else
    NODE_OK=1
    report node ok "node $have matches .nvmrc"
  fi
}

check_yarn() {
  local want have
  want=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"yarn@\([^"]*\)".*/\1/p' package.json | head -1)
  if [ "$SUBMODULE" = missing ]; then
    report yarn fail "not checked: .yarnrc.yml takes yarn from the submodule (see submodule)"
    return
  fi
  if [ $NODE_OK != 1 ]; then
    report yarn fail "not checked: yarn needs the Node version from .nvmrc (see node)"
    return
  fi
  have=$(COREPACK_ENABLE_NETWORK=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn --version 2>/dev/null | tail -1)
  if [ -z "$have" ]; then
    report yarn fail "yarn is not available" \
      "corepack enable   (changes the Node installation: ask the user first)"
  elif [ "$have" != "$want" ]; then
    report yarn fail "yarn $have, package.json wants $want" \
      "check the submodule: yarnPath in .yarnrc.yml points into homeassistant-frontend"
  else
    report yarn ok "yarn $have"
  fi
}

check_deps() {
  local state=node_modules/.yarn-state.yml file
  if [ ! -f "$state" ]; then
    report deps fail "node_modules is missing or was not installed by yarn" "yarn install"
    return
  fi
  for file in package.json yarn.lock .yarnrc.yml; do
    if [ "$file" -nt "$state" ]; then
      report deps fail "node_modules is older than $file (branch switch or submodule upgrade?)" \
        "yarn install"
      return
    fi
  done
  report deps ok "node_modules is up to date with package.json and yarn.lock"
}

check_hooks() {
  if [ "$(git config --get core.hooksPath)" = ".husky/_" ] && [ -f .husky/_/pre-commit ]; then
    report hooks ok "husky pre-commit hook is active"
  else
    report hooks warn "the husky pre-commit hook (eslint, prettier) is not active" \
      "yarn install   (its postinstall sets up husky)"
  fi
}

link_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }

check_agents() {
  local missing="" fixes=""
  if ! link_to CLAUDE.md .github/copilot-instructions.md || ! link_to .claude/skills ../.agents/skills; then
    missing+=" CLAUDE.md+.claude/skills"
    fixes+=$'\n'"yarn agent:claude"
  fi
  if ! link_to AGENTS.md .github/copilot-instructions.md; then
    missing+=" AGENTS.md"
    fixes+=$'\n'"yarn agent:codex"
  fi
  if ! link_to GEMINI.md .github/copilot-instructions.md; then
    missing+=" GEMINI.md"
    fixes+=$'\n'"yarn agent:gemini"
  fi
  if [ -z "$missing" ]; then
    report agents ok "agent instruction links and .claude/skills are in place"
  else
    report agents warn "missing agent links:$missing (only needed for the agents you use)" \
      "${fixes#$'\n'}"
  fi
}

check_build() {
  local hash
  hash=$(sed -n 's/^FILE_HASH = "\(.*\)"$/\1/p' knx_frontend/constants.py 2>/dev/null)
  if [ -z "$hash" ]; then
    report build warn "the panel is not built (knx_frontend/constants.py is missing)" \
      "script/build   (or keep script/develop running)"
  elif [ ! -f "knx_frontend/entrypoint.$hash.js" ]; then
    report build warn "knx_frontend/entrypoint.$hash.js is missing" \
      "script/build   (or keep script/develop running)"
  else
    report build ok "built: knx_frontend/entrypoint.$hash.js"
  fi
}

check_types_inputs() {
  if [ -f homeassistant-frontend/build/mdi/iconList.json ] &&
    [ -f homeassistant-frontend/build/translations/translationMetadata.json ]; then
    report types-inputs ok "inputs for yarn lint:types exist"
  else
    report types-inputs warn "inputs for yarn lint:types are missing" \
      "yarn gulp gen-icons-json build-translations"
  fi
}
