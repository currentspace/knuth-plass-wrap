export interface Font {
  label: string;
  css: string;
  check: string;
  family: string;
  size: number;
  system: boolean;
  weight?: number;
  lineHeight?: number;
  fontUrl?: string;
  fontUrls?: Record<number, string>;
}

export interface Line {
  text: string;
  segments: string[];
  words: string[];
  widths: number[];
  boxW: number;
  spaceWidth: number;
  last: boolean;
}

export interface HzLine extends Line {
  wdth: number;
}

export interface WdthRange {
  min: number;
  max: number;
}
