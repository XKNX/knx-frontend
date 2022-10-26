const gulp = require("gulp");
const del = require("del");
require("./rollup.js");

gulp.task("cleanup", (task) => {
  del.sync(["./homeassistant-frontend/build/**", "./homeassistant-frontend/build"]);
  del.sync(["./knx_frontend/*.js", "./knx_frontend/*.json", "./knx_frontend/*.gz"]);
  task();
});

gulp.task("common", gulp.series("cleanup"));
