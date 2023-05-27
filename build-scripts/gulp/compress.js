// Tasks to compress

import gulp from "gulp";
import zopfli from "gulp-zopfli-green";
import path from "path";
import paths from "../paths.cjs";

const zopfliOptions = { threshold: 150 };

gulp.task("compress-knx", () =>
  gulp
    .src(path.resolve(paths.knx_output_root, "**/*.js"))
    .pipe(zopfli(zopfliOptions))
    .pipe(gulp.dest(paths.knx_output_root))
);
