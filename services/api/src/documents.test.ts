import { describe, expect, it } from 'vitest';
import { parseDocument } from './documents.js';
import { chunkDocument, retrieveContext } from '@storyflix/shared';

describe('document handling', () => {
  it('parses text, detects chapters, chunks and retrieves relevant context', async () => {
    const text = 'Chapter 1\nMara keeps the lighthouse lit. The sea is quiet.\n\nChapter 2\nEli finds the letter and returns to the shore.';
    const result = await parseDocument('story.txt', 'text/plain', Buffer.from(text));
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.summaries[0]?.summary).toContain('Mara');
    expect(retrieveContext(result.chunks, 'lighthouse')).toHaveLength(1);
  });

  it('keeps chunks below the configured maximum and overlaps adjacent context', () => {
    const chunks = chunkDocument(`Opening\n${'A quiet shore.\n'.repeat(1_200)}`, 2_000, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 2_000)).toBe(true);
    expect(chunks[1]?.text.slice(0, 100)).toBe(chunks[0]?.text.slice(-100));
  });
});