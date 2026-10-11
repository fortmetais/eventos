import "@testing-library/jest-dom/vitest";
// O navegador fornece estes observadores; o jsdom não mede o layout. O
// comportamento real de arraste é verificado separadamente no navegador.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;
