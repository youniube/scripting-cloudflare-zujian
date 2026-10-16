// Browser QA of the generated TSX reference, not a SwiftUI/iOS renderer.
// Call after navigation; pass true for a deliberately wider font.
(wide = false) => {
  for (const card of document.querySelectorAll("[data-widget]")) {
    card.style.fontFamily = wide ? '"Courier New", monospace' : ""
    card.style.letterSpacing = wide ? "1.5px" : ""
  }
  fitReferences()
  const issues = [], cards = [], range = document.createRange()
  for (const card of document.querySelectorAll("[data-widget]")) {
    const bounds = card.getBoundingClientRect(), scale = bounds.width / parseFloat(card.style.width)
    for (const text of card.querySelectorAll('[data-native="Text"]')) {
      const box = text.getBoundingClientRect()
      if (text.dataset.fixedVertical === "true" && Number(text.dataset.fontTarget) >= 10 && parseFloat(getComputedStyle(text).fontSize) < 9) issues.push({ widget: card.dataset.widget, kind: "unreadable-number-or-name", text: text.textContent })
      if (box.left < bounds.left + 5 * scale || box.right > bounds.right - 5 * scale || box.top < bounds.top + 5 * scale || box.bottom > bounds.bottom - 5 * scale) issues.push({ widget: card.dataset.widget, kind: "edge", text: text.textContent })
      if (/^(?:[\d,]+(?:\.\d+)?|—)$/.test(text.textContent)) {
        range.selectNodeContents(text)
        if (range.getBoundingClientRect().width > box.width + scale) issues.push({ widget: card.dataset.widget, kind: "number-truncated", text: text.textContent })
      }
    }
    const pairs = [...card.querySelectorAll('[data-native="HStack"]')].filter(row => row.style.height === "36px")
    const gaps = pairs.map(row => {
      const text = row.firstElementChild, ring = row.lastElementChild
      range.selectNodeContents(text)
      const gap = (ring.getBoundingClientRect().left - range.getBoundingClientRect().right) / scale
      if (gap < 6) issues.push({ widget: card.dataset.widget, kind: "number-ring-collision", gap })
      return { value: text.textContent, font: getComputedStyle(text).fontSize, gap }
    })
    const content = card.firstElementChild.firstElementChild
    const footer = content.lastElementChild, previous = footer.previousElementSibling
    const footerGap = (footer.getBoundingClientRect().top - previous.getBoundingClientRect().bottom) / scale
    if (footerGap < 1 || footerGap > 10) issues.push({ widget: card.dataset.widget, kind: "footer-gap", gap: footerGap })
    for (const row of card.querySelectorAll('[data-native="HStack"]')) {
      if (row.style.height !== "14px" || row.children.length !== 2 || [...row.children].some(child => child.dataset.native !== "Text")) continue
      const a = row.firstElementChild.getBoundingClientRect(), b = row.lastElementChild.getBoundingClientRect()
      if (b.left - a.right < 3 * scale) issues.push({ widget: card.dataset.widget, kind: "name-value-columns", text: row.textContent })
    }
    cards.push({ widget: card.dataset.widget, gaps, footerGap })
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push({ kind: "page-horizontal-overflow" })
  return { viewport: innerWidth, wide, issues, cards }
}
