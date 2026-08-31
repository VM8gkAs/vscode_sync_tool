import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lifecycleNames = ['preinstall', 'install', 'postinstall'];
const configured = lifecycleNames.filter(name => Object.hasOwn(packageJson.scripts || {}, name));
const hiddenFiles = lifecycleNames
    .map(name => `${name}.js`)
    .filter(name => fs.existsSync(path.join(root, name)));
const evalScripts = Object.entries(packageJson.scripts || {})
    .filter(([, command]) => /(?:^|\s)(?:node\s+-e|eval\s*\()/u.test(String(command)))
    .map(([name]) => name);

if (configured.length || hiddenFiles.length || evalScripts.length) {
    throw new Error(`Lifecycle/hidden execution policy violation: ${[
        ...configured.map(name => `script:${name}`),
        ...hiddenFiles.map(name => `file:${name}`),
        ...evalScripts.map(name => `eval:${name}`)
    ].join(', ')}`);
}
