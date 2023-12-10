/* eslint @typescript-eslint/no-var-requires: "off", import/extensions: "off" */
import gulp from "gulp";
import env from "../env.cjs";

import "./clean.js";
import "./webpack.js";
import "./compress.js";
import "./entry-html.js";
import "./gen-icons-json.js";

gulp.task(
  "develop-knx",
  gulp.series(
    async () => {
      process.env.NODE_ENV = "development";
    },
    "clean-knx",
    "gen-icons-json",
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
    "gen-icons-json",
    "webpack-prod-knx",
    "gen-index-knx-prod",
    ...// Don't compress running tests
    (env.isTest() ? [] : ["compress-knx"])
  )
);
