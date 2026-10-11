// SCAN-P2-08: one place for the upload file-size limit, shared by the upload
// forms (browser check, no heavy imports here) and the server reader.
//
// A 500-row template is far below this; a workbook with logos or pasted
// pictures can pass it. The server accepts up to UPLOAD_BODY_LIMIT (set in
// next.config.ts) so that a file between the two limits still reaches the
// server and gets this plain message instead of the framework's error page.
export const MAX_UPLOAD_FILE_BYTES = 800 * 1024;

export function uploadFileTooBigMessage(sizeBytes: number): string {
  const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
  return `That file is ${mb} MB — keep it under 800 KB. Remove pictures or extra formatting, or split the rows into two files.`;
}
