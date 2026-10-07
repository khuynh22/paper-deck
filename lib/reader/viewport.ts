/** Bottom of the sticky navigation, plus breathing room for resumed content. */
export function readerViewportTop(): number {
  const header = document.querySelector<HTMLElement>("[data-reader-header]");
  return header ? header.getBoundingClientRect().bottom + 12 : 72;
}

/** DOM offsetTop can be relative to a nested positioned ancestor. */
export function scrollTopForElement(element: Element): number {
  return Math.max(0, window.scrollY + element.getBoundingClientRect().top - readerViewportTop());
}
