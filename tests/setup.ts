// Test-environment shims for dnd-kit / Radix under jsdom.
// These only exist in the test environment; production code never imports this.

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom does not implement element scrolling; dnd-kit may call it while
// deciding whether a keyboard move needs to auto-scroll a container.
if (typeof Element !== "undefined") {
  Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
  // dnd-kit's keyboard sensor guards on feature detection, but a no-op keeps
  // scrollIntoView calls (e.g. Radix focus management) harmless.
  Element.prototype.scrollIntoView =
    Element.prototype.scrollIntoView || (() => {});
}
