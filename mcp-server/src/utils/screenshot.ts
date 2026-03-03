import { mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger.js';

const SCREENSHOT_DIR = join(tmpdir(), 'browser-agent-screenshots');
const MAX_SCREENSHOTS = 50;
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

let dirEnsured = false;

function ensureDir(): void {
  if (dirEnsured) return;
  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    dirEnsured = true;
  } catch (err) {
    logger.error('Screenshot', `Failed to create directory: ${SCREENSHOT_DIR}`, err);
    throw err;
  }
}

export function saveScreenshot(base64Data: string, format: string): string {
  ensureDir();

  const ext = format === 'jpeg' ? 'jpg' : format;
  const filename = `screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filepath = join(SCREENSHOT_DIR, filename);

  const buffer = Buffer.from(base64Data, 'base64');
  writeFileSync(filepath, buffer);

  logger.info('Screenshot', `Saved: ${filepath} (${buffer.length} bytes)`);

  cleanupOldScreenshots();

  return filepath;
}

function cleanupOldScreenshots(): void {
  try {
    const files = readdirSync(SCREENSHOT_DIR)
      .filter(f => f.startsWith('screenshot-'))
      .map(f => ({
        name: f,
        path: join(SCREENSHOT_DIR, f),
        mtime: statSync(join(SCREENSHOT_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    const now = Date.now();
    for (let i = 0; i < files.length; i++) {
      if (i >= MAX_SCREENSHOTS || (now - files[i].mtime) > MAX_AGE_MS) {
        try {
          unlinkSync(files[i].path);
        } catch {
          // ignore individual file deletion errors
        }
      }
    }
  } catch {
    // ignore cleanup errors
  }
}
