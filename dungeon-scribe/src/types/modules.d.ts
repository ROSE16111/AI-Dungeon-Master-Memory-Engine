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
    // 还有很多字段，这里只声明你会用到的
  }
  const pdf: (data: Buffer | Uint8Array) => Promise<PDFParseResult>;
  export default pdf;
}

// @node-rs/jieba 的简易类型（包含 extract）
declare module '@node-rs/jieba' {
  export function extract(
    text: string,
    topN?: number
  ): Array<{ keyword: string; weight: number }>;
  // 预留：需要再用时可加 cut/tag 等
}
