// Tasks to compress

import { constants } from "node:zlib";
import gulp from "gulp";
import brotli from "gulp-brotli";
import paths from "../paths.cjs";

const filesGlob = "*.{js,json,css,svg,xml}";
const brotliOptions = {
  skipLarger: true,
  params: {
    [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
  },
};

const compressModern = (rootDir, modernDir) =>
  gulp
    .src([`${modernDir}/**/${filesGlob}`, `${rootDir}/sw-modern.js`], {
      base: rootDir,
      allowEmpty: true,
    })
    .pipe(brotli(brotliOptions))
    .pipe(gulp.dest(rootDir));

const compressOther = (rootDir, modernDir) =>
  gulp
    .src(
      [
        `${rootDir}/**/${filesGlob}`,
        `!${modernDir}/**/${filesGlob}`,
        `!${rootDir}/{sw-modern,service_worker}.js`,
        `${rootDir}/{authorize,onboarding}.html`,
      ],
      { base: rootDir, allowEmpty: true },
    )
    .pipe(brotli(brotliOptions))
    .pipe(gulp.dest(rootDir));

const compressKnxModern = () => compressModern(paths.knx_output_root, paths.knx_output_latest);
const compressKnxOther = () => compressOther(paths.knx_output_root, paths.knx_output_latest);

gulp.task("compress-knx", gulp.parallel(compressKnxModern, compressKnxOther));
