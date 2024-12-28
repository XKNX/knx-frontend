const fs = require("fs");
const path = require("path");
const paths = require("./paths.cjs");

const isTrue = (value) => value === "1" || value?.toLowerCase() === "true";
module.exports = {
  useRollup() {
    return isTrue(process.env.ROLLUP);
  },
  useWDS() {
    return isTrue(process.env.WDS);
  },
  isProdBuild() {
    return process.env.NODE_ENV === "production" || module.exports.isStatsBuild();
  },
  isStatsBuild() {
    return isTrue(process.env.STATS);
  },
  isTest() {
    return isTrue(process.env.IS_TEST);
  },
  isNetlify() {
    return isTrue(process.env.NETLIFY);
  },
  version() {
    const version = fs.readFileSync(path.resolve(paths.polymer_dir, "VERSION"), "utf8");
    if (!version) {
      throw Error("Version not found");
    }
    return version.trim();
  },
  isDevContainer() {
    return isTrue(process.env.DEV_CONTAINER);
  },
};
