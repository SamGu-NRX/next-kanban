// @vitest-environment node
// WITNESS (expected red until milestone 2): the board must render on the
// server. KanbanBoard evaluates `"document" in window` directly in its render
// body, which throws `ReferenceError: window is not defined` during SSR and
// makes the `/` route fail with HTTP 500 instead of prerendering.
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KanbanBoard } from "@/components/KanbanBoard";

it("renders the board in a Node environment without window", () => {
  let html: string;
  expect(() => {
    html = renderToStaticMarkup(<KanbanBoard />);
  }).not.toThrow();
  expect(html!).toContain("Todo");
});
