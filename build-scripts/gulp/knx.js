const gulp = require("gulp");

const env = require("../env");

require("./clean.js");
require("./gen-icons-json.js");
require("./webpack.js");
require("./compress.js");
require("./rollup.js");
require("./gather-static.js");
require("./translations-knx.js");

gulp.task(
  "develop-knx",
  gulp.series(
    async function setEnv() {
      process.env.NODE_ENV = "development";
    },
    "clean-knx",
    "gen-index-knx-dev",
    "generate-translations-knx",
    "webpack-watch-knx"
  )
);

gulp.task(
  "build-knx",
  gulp.series(
    async function setEnv() {
      process.env.NODE_ENV = "production";
    },
    "clean-knx",
    "ensure-knx-build-dir",
    "generate-translations-knx",
    "webpack-prod-knx",
    "gen-index-knx-prod",
    ...// Don't compress running tests
    (env.isTest() ? [] : ["compress-knx"])
  )
);
