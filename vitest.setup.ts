import "@testing-library/jest-dom/vitest";

// Node.js 22+ has an experimental localStorage that requires --localstorage-file
// and may not be available. Provide a deterministic in-memory implementation so
// tests that exercise localStorage work consistently in every Node version.
if (typeof localStorage === "undefined" || localStorage === null) {
  const store: Record<string, string> = {};
  const localStorageMock: Storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
}
