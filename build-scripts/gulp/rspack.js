// Tasks to run rspack.

import log from "fancy-log";
import fs from "fs";
import gulp from "gulp";
import rspack from "@rspack/core";
import { RspackDevServer } from "@rspack/dev-server";
import paths from "../paths.cjs";
import { createKNXConfig } from "../rspack.cjs";

const bothBuilds = (createConfigFunc, params) => [
  createConfigFunc({ ...params, latestBuild: true }),
  createConfigFunc({ ...params, latestBuild: false }),
];

const isWsl =
  fs.existsSync("/proc/version") &&
  fs.readFileSync("/proc/version", "utf-8").toLocaleLowerCase().includes("microsoft");

gulp.task("ensure-knx-build-dir", (done) => {
  if (!fs.existsSync(paths.knx_output_root)) {
    fs.mkdirSync(paths.knx_output_root, { recursive: true });
  }
  if (!fs.existsSync(paths.app_output_root)) {
    fs.mkdirSync(paths.app_output_root, { recursive: true });
  }
  done();
});

const doneHandler = (done) => (err, stats) => {
  if (err) {
    log.error(err.stack || err);
    if (err.details) {
      log.error(err.details);
    }
    return;
  }

  if (stats.hasErrors() || stats.hasWarnings()) {
    // eslint-disable-next-line no-console
    console.log(stats.toString("minimal"));
  }

  log(`Build done @ ${new Date().toLocaleTimeString()}`);

  if (done) {
    done();
  }
};

const prodBuild = (conf) =>
  new Promise((resolve) => {
    rspack(
      conf,
      // Resolve promise when done. Because we pass a callback, rspack closes itself
      doneHandler(resolve),
    );
  });

gulp.task("rspack-watch-knx", () => {
  // This command will run forever because we don't close compiler
  rspack(
    createKNXConfig({
      isProdBuild: false,
      latestBuild: true,
    }),
  ).watch({ ignored: /build/, poll: isWsl }, doneHandler());
});

gulp.task("rspack-prod-knx", () =>
  prodBuild(
    bothBuilds(createKNXConfig, {
      isProdBuild: true,
    }),
  ),
);
