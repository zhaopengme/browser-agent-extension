import { mkdir, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger.js';

const SCREENSHOT_DIR = join(tmpdir(), 'browser-agent-screenshots');
const MAX_SCREENSHOTS = 50;
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

type ImageFormat = 'png' | 'jpeg' | 'webp';

export async function saveScreenshot(base64Data: string, format: ImageFormat): Promise<string> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const ext = format === 'jpeg' ? 'jpg' : format;
  const filename = `screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filepath = join(SCREENSHOT_DIR, filename);

  const buffer = Buffer.from(base64Data, 'base64');
  await writeFile(filepath, buffer);

  logger.info('Screenshot', `Saved: ${filepath} (${buffer.length} bytes)`);

  // fire-and-forget cleanup
  cleanupOldScreenshots().catch(() => {});

  return filepath;
}

async function cleanupOldScreenshots(): Promise<void> {
  const entries = await readdir(SCREENSHOT_DIR);
  const files = await Promise.all(
    entries
      .filter(f => f.startsWith('screenshot-'))
      .map(async f => {
        const path = join(SCREENSHOT_DIR, f);
        const s = await stat(path);
        return { name: f, path, mtime: s.mtimeMs };
      }),
  );
  files.sort((a, b) => b.mtime - a.mtime);

  const now = Date.now();
  let deletedCount = 0;
  for (let i = 0; i < files.length; i++) {
    if (i >= MAX_SCREENSHOTS || (now - files[i].mtime) > MAX_AGE_MS) {
      try {
        await unlink(files[i].path);
        deletedCount++;
      } catch {
        // ignore individual file deletion errors
      }
    }
  }

  if (deletedCount > 0) {
    logger.debug('Screenshot', `Cleanup: removed ${deletedCount} files, ${files.length - deletedCount} remaining`);
  }
}
