const fs = require('fs');
const path = require('path');

const src = path.join(process.cwd(), 'website');
const dest = path.join(process.cwd(), 'dist', 'website');

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
  console.log('Removed old dist/website');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(src, dest);
console.log('Copied website to dist/website');
