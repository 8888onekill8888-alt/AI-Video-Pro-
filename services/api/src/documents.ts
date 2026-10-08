import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { chunkDocument, detectChapters } from '@storyflix/shared';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx']);

export interface ParsedDocument {
  filename: string;
  text: string;
  characterCount: number;
  chapters: Array<{ title: string; start: number; end: number }>;
  chunks: ReturnType<typeof chunkDocument>;
  summaries: Array<{ chapter: string; summary: string }>;
}

export async function parseDocument(filename: string, mimeType: string, bytes: Buffer): Promise<ParsedDocument> {
  if (bytes.length === 0) throw Object.assign(new Error('The uploaded document is empty'), { statusCode: 400 });
  if (bytes.length > MAX_DOCUMENT_BYTES) throw Object.assign(new Error('Documents must be 25 MB or smaller'), { statusCode: 413 });
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension)) throw Object.assign(new Error('Supported document formats: TXT, Markdown, PDF and DOCX'), { statusCode: 415 });
  let text: string;
  if (extension === '.pdf' || mimeType === 'application/pdf') {
    const parsed = await pdfParse(bytes);
    text = parsed.text;
  } else if (extension === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const parsed = await mammoth.extractRawText({ buffer: bytes });
    text = parsed.value;
  } else {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  text = text.replace(/\r\n?/g, '\n').replace(/[\t\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
  if (!text) throw Object.assign(new Error('No readable text was found in the document'), { statusCode: 422 });
  const chapters = detectChapters(text);
  const chunks = chunkDocument(text);
  const summaries = chapters.map((chapter) => {
    const content = text.slice(chapter.start, chapter.end).trim();
    const firstSentences = content.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3).join(' ');
    return { chapter: chapter.title, summary: firstSentences.slice(0, 600) };
  });
  return { filename, text, characterCount: text.length, chapters, chunks, summaries };
}

export const documentUploadLimit = MAX_DOCUMENT_BYTES;