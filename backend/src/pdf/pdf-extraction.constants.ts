// Below this, treat the PDF as having no usable text layer (e.g. a scanned
// or image-only document) rather than passing near-empty text downstream.
export const MIN_EXTRACTED_TEXT_LENGTH = 20;

// The 10 MB upload limit doesn't bound extraction cost: a small PDF can
// declare thousands of pages. Real invoices are a handful of pages.
export const MAX_PDF_PAGES = 50;

// Invoices are short documents; this is a generous ceiling that guards
// against sending unnecessarily large text to the LLM in later phases.
export const MAX_EXTRACTED_TEXT_LENGTH = 20_000;
