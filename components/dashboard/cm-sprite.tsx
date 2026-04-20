// Cardmarket-sprite icons. The sprite sheet ssMain2.png is the same one
// Cardmarket uses on their site, so language flags and the foil star match
// what the user sees there. New code referring to "foil" anywhere in the UI
// should use <FoilStar /> instead of text or other glyphs (see CLAUDE.md).
//
// Internally this component works in grid coordinates (col, row) rather
// than raw CSS pixel positions so it scales at any `size`. The natural
// sheet is 19 cols × 3 rows of 16px tiles (304 × 48 px — verified via
// `file public/sprites/ssMain2.png`); we scale proportionally for any
// other size by setting backgroundSize to (cols × size, rows × size).

export const SPRITE_SHEET_COLS = 19;
export const SPRITE_SHEET_ROWS = 3;

export const LANGUAGE_COL: Record<string, number> = {
  English: 1,
  French: 2,
  German: 3,
  Spanish: 4,
  Italian: 5,
  "S-Chinese": 6,
  Japanese: 7,
  Portuguese: 8,
  Russian: 9,
  Korean: 10,
  "T-Chinese": 11,
};

/** Lowercased aliases → canonical LANGUAGE_COL key. Delver Lens exports language
 *  names like 'Chinese Simplified' that we'd otherwise miss. */
const LANGUAGE_ALIASES: Record<string, string> = {
  "simplified chinese": "S-Chinese",
  "chinese simplified": "S-Chinese",
  "s-chinese": "S-Chinese",
  "traditional chinese": "T-Chinese",
  "chinese traditional": "T-Chinese",
  "t-chinese": "T-Chinese",
  english: "English",
  french: "French",
  german: "German",
  spanish: "Spanish",
  italian: "Italian",
  japanese: "Japanese",
  portuguese: "Portuguese",
  russian: "Russian",
  korean: "Korean",
};

interface CmSpriteProps {
  /** 0-indexed column in the sprite sheet (each sprite is 16px at natural size). */
  col: number;
  /** 0-indexed row in the sprite sheet. */
  row: number;
  /** Rendered size in px (square). Default 16. */
  size?: number;
  title?: string;
}

export function CmSprite({ col, row, size = 16, title }: CmSpriteProps) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-block",
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: "url(/sprites/ssMain2.png)",
        backgroundPosition: `${-col * size}px ${-row * size}px`,
        backgroundSize: `${SPRITE_SHEET_COLS * size}px ${SPRITE_SHEET_ROWS * size}px`,
        backgroundRepeat: "no-repeat",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

/** Cardmarket foil-star sprite. Use this anywhere the UI shows that a card is foil. */
export function FoilStar({ size = 14 }: { size?: number }) {
  return <CmSprite col={1} row={1} size={size} title="Foil" />;
}

export function LanguageFlag({ language, size = 16 }: { language: string; size?: number }) {
  const canonical = LANGUAGE_ALIASES[language.toLowerCase()] ?? language;
  const col = LANGUAGE_COL[canonical];
  if (col === undefined) return <span>{language}</span>;
  return <CmSprite col={col} row={0} size={size} title={canonical} />;
}
