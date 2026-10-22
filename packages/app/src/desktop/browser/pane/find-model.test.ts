import { describe, expect, test } from "vitest";
import { BrowserFindModel, type FindableWebview } from "./find-model";

class FakeWebview implements FindableWebview {
  calls: Array<[string, { forward?: boolean; findNext?: boolean } | undefined]> = [];
  stops: string[] = [];
  private nextRequestId = 1;

  findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number {
    this.calls.push([text, options]);
    return this.nextRequestId++;
  }

  stopFindInPage(action: "clearSelection" | "keepSelection" | "activateSelection"): void {
    this.stops.push(action);
  }
}

function createModel() {
  const webview = new FakeWebview();
  const model = new BrowserFindModel(() => webview);
  return { model, webview };
}

describe("BrowserFindModel", () => {
  test("starts a session for each query and steps through it", () => {
    const { model, webview } = createModel();
    model.open();
    model.setQuery("pa");
    model.setQuery("paseo");
    model.next();
    model.previous();

    expect(webview.calls).toEqual([
      ["pa", { findNext: true }],
      ["paseo", { findNext: true }],
      ["paseo", { forward: true, findNext: false }],
      ["paseo", { forward: false, findNext: false }],
    ]);
  });

  test("reports only the latest request", () => {
    const { model } = createModel();
    model.open();
    model.setQuery("pa");
    model.setQuery("paseo");

    model.handleResult({ requestId: 1, activeMatchOrdinal: 1, matches: 9 });
    expect(model.getSnapshot()).toMatchObject({ current: null, total: 0 });

    model.handleResult({ requestId: 2, activeMatchOrdinal: 2, matches: 3 });
    expect(model.getSnapshot()).toMatchObject({ query: "paseo", current: 2, total: 3 });
  });

  test("clears highlights when the query empties or find closes", () => {
    const { model, webview } = createModel();
    model.open();
    model.setQuery("paseo");
    model.setQuery("");
    model.setQuery("paseo");
    model.close();

    expect(webview.stops).toEqual(["clearSelection", "clearSelection"]);
    expect(model.getSnapshot()).toEqual({ open: false, query: "paseo", current: null, total: 0 });

    model.handleResult({ requestId: 2, activeMatchOrdinal: 1, matches: 1 });
    expect(model.getSnapshot().total).toBe(0);
  });

  test("searches a newly loaded page again", () => {
    const { model, webview } = createModel();
    model.open();
    model.setQuery("paseo");
    model.handleResult({ requestId: 1, activeMatchOrdinal: 1, matches: 4 });

    model.reset();

    expect(model.getSnapshot()).toMatchObject({ open: true, current: null, total: 0 });
    expect(webview.calls.at(-1)).toEqual(["paseo", { findNext: true }]);
  });

  test("does nothing while closed", () => {
    const { model, webview } = createModel();
    model.next();
    model.reset();
    model.close();

    expect(webview.calls).toEqual([]);
    expect(webview.stops).toEqual([]);
  });
});
