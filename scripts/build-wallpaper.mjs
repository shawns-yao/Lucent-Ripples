import fs from 'node:fs/promises';
import { createStandaloneHtml } from './build-standalone.mjs';

const directory = 'artifacts/wallpaper-engine';
const project = JSON.parse(await fs.readFile('Config/wallpaper-engine.json', 'utf8'));
const html = await createStandaloneHtml({ wallpaper: true });
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(directory + '/index.html', html);
try {
  await fs.copyFile('Image/figures/wallpaper-preview.jpg', directory + '/preview.jpg');
  project.preview = 'preview.jpg';
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await fs.writeFile(directory + '/project.json', JSON.stringify(project, null, 2) + '\n');
console.log('Wallpaper Engine project:', directory, Buffer.byteLength(html), 'bytes');
