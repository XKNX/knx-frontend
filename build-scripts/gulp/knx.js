import gulp from "gulp";
import env from "../env.cjs";

import "./clean.js";
import "./compress.js";
import "./entry-html.js";
import "./gen-icons-json.js";
import "./rspack.js";
import "./translations.js";
import "./locale-data.js";

gulp.task(
  "develop-knx",
  gulp.series(
    async () => {
      process.env.NODE_ENV = "development";
    },
    "clean-knx",
    "gen-icons-json",
    "build-translations",
    "build-locale-data",
    "gen-index-knx-dev",
    "rspack-watch-knx",
  ),
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
    "build-translations",
    "build-locale-data",
    "rspack-prod-knx",
    "gen-index-knx-prod",
    ...// Don't compress running tests
    (env.isTest() ? [] : ["compress-knx"]),
  ),
);
