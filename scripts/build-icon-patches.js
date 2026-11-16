// Regenerates icon-patches.json from api/_icons.js. Run: node scripts/build-icon-patches.js
// The patch swaps the landmarks drawn under each province's flag on the homepage train line
// (the elevFor() function added by flag-patches.json). SK, AB and MB keep the grain elevator.
const fs = require('fs');
const path = require('path');
const { ICONS } = require('../api/_icons');
const FN = {};
for (const [code, [top, shapes]] of Object.entries(ICONS)) FN[code] = [top, shapes];
const patches = [{
  name: 'regional-icons',
  find: 'function provCode(p){',
  replace: '/* regional landmarks (Nov 2026) */Object.assign(FN,' + JSON.stringify(FN) + ');function provCode(p){',
}];
fs.writeFileSync(path.join(__dirname, '..', 'icon-patches.json'), JSON.stringify(patches, null, 1) + '\n');
console.log('icon-patches.json written:', Object.keys(FN).join(', '));
