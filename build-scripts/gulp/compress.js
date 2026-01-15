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

const compressModern = (rootDir, modernDir, compress) =>
  gulp
    .src([`${modernDir}/**/${filesGlob}`, `${rootDir}/sw-modern.js`], {
      base: rootDir,
      allowEmpty: true,
    })
    .pipe(compress === "zopfli" ? zopfli(zopfliOptions) : brotli(brotliOptions))
    .pipe(gulp.dest(rootDir));

const compressOther = (rootDir, modernDir, compress) =>
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
    .pipe(compress === "zopfli" ? zopfli(zopfliOptions) : brotli(brotliOptions))
    .pipe(gulp.dest(rootDir));

const compressKnxModernBrotli = () => compressModern(paths.knx_output_root, paths.knx_output_latest, "brotli");
const compressKnxModernZopfli = () => compressModern(paths.knx_output_root, paths.knx_output_latest, "zopfli");
const compressKnxOtherBrotli = () => compressOther(paths.knx_output_root, paths.knx_output_latest, "brotli");
const compressKnxOtherZopfli = () => compressOther(paths.knx_output_root, paths.knx_output_latest, "zopfli");

gulp.task(
  "compress-knx",
  gulp.parallel(
    compressKnxModernBrotli,
    compressKnxModernZopfli,
    compressKnxOtherBrotli,
    compressKnxOtherZopfli
  )
);
