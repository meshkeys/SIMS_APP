import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

/** Where Chrome, Chromium or Edge usually live, after CHROME_PATH. */
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

export class PdfUnavailableError extends Error {
  constructor() {
    super(
      'PDF packs need Chrome or Chromium on the server. Install it or set CHROME_PATH.',
    );
    this.name = 'PdfUnavailableError';
  }
}

export function findChrome(configured?: string): string {
  const found = [configured, ...CANDIDATES].find(
    (path): path is string => !!path && existsSync(path),
  );
  if (!found) throw new PdfUnavailableError();
  return found;
}

/**
 * Prints a self-contained HTML document to an A4 landscape PDF with headless
 * Chrome. The page runs with JavaScript off and every network request
 * blocked: pack HTML carries everything inline, so nothing may be fetched.
 */
export async function printPdf(
  html: string,
  chromePath?: string,
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: findChrome(chromePath),
    headless: true,
    args: ['--no-first-run', '--disable-extensions', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith('data:')) void request.continue();
      else void request.abort();
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
