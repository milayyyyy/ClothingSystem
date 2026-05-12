-- BigSeller PDF: buyer-message store suffix → maps to stores.pdf_label (then name fallback in app).

alter table public.stores add column if not exists pdf_label text;

comment on column public.stores.pdf_label is 'Text after Buyer Message in BigSeller PDFs; used to set orders.store_id on import.';

create unique index if not exists stores_pdf_label_lower_unique
  on public.stores (lower(trim(pdf_label)))
  where pdf_label is not null and trim(pdf_label) <> '';
