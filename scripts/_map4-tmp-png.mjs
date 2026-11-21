import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.goto('file:///home/user/GTA-Bedstuy/docs/reference/realmap-r4.svg'); await p.screenshot({ path: process.argv[2] }); await b.close();
