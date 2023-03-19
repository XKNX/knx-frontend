const { createKNXConfig } = require("./build-scripts/webpack.js");
const { isProdBuild, isStatsBuild } = require("./build-scripts/env.js");

module.exports = createKNXConfig({
  isProdBuild: isProdBuild(),
  isStatsBuild: isStatsBuild(),
  latestBuild: true,
});
