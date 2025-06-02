const path = require("path");

module.exports = {
  root_dir: path.resolve(__dirname, ".."),

  src_dir: path.resolve(__dirname, "../src"),

  build_dir: path.resolve(__dirname, "../knx_frontend"),
  upstream_build_dir: path.resolve(__dirname, "../homeassistant-frontend/build"),
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

  translations_src: path.resolve(__dirname, "../homeassistant-frontend/src/translations"),
};
