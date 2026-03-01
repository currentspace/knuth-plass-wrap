import {
  use,
  useState,
  useRef,
  useMemo,
  useCallback,
  Suspense,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useContainerWidth } from "../hooks/useContainerWidth";
import { usePersistPrefs } from "../hooks/usePersistPrefs";
import { useFontHzLabels } from "../hooks/useFontHzLabels";
import {
  Card,
  CSSJustifyCard,
  CSSPrettyCard,
  KPHarfrustCard,
} from "../cards";
import { FONTS, loadFontData, fontAndWasmReady, fontAndHarfrustReady } from "./fonts";
import { SAMPLES } from "./samples";
import { PRESETS } from "./presets";
import { Field, Sel, Note } from "./ui";
import { FontPicker } from "./FontPicker";

const STORAGE_KEY = "kp-prefs";

function loadPrefs(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

const checkboxLabelStyle: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 4,
  userSelect: "none",
};

const sliderStyle: CSSProperties = {
  width: "100%",
  accentColor: "#7a5a3a",
};

function PresetChip({
  preset,
  index,
  active,
  onSelect,
}: {
  preset: (typeof PRESETS)[number];
  index: number;
  active: boolean;
  onSelect: (i: number) => void;
}): ReactNode {
  return (
    <button
      onClick={() => onSelect(index)}
      style={{
        fontFamily: "var(--mono)",
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        letterSpacing: "0.02em",
        padding: "6px 12px",
        border: active ? "1.5px solid #7a5a3a" : "1px solid #d4cfc8",
        borderRadius: 6,
        background: active ? "#f5efe8" : "#fff",
        color: active ? "#5a3e1e" : "var(--text)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
        boxShadow: active ? "0 1px 4px rgba(122,90,58,0.15)" : "none",
      }}
    >
      {preset.name}
    </button>
  );
}

function LaTeXReferenceCard({
  presetIdx,
}: {
  presetIdx: number | null;
}): ReactNode {
  if (presetIdx !== null) {
    const preset = PRESETS[presetIdx];
    return (
      <Card label="LaTeX Reference" accent="#8b5e3c" note="LuaLaTeX · Knuth-Plass · glyph expansion">
        <img
          src={preset.pngPath}
          alt={`LaTeX render: ${preset.name}`}
          style={{
            display: "block",
            width: preset.lineWidthPx + 16,
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </Card>
    );
  }

  return (
    <Card label="LaTeX Reference" accent="#8b5e3c" note="presets only">
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
          color: "var(--muted)",
        }}
      >
        <div
          style={{
            fontFamily: '"Literata", Georgia, serif',
            fontSize: 28,
            color: "#d4cfc8",
            marginBottom: 12,
            lineHeight: 1,
          }}
        >
          T<sub style={{ fontSize: 18, position: "relative", top: 4 }}>E</sub>X
        </div>
        <p
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 220,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          LaTeX reference images are available for the curated presets above.
          Select one to compare.
        </p>
      </div>
    </Card>
  );
}

function HarfrustCardArea({
  text,
  font,
  fontIdx,
  lineWidth,
  fontWeight,
  fontSize,
  lineHeight,
  hyphenate,
  similarity,
}: {
  text: string;
  font: (typeof FONTS)[number];
  fontIdx: number;
  lineWidth: number;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
  hyphenate: boolean;
  similarity: boolean;
}): ReactNode {
  const { wdthRange, fontBinary, fontBinaryMap } = use(fontAndHarfrustReady(fontIdx));
  if (fontBinary.byteLength === 0 && !fontBinaryMap) return null;
  return (
    <KPHarfrustCard
      text={text}
      width={lineWidth}
      fontBinary={fontBinary}
      fontBinaryMap={fontBinaryMap}
      fontFamily={font.family}
      fontSize={fontSize}
      fontWeight={fontWeight}
      lineHeight={lineHeight}
      wdthRange={wdthRange}
      hyphenate={hyphenate}
      similarity={similarity}
    />
  );
}

