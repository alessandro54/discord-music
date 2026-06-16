import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

await build({
    entryPoints: ['src/index.js'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: 'dist/index.js',
    format: 'esm',
    external: ['@discordjs/opus', 'ffmpeg-static'],
});

mkdirSync('dist/node_modules', { recursive: true });
cpSync('node_modules/@discordjs/opus', 'dist/node_modules/@discordjs/opus', { recursive: true });
cpSync('node_modules/ffmpeg-static', 'dist/node_modules/ffmpeg-static', { recursive: true });

console.log('Build complete.');
