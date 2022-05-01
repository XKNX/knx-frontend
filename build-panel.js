const concat = require('concat');

(async function build() {
  const files = [
    './dist/knx-panel/runtime.js',
    './dist/knx-panel/polyfills.js',
    './dist/knx-panel/main.js'
  ];

  await concat(files, 'xknx_custom_panel/knx-panel.js');
})();
