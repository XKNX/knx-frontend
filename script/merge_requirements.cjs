const fs = require("fs");

const rawPackageCore = fs.readFileSync("./homeassistant-frontend/package.json");
const rawPackageKnx = fs.readFileSync("./package.json");

const packageCore = JSON.parse(rawPackageCore);
const packageKnx = JSON.parse(rawPackageKnx);

fs.writeFileSync(
  "./package.json",
  JSON.stringify(
    {
      ...packageKnx,
      resolutions: { ...packageCore.resolutions, ...packageKnx.resolutionsOverride },
      dependencies: { ...packageCore.dependencies, ...packageKnx.dependenciesOverride },
      devDependencies: {
        ...packageCore.devDependencies,
        ...packageKnx.devDependenciesOverride,
      },
    },
    null,
    2
  )
);

const yarnRcCore = fs.readFileSync("./homeassistant-frontend/.yarnrc.yml", 'utf8');
const yarnRcKnx = yarnRcCore.replace(/\.yarn\//g, "homeassistant-frontend/.yarn/")
fs.writeFileSync("./.yarnrc.yml", yarnRcKnx);
