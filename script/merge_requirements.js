const fs = require("fs");
const yaml = require('js-yaml');

let rawPackageCore = fs.readFileSync("./homeassistant-frontend/package.json");
let rawPackageKnx = fs.readFileSync("./package.json");


const packageCore = JSON.parse(rawPackageCore);
const packageKnx = JSON.parse(rawPackageKnx);

fs.writeFileSync(
  "./package.json",
  JSON.stringify(
    {
      ...packageKnx,
      resolutions: { ...packageCore.resolutions, ...packageKnx.resolutionsOverride },
      dependencies: { ...packageCore.dependencies, ...packageKnx.dependenciesOverride },
      devDependencies: { ...packageCore.devDependencies, ...packageKnx.devDependenciesOverride },
    },
    null,
    2
  )
);


let yarnRelease = fs.readdirSync("./homeassistant-frontend/.yarn/releases/").filter(fn => fn.match(/yarn-\d.*\.cjs/) !== null)

const yarnrc = yaml.load(fs.readFileSync("./.yarnrc.yml", 'utf8'));
yarnrc.yarnPath = 'homeassistant-frontend/.yarn/releases/' + yarnRelease[0]
fs.writeFileSync("./.yarnrc.yml", yaml.dump(yarnrc));