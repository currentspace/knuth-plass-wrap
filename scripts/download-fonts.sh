#!/bin/bash
# Download variable font TTFs from Google Fonts GitHub repo
set -e
DIR="$(cd "$(dirname "$0")/../fonts" && pwd)"
mkdir -p "$DIR"

BASE="https://github.com/google/fonts/raw/main"

declare -A FONTS
FONTS[Literata]="ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf"
FONTS[SourceSans3]="ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf"
FONTS[Inter]="ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
FONTS[EBGaramond]="ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf"
FONTS[Lora]="ofl/lora/Lora%5Bwght%5D.ttf"
FONTS[NotoSans]="ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf"
FONTS[RobotoSerif]="ofl/robotoserif/RobotoSerif%5BGRAD%2Copsz%2Cwdth%2Cwght%5D.ttf"
FONTS[EncodeSans]="ofl/encodesans/EncodeSans%5Bwdth%2Cwght%5D.ttf"
FONTS[Inconsolata]="ofl/inconsolata/Inconsolata%5Bwdth%2Cwght%5D.ttf"
FONTS[NotoSansDisplay]="ofl/notosansdisplay/NotoSansDisplay%5Bwdth%2Cwght%5D.ttf"
FONTS[Roboto]="ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf"
FONTS[DMMono]="ofl/dmmono/DMMono-Regular.ttf"

for name in "${!FONTS[@]}"; do
  path="${FONTS[$name]}"
  # Decode the filename from the URL
  filename=$(basename "$path" | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")
  outfile="$DIR/$filename"
  if [ -f "$outfile" ]; then
    echo "  skip $filename (exists)"
  else
    echo "  downloading $name -> $filename"
    curl -fsSL "$BASE/$path" -o "$outfile"
    echo "    $(wc -c < "$outfile" | tr -d ' ') bytes"
  fi
done

echo "Done. Fonts in $DIR:"
ls -lh "$DIR"
