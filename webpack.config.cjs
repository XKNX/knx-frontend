/* eslint-disable @typescript-eslint/no-var-requires */
// Needs to remain CommonJS until eslint-import-resolver-webpack supports ES modules
const { createKNXConfig } = require("./build-scripts/webpack.cjs");
const { isProdBuild, isStatsBuild } = require("./build-scripts/env.cjs");

module.exports = createKNXConfig({
  isProdBuild: isProdBuild(),
  isStatsBuild: isStatsBuild(),
  latestBuild: true,
});
