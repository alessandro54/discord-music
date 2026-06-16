import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

await build({
    entryPoints: ['src/index.js'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/index.js',
    format: 'esm',
    external: ['@discordjs/opus', 'ffmpeg-static', '@snazzah/davey', '@snazzah/davey-linux-x64-musl', '@snazzah/davey-linux-x64-gnu'],
    banner: {
        js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
});

const natives = [
    '@discordjs/opus',
    'ffmpeg-static',
    '@snazzah/davey',
    '@snazzah/davey-linux-x64-musl',
    '@snazzah/davey-linux-x64-gnu',
];

mkdirSync('dist/node_modules', { recursive: true });
for (const pkg of natives) {
    const src = `node_modules/${pkg}`;
    try {
        cpSync(src, `dist/node_modules/${pkg}`, { recursive: true });
    } catch {
        // package not installed on this platform, skip
    }
}

console.log('Build complete.');
