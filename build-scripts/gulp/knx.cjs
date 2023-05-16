/* eslint @typescript-eslint/no-var-requires: "off", import/extensions: "off" */
const gulp = require("gulp");

const env = require("../env.cjs");

require("./clean.cjs");
require("./webpack.cjs");
require("./compress.cjs");
require("./entry-html.cjs");

gulp.task(
  "develop-knx",
  gulp.series(
    async () => {
      process.env.NODE_ENV = "development";
    },
    "clean-knx",
    "gen-index-knx-dev",
    "webpack-watch-knx"
  )
);

gulp.task(
  "build-knx",
  gulp.series(
    async () => {
      process.env.NODE_ENV = "production";
    },
    "clean-knx",
    "ensure-knx-build-dir",
    "webpack-prod-knx",
    "gen-index-knx-prod",
    ...// Don't compress running tests
    (env.isTest() ? [] : ["compress-knx"])
  )
);
