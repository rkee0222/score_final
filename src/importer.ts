import type { PageDraft } from './types';
import { makeId } from './id';

const MAX_FILES = 60;
const MAX_PDF_PAGES = 80;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_LONG_EDGE = 2200;
const JPEG_QUALITY = 0.88;

async function pdfLibrary() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('이미지를 압축하지 못했습니다.')),
    'image/jpeg', JPEG_QUALITY,
  ));
}

async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

async function normalizeImage(file: File): Promise<PageDraft> {
  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('이미지를 처리할 수 없습니다.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    return { id: makeId('page'), name: file.name, blob: await canvasBlob(canvas), width, height, rotation: 0 };
  } finally { decoded.close(); }
}

async function pagesFromPdf(file: File, progress: (message: string) => void): Promise<PageDraft[]> {
  const pdfjs = await pdfLibrary();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) { await pdf.destroy(); throw new Error(`PDF는 최대 ${MAX_PDF_PAGES}페이지까지 지원합니다.`); }
  const pages: PageDraft[] = [];
  const stem = file.name.replace(/\.pdf$/i, '');
  for (let number = 1; number <= pdf.numPages; number += 1) {
    progress(`${file.name} · ${number}/${pdf.numPages}페이지 변환 중`);
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, MAX_LONG_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('PDF 페이지를 처리할 수 없습니다.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      id: makeId('page'), name: `${stem}-${String(number).padStart(3, '0')}.jpg`,
      blob: await canvasBlob(canvas), width: canvas.width, height: canvas.height, rotation: 0,
    });
    page.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await pdf.destroy();
  return pages;
}

function supported(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    || file.type === 'image/jpeg' || file.type === 'image/png' || /\.(jpe?g|png)$/i.test(file.name);
}

export async function importScoreFiles(files: File[], progress: (message: string) => void): Promise<PageDraft[]> {
  if (!files.length || files.length > MAX_FILES) throw new Error(`1개 이상 최대 ${MAX_FILES}개 파일을 선택해 주세요.`);
  if (files.some((file) => !supported(file))) throw new Error('JPG, PNG 또는 PDF만 선택할 수 있습니다.');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) throw new Error('선택한 파일은 합계 200MB 이하여야 합니다.');
  const pages: PageDraft[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    progress(`${index + 1}/${files.length} · ${file.name} 처리 중`);
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) pages.push(...await pagesFromPdf(file, progress));
    else pages.push(await normalizeImage(file));
  }
  return pages;
}