function CardArea({
  text,
  font,
  fontIdx,
  lineWidth,
  fontWeight,
  fontSize,
  lineHeight,
  hyphenate,
  similarity,
  presetIdx,
}: {
  text: string;
  font: (typeof FONTS)[number];
  fontIdx: number;
  lineWidth: number;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
  hyphenate: boolean;
  similarity: boolean;
  presetIdx: number | null;
}): ReactNode {
  use(fontAndWasmReady(fontIdx));

  const styledFont = useMemo(
    () => ({
      ...font,
      size: fontSize,
      weight: fontWeight,
      lineHeight,
      css: `${fontWeight} ${fontSize}px ${font.family}`,
    }),
    [font, fontSize, fontWeight, lineHeight],
  );

  const harfrustFallback = (
    <Card label="Knuth-Plass -- Harfrust" accent="#1a6b5a" note="loading...">
      <div style={{ padding: "20px 0", color: "#a09890", fontSize: 14 }}>
        Loading font binary...
      </div>
    </Card>
  );

  return (
    <>
      <div className="card-grid">
        <CSSJustifyCard
          text={text}
          font={styledFont}
          lineWidth={lineWidth}
          hyphenate={hyphenate}
        />
        <CSSPrettyCard
          text={text}
          font={styledFont}
          lineWidth={lineWidth}
          hyphenate={hyphenate}
        />
        <Suspense fallback={harfrustFallback}>
          <HarfrustCardArea
            text={text}
            font={font}
            fontIdx={fontIdx}
            lineWidth={lineWidth}
            fontWeight={fontWeight}
            fontSize={fontSize}
            lineHeight={lineHeight}
            hyphenate={hyphenate}
            similarity={similarity}
          />
        </Suspense>
      </div>
      <LaTeXReferenceCard presetIdx={presetIdx} />
    </>
  );
}

