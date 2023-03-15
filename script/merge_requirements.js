const fs = require("fs");

let rawcore = fs.readFileSync("./homeassistant-frontend/package.json");
let rawknx = fs.readFileSync("./package.json");

const core = JSON.parse(rawcore);
const knx = JSON.parse(rawknx);

fs.writeFileSync(
  "./package.json",
  JSON.stringify(
    {
      ...knx,
      resolutions: { ...core.resolutions, ...knx.resolutionsOverride },
      dependencies: { ...core.dependencies, ...knx.dependenciesOverride },
      devDependencies: {
        ...core.devDependencies,
        ...knx.devDependenciesOverride,
      },
    },
    null,
    2
  )
);
