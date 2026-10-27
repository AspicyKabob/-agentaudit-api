const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-status');
fs.mkdirSync(output, { recursive: true });
for (const [source, target] of [['status.html', 'index.html'], ['status.js', 'status.js']]) {
  fs.copyFileSync(path.join(root, 'website', source), path.join(output, target));
}
const files = fs.readdirSync(output);
if (files.length !== 2 || !files.includes('index.html') || !files.includes('status.js')) {
  throw new Error('Status bundle must contain only index.html and status.js. Use a clean build directory.');
}
console.log('Built standalone status page: index.html and status.js only.');
