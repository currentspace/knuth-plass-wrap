export const SAMPLES: Record<string, string> = {
  "Knuth on TeX":
    "The problem of breaking a paragraph into lines of approximately equal length has been a subject of study since the earliest days of printing. It is a surprisingly difficult problem to solve well, and the solutions used by most word processing systems are far from optimal. The approach used in TeX is based on a dynamic programming algorithm that considers all possible breakpoints simultaneously, rather than making greedy decisions one line at a time. This yields paragraphs with noticeably more even spacing throughout.",
  "On Typography":
    "Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed. The arrangement of type involves selecting typefaces, point sizes, line lengths, line spacing, and letter spacing, and adjusting the space between pairs of letters. Good typography establishes a strong visual hierarchy, provides a graphic balance to the page, and sets the overall tone of the product.",
  "Tricky Words":
    "Some text is particularly challenging because it contains very long words like internationalization or electroencephalography that can wreak havoc on line breaking algorithms, especially when the measure is narrow. Good algorithms handle these gracefully, sometimes accepting a loose early line to avoid catastrophic spacing later on in the paragraph.",
};
