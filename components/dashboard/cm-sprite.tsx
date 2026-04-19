// Cardmarket-sprite icons. The sprite sheet ssMain2.png is the same one
// Cardmarket uses on their site, so language flags and the foil star match
// what the user sees there. New code referring to "foil" anywhere in the UI
// should use <FoilStar /> instead of text or other glyphs (see CLAUDE.md).

export const FOIL_STAR_POS = "-16px -16px";

export const LANGUAGE_POS: Record<string, string> = {
  English: "-16px 0",
  French: "-32px 0",
  German: "-48px 0",
  Spanish: "-64px 0",
  Italian: "-80px 0",
  "S-Chinese": "-96px 0",
  Japanese: "-112px 0",
  Portuguese: "-128px 0",
  Russian: "-144px 0",
  Korean: "-160px 0",
  "T-Chinese": "-176px 0",
};

export function CmSprite({ pos, title, size = 16 }: { pos: string; title?: string; size?: number }) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-block",
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: "url(/sprites/ssMain2.png)",
        backgroundPosition: pos,
        backgroundRepeat: "no-repeat",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

/** Cardmarket foil-star sprite. Use this anywhere the UI shows that a card is foil. */
export function FoilStar({ size = 16 }: { size?: number }) {
  return <CmSprite pos={FOIL_STAR_POS} title="Foil" size={size} />;
}
