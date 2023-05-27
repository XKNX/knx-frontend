// Tasks to generate entry HTML

import fs from "fs-extra";
import gulp from "gulp";
import path from "path";
import paths from "../paths.cjs";


gulp.task("gen-index-knx-dev", async () => {
  writeKNXEntrypoint(
    `${paths.knx_publicPath}/frontend_latest/entrypoint-dev.js`,
    `${paths.knx_publicPath}/frontend_es5/entrypoint-dev.js`,
    "True"
  );
});

gulp.task("gen-index-knx-prod", async () => {
  const latestManifest = fs.readJsonSync(path.resolve(paths.knx_output_latest, "manifest.json"));
  const es5Manifest = fs.readJsonSync(path.resolve(paths.knx_output_es5, "manifest.json"));
  console.error(latestManifest)
  writeKNXEntrypoint(latestManifest["entrypoint.js"], es5Manifest["entrypoint.js"], "False");
});

function writeKNXEntrypoint(latestEntrypoint, es5Entrypoint, isDev) {
  const fileElements = latestEntrypoint.split("-");
  const fileHash = fileElements[1].split(".")[0];
  fs.mkdirSync(paths.knx_output_root, { recursive: true });
  // Safari 12 and below does not have a compliant ES2015 implementation of template literals, so we ship ES5
  fs.writeFileSync(
    path.resolve(paths.knx_output_root, `entrypoint-${fileHash}.js`),
    `
function loadES5() {
  var el = document.createElement('script');
  el.src = '${es5Entrypoint}';
  document.body.appendChild(el);
}
if (/.*Version\\/(?:11|12)(?:\\.\\d+)*.*Safari\\//.test(navigator.userAgent)) {
    loadES5();
} else {
  try {
    new Function("import('${latestEntrypoint}')")();
  } catch (err) {
    loadES5();
  }
}
  `,
    { encoding: "utf-8" }
  );
  fs.writeFileSync(
    path.resolve(paths.knx_output_root, "constants.py"),
    `FILE_HASH = '${fileHash}'
DEV = ${isDev}
`,
    { encoding: "utf-8" }
  );
  fs.copyFileSync(
    path.resolve(paths.src_dir, `__init__.py`),
    path.resolve(paths.knx_output_root, `__init__.py`)
  );
  fs.writeFileSync(
    path.resolve(paths.knx_output_root, "py.typed"),
    "",
  );
}
