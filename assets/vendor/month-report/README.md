# Local PDF runtime

Vendored on 2026-10-04; no CDN or remote financial-document renderer.

- jsPDF **4.2.1**: npm `jspdf@4.2.1/dist/jspdf.umd.min.js`, MIT, upstream [parallax/jsPDF](https://github.com/parallax/jsPDF).
- jsPDF AutoTable **5.0.8**: npm `jspdf-autotable@5.0.8/dist/jspdf.plugin.autotable.min.js`, MIT, upstream [simonbengtsson/jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable).
- Inter Tight: the same Google Fonts font used by Kiwi; regular/semibold static TrueType instances (400/600) of the repository's existing Latin variable font, converted using fontTools. SIL Open Font License, bundled here. No outlines or family renamed.
- IBM Plex Sans Arabic regular: full TrueType from [google/fonts](https://github.com/google/fonts/tree/main/ofl/ibmplexsansarabic), SIL Open Font License, bundled here. Full Arabic shaping glyphs retained.

The generator uses text and table APIs only, not HTML rendering, remote URLs, embedded scripts or PDF forms. Font/library load failure blocks the PDF with a retryable error instead of producing a partially readable report. Original Arabic merchant text is preserved. UI labels are French/English/Arabic; the accountant dossier itself is French, with the required English notice.

Pinned file SHA-256 values are recorded in `SHA256SUMS`. Update dependencies deliberately, check upstream security/releases, regenerate checksums, and rerun actual downloaded-PDF and rendering tests.
