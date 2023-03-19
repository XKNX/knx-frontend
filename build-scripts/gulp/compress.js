// Tasks to compress
/* eslint @typescript-eslint/no-var-requires: "off" */

const gulp = require("gulp");
const zopfli = require("gulp-zopfli-green");
const path = require("path");
const paths = require("../paths");

const zopfliOptions = { threshold: 150 };

gulp.task("compress-knx", () =>
  gulp
    .src(path.resolve(paths.knx_output_root, "**/*.js"))
    .pipe(zopfli(zopfliOptions))
    .pipe(gulp.dest(paths.knx_output_root))
);
