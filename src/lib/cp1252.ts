// DATEV verlangt für den Buchungsstapel-Export zwingend Windows-1252 (ANSI), kein UTF-8 —
// bestätigt durch drei unabhängige Quellen: DATEV-Community-Forum, die Formatbeschreibung
// mehrerer Drittanbieter-Importe, und das aktiv gepflegte `datev`-Ruby-Gem, dessen Export-Code
// explizit `string.encode('windows-1252', invalid: :replace, undef: :replace, replace: ' ')`
// aufruft. Ein UTF-8-Export würde von DATEV-Importern abgelehnt oder — schlimmer — Umlaute in
// Kunden-/Firmennamen lautlos verstümmeln. Tabelle für 0x80-0x9F gegen die offizielle
// Unicode.org-Referenz verifiziert: unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT
// (0x00-0x7F und 0xA0-0xFF sind bei CP1252 identisch zum Unicode-Codepoint).
const CP1252_HIGH_RANGE: [number, number][] = [
  [0x80, 0x20AC], [0x82, 0x201A], [0x83, 0x0192], [0x84, 0x201E], [0x85, 0x2026],
  [0x86, 0x2020], [0x87, 0x2021], [0x88, 0x02C6], [0x89, 0x2030], [0x8A, 0x0160],
  [0x8B, 0x2039], [0x8C, 0x0152], [0x8E, 0x017D], [0x91, 0x2018], [0x92, 0x2019],
  [0x93, 0x201C], [0x94, 0x201D], [0x95, 0x2022], [0x96, 0x2013], [0x97, 0x2014],
  [0x98, 0x02DC], [0x99, 0x2122], [0x9A, 0x0161], [0x9B, 0x203A], [0x9C, 0x0153],
  [0x9E, 0x017E], [0x9F, 0x0178],
];

const codepointToByte = new Map<number, number>();
for (const [byte, codepoint] of CP1252_HIGH_RANGE) codepointToByte.set(codepoint, byte);

const REPLACEMENT_BYTE = 0x20; // ' ' — spiegelt das `invalid: :replace, replace: ' '` des datev-Gems

export function encodeWindows1252(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) ?? 0;
    let byte: number;
    if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) {
      byte = cp;
    } else {
      byte = codepointToByte.get(cp) ?? REPLACEMENT_BYTE;
    }
    bytes[i] = byte;
  }
  return bytes;
}
