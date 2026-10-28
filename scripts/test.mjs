import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const scope = process.argv[2] ?? 'all';
const directories = scope === 'all' ? ['unit', 'integration'] : [scope];
const files = [];
for (const directory of directories) {
  for (const entry of await readdir(`tests/${directory}`)) {
    if (entry.endsWith('.test.ts')) files.push(`tests/${directory}/${entry}`);
  }
}
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files.sort()], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', error => { console.error(error); process.exitCode = 1; });
