/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");

module.exports = {
  polymer_dir: path.resolve(__dirname, ".."),

  build_dir: path.resolve(__dirname, "../knx_frontend"),
  app_output_root: path.resolve(__dirname, "../knx_frontend"),
  app_output_static: path.resolve(__dirname, "../knx_frontend/static"),
  app_output_latest: path.resolve(__dirname, "../knx_frontend/frontend_latest"),
  app_output_es5: path.resolve(__dirname, "../knx_frontend/frontend_es5"),

  knx_dir: path.resolve(__dirname, ".."),
  knx_output_root: path.resolve(__dirname, "../knx_frontend"),
  knx_output_static: path.resolve(__dirname, "../knx_frontend/static"),
  knx_output_latest: path.resolve(__dirname, "../knx_frontend/frontend_latest"),
  knx_output_es5: path.resolve(__dirname, "../knx_frontend/frontend_es5"),
  knx_publicPath: "/knx_static",

  translations_src: path.resolve(__dirname, "../src/translations"),
};
