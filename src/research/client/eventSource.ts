export type ResearchEventSource = {
  readonly listen: (
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) => () => void;
  readonly close: () => void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
};

export function nativeResearchEventSource(url: string): ResearchEventSource {
  const source = new EventSource(url);
  const listeners: (() => void)[] = [];
  let open: (() => void) | null = null;
  let error: (() => void) | null = null;
  source.addEventListener("open", () => open?.());
  source.addEventListener("error", () => error?.());
  return {
    listen(type, listener) {
      const handler = (event: Event) => {
        if (event instanceof MessageEvent && typeof event.data === "string") {
          listener(event);
        }
      };
      source.addEventListener(type, handler);
      const remove = () => source.removeEventListener(type, handler);
      listeners.push(remove);
      return remove;
    },
    close: () => {
      for (const remove of listeners) remove();
      source.close();
    },
    get onopen() {
      return open;
    },
    set onopen(listener) {
      open = listener;
    },
    get onerror() {
      return error;
    },
    set onerror(listener) {
      error = listener;
    },
  };
}

export function scheduleResearchFallback(
  callback: () => void,
  delay: number,
): () => void {
  const timer = window.setTimeout(callback, delay);
  return () => window.clearTimeout(timer);
}

export function reloadAfterReauthentication(): void {
  window.location.reload();
}
