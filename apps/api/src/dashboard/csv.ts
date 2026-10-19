/** Fields starting with these are read as formulas by spreadsheets. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | Date | null): string {
  if (value === null) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralizes formula injection from user-provided text such as titles and names.
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const BOM = String.fromCharCode(0xfeff);

/** CSV for Excel: BOM so accents open right, CRLF between rows. */
export function toCsv(
  header: readonly string[],
  rows: readonly (string | number | Date | null)[][],
) {
  return `${BOM}${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
