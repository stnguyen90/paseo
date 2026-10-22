/** The slice of Electron's `<webview>` find API the model drives. */
export interface FindableWebview {
  findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number;
  stopFindInPage(action: "clearSelection" | "keepSelection" | "activateSelection"): void;
}

/** The `result` of a webview `found-in-page` event. */
export interface FoundInPageResult {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
}

export interface BrowserFindSnapshot {
  open: boolean;
  query: string;
  /** Null until the page reports on the current query. */
  current: number | null;
  total: number;
}

const CLOSED: BrowserFindSnapshot = { open: false, query: "", current: null, total: 0 };

/** Chromium owns matching, highlighting, and scrolling; this tracks the query and count. */
export class BrowserFindModel {
  private listeners = new Set<() => void>();
  private snapshot = CLOSED;
  private requestId: number | null = null;

  constructor(private readonly getWebview: () => FindableWebview | null) {}

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.snapshot;

  readonly open = () => {
    if (!this.snapshot.open) this.set({ ...this.snapshot, open: true });
  };

  readonly close = () => {
    if (!this.snapshot.open) return;
    this.stop();
    // Keep the query so reopening resumes it, as the other panes do.
    this.set({ ...CLOSED, query: this.snapshot.query });
  };

  readonly setQuery = (query: string) => {
    this.set({ ...this.snapshot, query, current: null, total: 0 });
    if (query) this.find({ findNext: true });
    else this.stop();
  };

  readonly next = () => this.step(true);
  readonly previous = () => this.step(false);

  /** A new document has no highlights; search it again for the open query. */
  readonly reset = () => {
    if (!this.snapshot.open) return;
    this.requestId = null;
    this.set({ ...this.snapshot, current: null, total: 0 });
    if (this.snapshot.query) this.find({ findNext: true });
  };

  readonly handleResult = (result: FoundInPageResult) => {
    // Chromium reports each request in several updates and late updates for
    // superseded queries; keep only the latest request.
    if (!this.snapshot.open || result.requestId !== this.requestId) return;
    this.set({ ...this.snapshot, current: result.activeMatchOrdinal, total: result.matches });
  };

  private step(forward: boolean) {
    if (this.snapshot.open && this.snapshot.query) this.find({ forward, findNext: false });
  }

  private find(options: { forward?: boolean; findNext: boolean }) {
    const webview = this.getWebview();
    try {
      this.requestId = webview ? webview.findInPage(this.snapshot.query, options) : null;
    } catch {
      // Electron throws until the webview's first dom-ready; reset() searches then.
      this.requestId = null;
    }
  }

  private stop() {
    this.requestId = null;
    this.getWebview()?.stopFindInPage("clearSelection");
  }

  private set(snapshot: BrowserFindSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
