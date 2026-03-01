export interface Preset {
  name: string;
  textKey: string;
  fontIdx: number;
  lineWidthPx: number;
  weight: number;
  fontSize: number;
  lhMult: number;
  pngPath: string;
}

export const PRESETS: Preset[] = [
  {
    name: "Classic Knuth",
    textKey: "Knuth on TeX",
    fontIdx: 0,
    lineWidthPx: 420,
    weight: 400,
    fontSize: 18,
    lhMult: 1.6,
    pngPath: "/presets/preset-1.png",
  },
  {
    name: "Narrow Sans",
    textKey: "On Typography",
    fontIdx: 1,
    lineWidthPx: 240,
    weight: 400,
    fontSize: 15,
    lhMult: 1.5,
    pngPath: "/presets/preset-2.png",
  },
  {
    name: "Tricky Long Words",
    textKey: "Tricky Words",
    fontIdx: 6,
    lineWidthPx: 337,
    weight: 400,
    fontSize: 17,
    lhMult: 1.6,
    pngPath: "/presets/preset-3.png",
  },
  {
    name: "Heavy Garamond",
    textKey: "Knuth on TeX",
    fontIdx: 4,
    lineWidthPx: 380,
    weight: 700,
    fontSize: 19,
    lhMult: 1.7,
    pngPath: "/presets/preset-4.png",
  },
  {
    name: "Tight Mono",
    textKey: "On Typography",
    fontIdx: 10,
    lineWidthPx: 350,
    weight: 400,
    fontSize: 14,
    lhMult: 1.4,
    pngPath: "/presets/preset-5.png",
  },
  {
    name: "Wide Light",
    textKey: "Tricky Words",
    fontIdx: 7,
    lineWidthPx: 500,
    weight: 300,
    fontSize: 20,
    lhMult: 1.8,
    pngPath: "/presets/preset-6.png",
  },
];
