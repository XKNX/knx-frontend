// Tasks to compress

import { constants } from "node:zlib";
import gulp from "gulp";
import brotli from "gulp-brotli";
import zopfli from "gulp-zopfli-green";
import paths from "../paths.cjs";

const filesGlob = "*.{js,json,css,svg,xml}";
const brotliOptions = {
  skipLarger: true,
  params: {
    [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
  },
};
const zopfliOptions = { threshold: 150 };

const compressDistBrotli = (rootDir, modernDir) =>
  gulp
    .src([`${modernDir}/**/${filesGlob}`, `${rootDir}/sw-modern.js`], {
      base: rootDir,
      allowEmpty: true,
    })
    .pipe(brotli(brotliOptions))
    .pipe(gulp.dest(rootDir));

const compressDistZopfli = (rootDir, modernDir) =>
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
    .pipe(zopfli(zopfliOptions))
    .pipe(gulp.dest(rootDir));

const compressKnxBrotli = () => compressDistBrotli(paths.knx_output_root, paths.knx_output_latest);
const compressKnxZopfli = () => compressDistZopfli(paths.knx_output_root, paths.knx_output_latest);

gulp.task("compress-knx", gulp.parallel(compressKnxBrotli, compressKnxZopfli));
