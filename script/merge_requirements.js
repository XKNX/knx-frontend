import fs from "fs";

const rawPackageCore = fs.readFileSync("./homeassistant-frontend/package.json");
const rawPackageKnx = fs.readFileSync("./package.json");

const packageCore = JSON.parse(rawPackageCore);
const packageKnx = JSON.parse(rawPackageKnx);

const _replaceYarnPath = (path) => path.replace(/\.yarn\//g, "homeassistant-frontend/.yarn/");

const subdir_dependencies = Object.fromEntries(
  Object.entries(packageCore.dependencies).map(([key, value]) => [key, _replaceYarnPath(value)]),
);

const subdir_dev_dependencies = Object.fromEntries(
  Object.entries(packageCore.devDependencies).map(([key, value]) => [key, _replaceYarnPath(value)]),
);

const subdir_resolutions = Object.fromEntries(
  Object.entries(packageCore.resolutions).map(([key, value]) => [key, _replaceYarnPath(value)]),
);

fs.writeFileSync(
  "./package.json",
  JSON.stringify(
    {
      ...packageKnx,
      dependencies: { ...subdir_dependencies, ...packageKnx.dependenciesOverride },
      devDependencies: {
        ...subdir_dev_dependencies,
        ...packageKnx.devDependenciesOverride,
      },
      resolutions: { ...subdir_resolutions, ...packageKnx.resolutionsOverride },
      packageManager: packageCore.packageManager,
    },
    null,
    2,
  ),
);

const yarnRcCore = fs.readFileSync("./homeassistant-frontend/.yarnrc.yml", "utf8");
const yarnRcKnx = yarnRcCore.replace(/\.yarn\//g, "homeassistant-frontend/.yarn/");
fs.writeFileSync("./.yarnrc.yml", yarnRcKnx);
