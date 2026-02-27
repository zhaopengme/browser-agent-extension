/**
 * Markdown conversion using Turndown
 */

import type { ContentResponse } from '@/types/message';

const MAX_MARKDOWN_LENGTH = 500000;

export async function convertToMarkdown(selector?: string): Promise<ContentResponse<{ markdown: string; title: string; url: string; truncated?: boolean }>> {
  try {
    const TurndownModule = await import('turndown');
    const TurndownService = TurndownModule.default || TurndownModule;
    if (!TurndownService) {
      throw new Error('Failed to load Turndown library');
    }

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
    });

    turndownService.remove(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside']);

    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const markdown = turndownService.turndown(element.innerHTML);

    let cleanedMarkdown = markdown
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    let truncated = false;
    if (cleanedMarkdown.length > MAX_MARKDOWN_LENGTH) {
      cleanedMarkdown = cleanedMarkdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n... (content truncated)';
      truncated = true;
    }

    return {
      success: true,
      data: {
        markdown: cleanedMarkdown,
        title: document.title,
        url: window.location.href,
        truncated,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert to markdown',
    };
  }
}
