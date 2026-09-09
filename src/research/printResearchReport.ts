/** Print the rendered report, preserving its current theme, layout and charts. */
export async function printResearchReport(trigger: HTMLElement): Promise<void> {
  const report = trigger.closest<HTMLElement>(".completed-research-file");
  if (!report) return;
  await document.fonts.ready;
  const frame = document.createElement("iframe");
  frame.title = "Research PDF";
  frame.style.cssText = "position:fixed;left:-100000px;top:0;border:0;";
  frame.style.width = `${Math.ceil(report.getBoundingClientRect().width)}px`;
  frame.style.height = "1000px";
  document.body.append(frame);
  const target = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!target || !printWindow) {
    frame.remove();
    return;
  }
  target.title = `${document.title} · Research File`;
  const clone = report.cloneNode(true) as HTMLElement;
  const originals = [report, ...report.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const pseudoRules: string[] = [];
  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!copy) return;
    const styles = getComputedStyle(original);
    for (const pseudo of ["::before", "::after"]) {
      const decoration = getComputedStyle(original, pseudo);
      if (decoration.content === "none" || decoration.content === "normal")
        continue;
      copy.setAttribute("data-print-node", String(index));
      const declarations = Array.from(decoration)
        .map((key) => `${key}:${decoration.getPropertyValue(key)} !important`)
        .join(";");
      pseudoRules.push(
        `[data-print-node="${index}"]${pseudo}{${declarations};-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}`,
      );
    }
    for (const key of Array.from(styles))
      copy.style.setProperty(key, styles.getPropertyValue(key), "important");
    copy.style.setProperty("-webkit-print-color-adjust", "exact", "important");
    copy.style.setProperty("print-color-adjust", "exact", "important");
    copy.style.setProperty("animation", "none", "important");
    copy.style.setProperty("transition", "none", "important");
    if (styles.position === "sticky" || styles.position === "fixed")
      copy.style.setProperty("position", "static", "important");
    if (original instanceof HTMLCanvasElement) {
      const image = target.createElement("img");
      image.src = original.toDataURL("image/png");
      image.style.cssText = copy.style.cssText;
      copy.replaceWith(image);
    }
  });
  clone
    .querySelectorAll(
      ".research-theme-toggle, .completed-research-file__footer > div",
    )
    .forEach((element) => {
      element.remove();
    });
  const base = target.createElement("base");
  base.href = document.baseURI;
  target.head.append(base);
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const fontRules = Array.from(sheet.cssRules)
        .filter((rule) => rule.type === CSSRule.FONT_FACE_RULE)
        .map((rule) => rule.cssText)
        .join("\n");
      if (fontRules) {
        const style = target.createElement("style");
        style.textContent = fontRules;
        target.head.append(style);
      }
    } catch {
      /* Cross-origin font stylesheets remain available through their link. */
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.append(link);
      }
    }
  }
  const width = Math.ceil(report.getBoundingClientRect().width);
  const style = target.createElement("style");
  style.textContent = `@page { size: ${width}px ${Math.ceil(width * 1.414)}px; margin: 0; } html, body { margin: 0; padding: 0; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`;
  style.textContent += pseudoRules.join("\n");
  target.head.append(style);
  clone.style.setProperty("width", `${width}px`, "important");
  clone.style.setProperty("max-width", "none", "important");
  clone.style.setProperty("overflow", "visible", "important");
  target.body.style.width = `${width}px`;
  target.body.style.backgroundColor = getComputedStyle(report).backgroundColor;
  target.body.append(clone);
  for (const image of Array.from(target.images)) image.loading = "eager";
  await Promise.all(
    Array.from(target.images).map((image) =>
      image.decode().catch(() => undefined),
    ),
  );
  await target.fonts.ready;
  printWindow.addEventListener("afterprint", () => frame.remove(), {
    once: true,
  });
  printWindow.focus();
  printWindow.print();
}
