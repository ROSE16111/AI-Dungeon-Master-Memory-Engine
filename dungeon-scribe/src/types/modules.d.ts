// src/types/modules.d.ts

declare module 'sbd' {
  export interface Options {
    newline_boundaries?: boolean;
  }
  export function sentences(text: string, options?: Options): string[];
}

declare module 'pdf-parse' {
  export interface PDFParseResult {
    text: string;
    // Other fields exist, but only the used ones are declared here
  }
  const pdf: (data: Buffer | Uint8Array) => Promise<PDFParseResult>;
  export default pdf;
}

// Minimal type definitions for @node-rs/jieba (includes extract)
declare module '@node-rs/jieba' {
  export function extract(
    text: string,
    topN?: number
  ): Array<{ keyword: string; weight: number }>;
  // Reserved: add cut/tag/etc. later if needed
}
