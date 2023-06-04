import fs from "fs";

const rawPackageCore = fs.readFileSync("./homeassistant-frontend/package.json");
const rawPackageKnx = fs.readFileSync("./package.json");

const packageCore = JSON.parse(rawPackageCore);
const packageKnx = JSON.parse(rawPackageKnx);

const subdir_resolutions = Object.fromEntries(
  Object.entries(packageCore.resolutions).map(([key, value]) => [
    key,
    value.replace(/#\.\//g, "#./homeassistant-frontend/"),
  ])
);

fs.writeFileSync(
  "./package.json",
  JSON.stringify(
    {
      ...packageKnx,
      dependencies: { ...packageCore.dependencies, ...packageKnx.dependenciesOverride },
      devDependencies: {
        ...packageCore.devDependencies,
        ...packageKnx.devDependenciesOverride,
      },
      resolutions: { ...subdir_resolutions, ...packageKnx.resolutionsOverride },
      packageManager: packageCore.packageManager,
    },
    null,
    2
  )
);

const yarnRcCore = fs.readFileSync("./homeassistant-frontend/.yarnrc.yml", "utf8");
const yarnRcKnx = yarnRcCore.replace(/\.yarn\//g, "homeassistant-frontend/.yarn/");
fs.writeFileSync("./.yarnrc.yml", yarnRcKnx);
