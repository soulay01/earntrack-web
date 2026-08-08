export interface AddressParts {
  strasse: string;
  plz: string;
  ort: string;
}

// Kombiniert die Formularfelder zum DB-Format „Straße, PLZ Ort" (exakt das
// bisherige Objektadresse-Format, damit PDF/Rechnung/ZUGFeRD unverändert bleiben).
export function combineAddress(strasse: string, plz: string, ort: string): string {
  const ortTeil = [plz.trim(), ort.trim()].filter(Boolean).join(' ');
  return [strasse.trim(), ortTeil].filter(Boolean).join(', ');
}

// Zerlegt den DB-String in die Formularfelder. Letztes ", "-Vorkommen trennt
// Straße von PLZ/Ort; führende 1-5 Ziffern rechts sind die PLZ.
export function splitAddress(address: string): AddressParts {
  const adr = (address || '').trim();
  if (!adr) return { strasse: '', plz: '', ort: '' };
  const commaIdx = adr.lastIndexOf(', ');
  if (commaIdx === -1) return { strasse: adr, plz: '', ort: '' };
  const strasse = adr.slice(0, commaIdx).trim();
  const rest = adr.slice(commaIdx + 2).trim();
  if (!rest) return { strasse, plz: '', ort: '' };
  const m = rest.match(/^(\d{1,5})\s*(.*)$/);
  if (!m) return { strasse, plz: '', ort: rest };
  return { strasse, plz: m[1], ort: m[2].trim() };
}
