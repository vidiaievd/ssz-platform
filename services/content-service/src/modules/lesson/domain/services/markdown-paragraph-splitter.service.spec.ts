import { MarkdownParagraphSplitterService } from './markdown-paragraph-splitter.service.js';

describe('MarkdownParagraphSplitterService', () => {
  it('splits on blank lines', () => {
    const result = MarkdownParagraphSplitterService.split('First paragraph.\n\nSecond paragraph.');
    expect(result).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('collapses multiple blank lines into a single split point', () => {
    const result = MarkdownParagraphSplitterService.split('First.\n\n\n\nSecond.');
    expect(result).toEqual(['First.', 'Second.']);
  });

  it('trims whitespace within each paragraph', () => {
    const result = MarkdownParagraphSplitterService.split('  First.  \n\n  Second.  ');
    expect(result).toEqual(['First.', 'Second.']);
  });

  it('drops empty paragraphs', () => {
    const result = MarkdownParagraphSplitterService.split('First.\n\n   \n\nSecond.');
    expect(result).toEqual(['First.', 'Second.']);
  });

  it('returns a single-element array for markdown with no blank lines', () => {
    const result = MarkdownParagraphSplitterService.split('Just one paragraph.');
    expect(result).toEqual(['Just one paragraph.']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(MarkdownParagraphSplitterService.split('')).toEqual([]);
    expect(MarkdownParagraphSplitterService.split('   \n  ')).toEqual([]);
  });
});
