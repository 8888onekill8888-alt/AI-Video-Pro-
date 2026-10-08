export interface StoryChunk {
  id: string;
  index: number;
  chapter?: string;
  text: string;
  tokenEstimate: number;
}

export function detectChapters(text: string): Array<{ title: string; start: number; end: number }> {
  const pattern = /^(?:chapter|part|section|prologue|epilogue)\s+[^\n]{0,100}$/gim;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return [{ title: 'Document', start: 0, end: text.length }];
  const chapters: Array<{ title: string; start: number; end: number }> = [];
  if (matches[0]?.index) chapters.push({ title: 'Opening', start: 0, end: matches[0].index });
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const next = matches[index + 1]?.index ?? text.length;
    chapters.push({ title: match[0].trim(), start, end: next });
  });
  return chapters;
}

export function chunkDocument(text: string, maxCharacters = 8_000, overlapCharacters = 400): StoryChunk[] {
  const chapters = detectChapters(text);
  const chunks: StoryChunk[] = [];
  for (const chapter of chapters) {
    const chapterText = text.slice(chapter.start, chapter.end).trim();
    let cursor = 0;
    while (cursor < chapterText.length) {
      let end = Math.min(cursor + maxCharacters, chapterText.length);
      if (end < chapterText.length) {
        const boundary = chapterText.lastIndexOf('\n', end);
        if (boundary > cursor + Math.floor(maxCharacters * 0.65)) end = boundary;
      }
      const content = chapterText.slice(cursor, end).trim();
      if (content) chunks.push({
        id: `chunk-${chunks.length + 1}`,
        index: chunks.length,
        chapter: chapter.title,
        text: content,
        tokenEstimate: Math.ceil(content.length / 4),
      });
      if (end >= chapterText.length) break;
      cursor = Math.max(end - overlapCharacters, cursor + 1);
    }
  }
  return chunks;
}

export function retrieveContext(chunks: StoryChunk[], query: string, limit = 5): StoryChunk[] {
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  if (!terms.length) return chunks.slice(0, limit);
  return chunks.map((chunk) => {
    const body = chunk.text.toLowerCase();
    const score = terms.reduce((total, term) => total + (body.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gu'))?.length ?? 0), 0);
    return { chunk, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index).slice(0, limit).map((item) => item.chunk);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}