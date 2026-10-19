/** The item was saved but some of its files were not. */
export class AttachmentsNotSent extends Error {}

/** Sends the files one by one and returns how many failed (the item is already saved). */
export async function uploadAll(files: File[], send: (file: File) => Promise<unknown>) {
  let failed = 0;
  for (const file of files) {
    try {
      await send(file);
    } catch {
      failed += 1;
    }
  }
  return failed;
}
