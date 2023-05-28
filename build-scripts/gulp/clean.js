import { deleteSync } from "del";
import gulp from "gulp";
import paths from "../paths.cjs";

gulp.task("clean-knx", async () =>
    deleteSync([paths.knx_output_root, paths.build_dir])
);
