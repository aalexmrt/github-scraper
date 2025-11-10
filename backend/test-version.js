const path = require('path');
const fs = require('fs');

// Simulate __dirname being /app/dist/src (as it would be in Docker)
const __dirname = path.resolve('dist/src');
const packageJsonPath = path.join(__dirname, '../../package.json');

console.log('__dirname:', __dirname);
console.log('package.json path:', packageJsonPath);
console.log('Exists:', fs.existsSync(packageJsonPath));

if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  console.log('✅ Success! Version:', pkg.version);
} else {
  console.log('❌ File not found');
}