export default function App(): ReactNode {
  const [saved] = useState(loadPrefs);

  const [textKey, setTextKey] = useState<string>(() => {
    const v = saved.textKey;
    return typeof v === "string" && v in SAMPLES ? v : "Knuth on TeX";
  });
  const [custom, setCustom] = useState<string>(() =>
    typeof saved.custom === "string" ? saved.custom : "",
  );
  const [isCustom, setIsCustom] = useState<boolean>(
    () => saved.isCustom === true,
  );
  const [fontIdx, setFontIdx] = useState<number>(() => {
    const v = saved.fontIdx;
    return typeof v === "number" && v >= 0 && v < FONTS.length ? v : 0;
  });
  const [pct, setPct] = useState<number>(() => {
    const v = saved.pct;
    return typeof v === "number" && v >= 0 && v <= 1 ? v : 0.55;
  });
  const [hyphenate, setHyphenate] = useState<boolean>(
    () => saved.hyphenate === true,
  );
  const [similarity, setSimilarity] = useState<boolean>(
    () => saved.similarity === true,
  );
  const [weight, setWeight] = useState<number>(() => {
    const v = saved.weight;
    return typeof v === "number" && v >= 100 && v <= 900 ? v : 400;
  });
  const [fSize, setFSize] = useState<number>(() => {
    const v = saved.fSize;
    return typeof v === "number" && v >= 10 && v <= 32 ? v : 0;
  });
  const [lhMult, setLhMult] = useState<number>(() => {
    const v = saved.lhMult;
    return typeof v === "number" && v >= 1 && v <= 2.5 ? v : 1.6;
  });
  const [presetIdx, setPresetIdx] = useState<number | null>(() => {
    const v = saved.presetIdx;
    return typeof v === "number" && v >= 0 && v < PRESETS.length ? v : null;
  });

  const wrapRef = useRef<HTMLDivElement>(null);

  const prefsObj = useMemo(
    () => ({
      textKey,
      fontIdx,
      pct,
      hyphenate,
      similarity,
      isCustom,
      custom,
      weight,
      fSize,
      lhMult,
      presetIdx,
    }),
    [textKey, fontIdx, pct, hyphenate, similarity, isCustom, custom, weight, fSize, lhMult, presetIdx],
  );
  usePersistPrefs(STORAGE_KEY, prefsObj);

  const hzLabels = useFontHzLabels(loadFontData, FONTS.length);
  const maxW = useContainerWidth(wrapRef, 48);

  const text = isCustom && custom.trim() ? custom : SAMPLES[textKey];
  const font = FONTS[fontIdx];
  const fontSize = fSize > 0 ? fSize : font.size;
  const lineHeight = Math.round(fontSize * lhMult);
  const sliderWidth = Math.max(
    160,
    Math.round(160 + pct * (Math.max(200, maxW) - 160)),
  );
  const lineWidth = presetIdx !== null ? PRESETS[presetIdx].lineWidthPx : sliderWidth;

  const clearPreset = useCallback(() => setPresetIdx(null), []);

  const applyPreset = useCallback((idx: number) => {
    const p = PRESETS[idx];
    setPresetIdx(idx);
    setTextKey(p.textKey);
    setIsCustom(false);
    setFontIdx(p.fontIdx);
    setWeight(p.weight);
    setFSize(p.fontSize);
    setLhMult(p.lhMult);

    const mW = Math.max(200, maxW);
    const targetPct = (p.lineWidthPx - 160) / (mW - 160);
    setPct(Math.max(0, Math.min(1, targetPct)));
  }, [maxW]);

  const onTextChange = useCallback((v: string) => {
    clearPreset();
    if (v === "__c") setIsCustom(true);
    else {
      setIsCustom(false);
      setTextKey(v);
    }
  }, [clearPreset]);

  const onFontChange = useCallback((v: number) => { clearPreset(); setFontIdx(v); }, [clearPreset]);
  const onPctChange = useCallback((v: number) => { clearPreset(); setPct(v); }, [clearPreset]);
  const onWeightChange = useCallback((v: number) => { clearPreset(); setWeight(v); }, [clearPreset]);
  const onSizeChange = useCallback((v: number) => { clearPreset(); setFSize(v); }, [clearPreset]);
  const onLeadingChange = useCallback((v: number) => { clearPreset(); setLhMult(v); }, [clearPreset]);
  const onHyphenateChange = useCallback((v: boolean) => { clearPreset(); setHyphenate(v); }, [clearPreset]);
  const onSimilarityChange = useCallback((v: boolean) => { clearPreset(); setSimilarity(v); }, [clearPreset]);

  return (
    <div
      style={
        {
          "--mono": '"DM Mono", "SF Mono", Menlo, monospace',
          "--text": "#2a2623",
          "--muted": "#a09890",
          minHeight: "100vh",
          background: "#f4f1ec",
          fontFamily: "var(--mono)",
          color: "var(--text)",
        } as CSSProperties
      }
    >
      <div
        ref={wrapRef}
        style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}
      >
        <header style={{ paddingTop: 44 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Paragraph Formatting
          </div>
          <h1
            style={{
              fontFamily: '"Literata", Georgia, serif',
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              color: "#1a1815",
              lineHeight: 1.3,
            }}
          >
            Knuth–Plass Line Breaking
          </h1>
          <p
            style={{
              fontFamily: '"Literata", Georgia, serif',
              fontSize: 15,
              color: "#716b64",
              marginTop: 8,
              lineHeight: 1.6,
            }}
          >
            TeX's optimal paragraph-formatting algorithm in JavaScript. Compare
            browser-native layout with Knuth–Plass optimal breaking and the
            authoritative LaTeX reference.
          </p>
        </header>

        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "#f4f1ec",
            borderBottom: "1px solid #dcd8d1",
            margin: "24px -24px 0",
            padding: "12px 24px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              overflowX: "auto",
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted)",
                flexShrink: 0,
              }}
            >
              Presets
            </span>
            {PRESETS.map((p, i) => (
              <PresetChip
                key={i}
                preset={p}
                index={i}
                active={presetIdx === i}
                onSelect={applyPreset}
              />
            ))}
          </div>

          <div style={{ borderTop: "1px solid #eae7e1", margin: "0 0 10px" }} />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "flex-end",
            }}
          >
            <Field label="Text">
              <Sel
                value={isCustom ? "__c" : textKey}
                onChange={onTextChange}
                opts={[
                  ...Object.keys(SAMPLES).map(
                    (k) => [k, k] as [string, string],
                  ),
                  ["__c", "Custom\u2026"],
                ]}
              />
            </Field>
            <Field label="Typeface">
              <FontPicker
                value={fontIdx}
                onChange={onFontChange}
                fonts={FONTS}
                hzLabels={hzLabels}
              />
            </Field>

            <div style={{ width: 1, height: 28, background: "#dcd8d1", flexShrink: 0 }} />

            <div style={{ flex: 1, minWidth: 120, maxWidth: 260 }}>
              <Field label={`Measure \u2014 ${lineWidth} px${presetIdx !== null ? " (preset)" : ""}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={pct}
                  onChange={(e) => onPctChange(+e.target.value)}
                  style={sliderStyle}
                />
              </Field>
            </div>
            <div style={{ minWidth: 100, maxWidth: 140 }}>
              <Field label={`Weight \u2014 ${weight}`}>
                <input
                  type="range"
                  min={100}
                  max={900}
                  step={1}
                  value={weight}
                  onChange={(e) => onWeightChange(+e.target.value)}
                  style={sliderStyle}
                />
              </Field>
            </div>
            <div style={{ minWidth: 90, maxWidth: 120 }}>
              <Field label={`Size \u2014 ${fontSize} px`}>
                <input
                  type="range"
                  min={10}
                  max={32}
                  step={1}
                  value={fSize > 0 ? fSize : font.size}
                  onChange={(e) => onSizeChange(+e.target.value)}
                  style={sliderStyle}
                />
              </Field>
            </div>
            <div style={{ minWidth: 90, maxWidth: 140 }}>
              <Field label={`Leading \u2014 ${lhMult.toFixed(1)}x (${lineHeight} px)`}>
                <input
                  type="range"
                  min={1}
                  max={2.5}
                  step={0.1}
                  value={lhMult}
                  onChange={(e) => onLeadingChange(+e.target.value)}
                  style={sliderStyle}
                />
              </Field>
            </div>

            <div style={{ width: 1, height: 28, background: "#dcd8d1", flexShrink: 0 }} />

            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={hyphenate}
                onChange={(e) => onHyphenateChange(e.target.checked)}
              />
              Hyphens
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={similarity}
                onChange={(e) => onSimilarityChange(e.target.checked)}
              />
              Similarity
            </label>
          </div>
        </div>

        {isCustom && (
          <textarea
            rows={3}
            placeholder="Paste a paragraph\u2026"
            value={custom}
            onChange={(e) => { clearPreset(); setCustom(e.target.value); }}
            style={{
              marginTop: 10,
              width: "100%",
              boxSizing: "border-box",
              fontFamily: '"Literata", Georgia, serif',
              fontSize: 15,
              padding: "10px 14px",
              border: "1px solid #d4cfc8",
              borderRadius: 6,
              background: "#fff",
              resize: "vertical",
            }}
          />
        )}

        <div style={{ marginTop: 32, paddingBottom: 8 }}>
          <Suspense
            fallback={
              <div style={{ padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>
                Loading font &amp; engine...
              </div>
            }
          >
            <CardArea
              text={text}
              font={font}
              fontIdx={fontIdx}
              lineWidth={lineWidth}
              fontWeight={weight}
              fontSize={fontSize}
              lineHeight={lineHeight}
              hyphenate={hyphenate}
              similarity={similarity}
              presetIdx={presetIdx}
            />
          </Suspense>
        </div>

        <div
          style={{
            marginBottom: 52,
            background: "#eae7e1",
            borderRadius: 8,
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 18,
          }}
        >
          <Note title="The algorithm">
            Text is modelled as <em>boxes</em> (words), stretchable{" "}
            <em>glue</em> (spaces), and <em>penalties</em>. Dynamic programming
            finds globally optimal breakpoints minimising total demerits — the
            same technique TeX has used since 1981.
          </Note>
          <Note title="Browser vs optimal">
            Browser justification decides each line in isolation and can create
            rivers of whitespace. Knuth–Plass considers the entire paragraph,
            trading a slightly loose early line to prevent bad spacing later.
          </Note>
          <Note title="LaTeX reference">
            The LaTeX column renders the same paragraph with LuaLaTeX using the
            identical font file and Knuth–Plass parameters — the gold standard
            for comparison.
          </Note>
        </div>
      </div>
    </div>
  );
}
