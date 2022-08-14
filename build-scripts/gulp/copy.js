const gulp = require("gulp");
const paths = require("../paths");

gulp.task("copy-init-knx", () => {
    return gulp.src(paths.knx_initPath).pipe(gulp.dest(paths.knx_output_root));
});
