/* eslint @typescript-eslint/no-var-requires: "off" */
const del = import("del");
const gulp = require("gulp");
const paths = require("../paths");

gulp.task("clean-knx", async () =>
    (await del).deleteSync([paths.knx_output_root, paths.build_dir])
);
