# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task | Command |
|------|---------|
| Dev server (http://localhost:5173) | `npm run dev` |
| Production build (runs `tsc -b` then Vite) | `npm run build` |
| Lint | `npm run lint` |
| Run all tests once | `npm run test:run` |
| Watch tests | `npm test` |
| Run a single test file | `npx vitest run src/utils/__tests__/pdfMerger.test.ts` |
| Filter by test name | `npx vitest run -t "merge invoices"` |
| Deploy to Cloudflare Pages | `npm run deploy` (builds, then `wrangler pages deploy dist --project-name=smart-ticket`) |

Build prerequisite: `tsc -b` must succeed before Vite runs — type errors fail the build.

Tests use **Vitest + jsdom**; setup file is `src/test/setup.ts` (pulls in `@testing-library/jest-dom`). Vitest config lives inside `vite.config.ts`.

## Architecture

This is a **100% client-side SPA** for merging invoice PDFs and receipt images into print-ready A4 PDFs. No backend, no uploads — everything runs in the browser.

### Routing & Shell
- `src/App.tsx` uses **`HashRouter`**. Routes: `/`, `/editor`, `/result`, `/privacy`, `/disclaimer`. (Hash routing originally adopted for GitHub Pages; kept on Cloudflare Pages so deep links work without a `_redirects` file.)
- `Header` and `Footer` are persistent; only the `<main>` region scrolls. The shell layout (`h-screen flex flex-col … overflow-hidden`) is intentional — pages assume an `overflow-auto` parent and should not introduce their own outer scrollbars.
- `EditorPage` and `ResultPage` self-redirect to `/` if the store is empty — keep that guard whenever adding new file-dependent routes.
- **`pdfMerger` is the only lazy module.** It is loaded via `import('../utils/pdfMerger')` inside `EditorPage.handleMerge` so `pdf-lib` (~400 KB) stays off the initial bundle until the user clicks 合并 PDF. Everything else — routes, `qrScanner`, `documentScanner`, `thumbnailGenerator`, `csvExporter`, `FilePreviewModal` — is statically imported (their chunks are small enough that the per-action HTTP round-trip costs more than the bytes saved).

### State (Zustand) — `src/store/useFileStore.ts`
Single source of truth for the upload/edit/result flow. Three non-obvious responsibilities:
1. **Object URL lifecycle.** `replaceFiles`, `removeFile`, `updateFile`, `removeDuplicates`, and `reset` all `URL.revokeObjectURL` on the previous `thumbnailUrl` and `mergedPdfUrl`. Any code that swaps a `thumbnailUrl` MUST go through `updateFile` (which compares and revokes) — bypassing it leaks blob URLs.
2. **Two upload semantics.** `replaceFiles` is used on the home page (clear & start over); `addFiles` is used in the editor (append). Don't merge them.
3. **Dup flags are derived.** `computeDupFlags` runs after every files mutation (`addFiles`/`replaceFiles`/`removeFile`/`removeDuplicates`); never set `dup` by hand. Definition: `dup === true` iff ≥2 files share the same `hash`.

`UploadedFile` (`src/types/index.ts`) carries `rotation: 0|90|180|270` (applied lazily during merge in `pdfMerger.ts`), plus `hash` (SHA-256 hex, computed at upload via `src/utils/fileHash.ts`) and optional `pageCount`/`dup`/`qrContent`. **Both upload paths — `FileUploader` (home) and `EditorPage.handleFilesSelected` — must populate `hash`**, otherwise dedup collapses files into a single `undefined` group and falsely flags them. `pageCount` is set for PDFs only (returned by `generateThumbnail` alongside the thumbnail URL) and powers the "多页" badge in `FileThumbnail`.

### PDF Merge Pipeline — `src/utils/pdfMerger.ts`
This is the core domain logic. Layout rules are encoded as A4-point constants at the top of the file:

- **PDFs are treated as "invoices"**, images as "bills/receipts" (filtered by `file.type`).
- Layout: invoices pair 2-per-page (top/bottom halves); bills pack 4-per-page (2×2 grid); a leftover odd invoice gets the top half of a mixed page with up to 2 bills below it.
- PDFs are **rasterized via `pdfjs-dist`** (`pdfToImage`) before being embedded by `pdf-lib`. We do not page-copy — every PDF page becomes a PNG. This is why CJK fonts need the CDN-hosted CMap/standard-fonts (`PDFJS_CMAP_URL`, `PDFJS_STANDARD_FONT_URL`); editing those URLs requires bumping them in lockstep with the `pdfjs-dist` version in `package.json`.
- pdfjs-dist worker is wired with `?url` import: `pdfjs-dist/build/pdf.worker.min.mjs?url` — same pattern in `pdfMerger.ts`, `thumbnailGenerator.ts`, `qrScanner.ts`, and `previewGenerator.ts`. All four set `pdfjsLib.GlobalWorkerOptions.workerSrc` at module load and duplicate the `PDFJS_CMAP_URL` / `PDFJS_STANDARD_FONT_URL` constants — bump them in lockstep when upgrading `pdfjs-dist`.
- Cut lines (`drawHorizontalCutLine` / `drawVerticalCutLine`) are dashed guides drawn between slots so the printed page can be physically cut apart.
- Coordinates are pdf-lib convention (origin = bottom-left), not pdfjs/canvas (top-left). Don't conflate the two when adjusting layout.

### Image Enhancement & Scanning
- `src/utils/imageEnhancer.ts` applies contrast/brightness/sharpen via the Canvas 2D API. `isEnhanced(options)` is a fast equality-vs-defaults check; `pdfMerger.processImage` skips re-encoding when neither rotation nor enhancement is needed (preserves original JPEG bytes).
- `src/utils/documentScanner.ts` wraps the **Scanic** WASM library for auto edge detection + perspective correction on photographed documents. Output is a `HTMLCanvasElement` → `File` via `canvasToFile`. The scan flow lives in `EditorPage` and operates on image-type files only.

### CSV Export & QR Scan — `src/utils/qrScanner.ts` + `csvExporter.ts`
- `scanInvoiceQR(file)` works on PDFs (page 1 via pdfjs) and images (`createImageBitmap`); fast-path crops the top-left 40 % first, full-canvas fallback. Returns the raw QR payload string or `null`.
- Result is cached on `UploadedFile.qrContent` (`undefined` = unscanned, `null` = failed, `string` = payload). The "导出 CSV" button only re-scans files where `qrContent === undefined`; there is no force-rescan UI — remove + re-add to invalidate.
- `buildCsv` emits 10 columns with UTF-8 BOM + CRLF; payload is split on `,` and padded/truncated to exactly 8 fields. Failed/unscanned cells get `解析失败` in col 3.

### Hi-res Preview — `src/components/FilePreviewModal.tsx`
Clicking a thumbnail opens a fade+scale modal. Images use `URL.createObjectURL`; PDFs go through `previewGenerator.generatePdfPreview` (re-renders page 1 capped at 1600×2240, max scale 4×). The modal shows `file.thumbnailUrl` first, swaps to hi-res when ready.

### Styling
- **UnoCSS** with `presetUno` + `presetAttributify` (see `uno.config.ts`). Tailwind-like utilities work directly in `className`. There is no Tailwind config and no PostCSS — do not add a `tailwind.config.js`.
- Global reset comes from `@unocss/reset`; project-specific styles in `src/index.css` and `src/styles/`.

## Conventions worth knowing

- The repo is bilingual: README and most user-facing strings are Chinese; code comments and identifiers are English. Keep that split when editing.
- Deploy target is **Cloudflare Pages** (project `smart-ticket`) served at the root. Vite `base: '/'`. Absolute asset paths in `index.html` should reference `/foo` directly; for code-side asset references prefer Vite's `?url` / `import.meta.env.BASE_URL` so the path stays correct if `base` ever changes again.
- Drag-and-drop uses `@dnd-kit` (not react-dnd). The sortable list is `src/components/SortableFileList.tsx`.
- Privacy claim ("100% local, never uploaded") is load-bearing for the product — do not introduce network calls for file content. The only external network usage today is the pdfjs CDN (CMap + standard fonts).
