const fs = require("fs");
const yaml = require('js-yaml');

let raw_package_core = fs.readFileSync("./homeassistant-frontend/package.json");
let raw_package_knx = fs.readFileSync("./package.json");


const package_core = JSON.parse(raw_package_core);
const package_knx = JSON.parse(raw_package_knx);

fs.writeFileSync(
  "./package.json",
  JSON.stringify(
    {
      ...package_knx,
      resolutions: { ...package_core.resolutions, ...package_knx.resolutionsOverride },
      dependencies: { ...package_core.dependencies, ...package_knx.dependenciesOverride },
      devDependencies: { ...package_core.devDependencies, ...package_knx.devDependenciesOverride },
    },
    null,
    2
  )
);


let yarn_release = fs.readdirSync("./homeassistant-frontend/.yarn/releases/").filter(fn => fn.match(/yarn-\d.*\.cjs/) !== null)

const yarnrc = yaml.load(fs.readFileSync("./.yarnrc.yml", 'utf8'));
yarnrc.yarnPath = 'homeassistant-frontend/.yarn/releases/' + yarn_release[0]
fs.writeFileSync("./.yarnrc.yml", yaml.dump(yarnrc));