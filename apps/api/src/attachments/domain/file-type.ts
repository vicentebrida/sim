/**
 * Which files are accepted as Attachments (PRD §3.7). The type comes from the extension and is
 * confirmed by the first bytes, so a renamed file does not get through.
 */
export interface FileType {
  contentType: string;
  image: boolean;
}

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => data[offset + index] === byte);

const ZIP = (data: Buffer) => startsWith(data, [0x50, 0x4b, 0x03, 0x04]);

const TYPES: Record<string, FileType & { matches: (data: Buffer) => boolean }> = {
  png: {
    contentType: 'image/png',
    image: true,
    matches: (d) => startsWith(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  jpg: {
    contentType: 'image/jpeg',
    image: true,
    matches: (d) => startsWith(d, [0xff, 0xd8, 0xff]),
  },
  jpeg: {
    contentType: 'image/jpeg',
    image: true,
    matches: (d) => startsWith(d, [0xff, 0xd8, 0xff]),
  },
  gif: {
    contentType: 'image/gif',
    image: true,
    matches: (d) => d.subarray(0, 6).toString('latin1').startsWith('GIF8'),
  },
  webp: {
    contentType: 'image/webp',
    image: true,
    matches: (d) =>
      d.subarray(0, 4).toString('latin1') === 'RIFF' &&
      d.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  pdf: {
    contentType: 'application/pdf',
    image: false,
    matches: (d) => d.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    image: false,
    matches: ZIP,
  },
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    image: false,
    matches: ZIP,
  },
  pptx: {
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    image: false,
    matches: ZIP,
  },
  txt: {
    contentType: 'text/plain; charset=utf-8',
    image: false,
    // Text has no NUL bytes; binaries almost always do.
    matches: (d) => !d.subarray(0, 8192).includes(0),
  },
};

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

/** The type of the file, or null when the extension is not allowed or the content disagrees. */
export function detectFileType(filename: string, data: Buffer): FileType | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES[extension];
  if (!type || data.length === 0 || !type.matches(data)) return null;
  return { contentType: type.contentType, image: type.image };
}

/** A name safe to show and to send in a header: no path, no control characters. */
export function cleanFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (cleaned || 'file').slice(0, 200);
}
