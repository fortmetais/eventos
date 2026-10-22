export function publicEventPath(event: { id: string; slug?: string | null }) {
  return `/eventos/${encodeURIComponent(event.slug || event.id)}`;
}

export function normalizeEventSlug(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}
