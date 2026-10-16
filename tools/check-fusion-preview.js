// Run this async function in a browser displaying docs/widget-fusion-preview.html.
// It measures rendered text, rather than relying on flex/grid container bounds.
async () => {
  const report=[];
  const frames=async () => {await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
  const stress=document.createElement("style");
  stress.id="fusion-glyph-regression-font";
  document.head.append(stress);
  const originalTheme=document.querySelector("[data-theme-choice][aria-pressed=true]").dataset.themeChoice;
  const originalScenario=window.FusionPreview.getScenario();
  function measure(font,theme,state) {
    const issues=[];
    const rows=[];
    for (const row of document.querySelectorAll(".small-main,.workers-value-row,.dual-value-row")) {
      const number=row.querySelector(".main-value,.dual-value"),ring=row.querySelector(".donut");
      const card=row.closest(".widget"),scale=card.getBoundingClientRect().width/card.offsetWidth;
      const range=document.createRange();
      range.selectNodeContents(number);
      const glyph=range.getBoundingClientRect(),box=number.getBoundingClientRect(),circle=ring.getBoundingClientRect();
      const gap=(circle.left-glyph.right)/scale,required=parseFloat(getComputedStyle(row).columnGap);
      const item={widget:card.className,text:number.textContent,fontSize:parseFloat(getComputedStyle(number).fontSize),glyphWidth:glyph.width/scale,boxWidth:box.width/scale,gap,required};
      rows.push(item);
      if (glyph.right>box.right+.5*scale || glyph.left<box.left-.5*scale) issues.push({kind:"glyph-outside-number-column",...item});
      if (gap<required-.5) issues.push({kind:"glyph-too-close-to-ring",...item});
      if (font==="default" && state==="normal" && number.matches(".main-value") && item.fontSize!==28) issues.push({kind:"normal-font-size-changed",...item});
    }
    for (const card of document.querySelectorAll(".widget")) {
      const bounds=card.getBoundingClientRect();
      for (const node of card.querySelectorAll(".main-value,.dual-value,.ai-strip-head,.footer,.rank-line,.remaining-row,.dual-remaining")) {
        const box=node.getBoundingClientRect();
        if (box.left<bounds.left+1 || box.right>bounds.right-1 || box.top<bounds.top+1 || box.bottom>bounds.bottom-2) issues.push({kind:"widget-edge",widget:card.className,text:node.textContent});
      }
      for (const node of card.querySelectorAll(".ai-strip-value")) {
        const range=document.createRange();range.selectNodeContents(node);
        const glyph=range.getBoundingClientRect(),box=node.getBoundingClientRect();
        if (glyph.right>box.right+.75) issues.push({kind:"ai-strip-value-overflow",widget:card.className,text:node.textContent});
      }
    }
    if (document.documentElement.scrollWidth>innerWidth) issues.push({kind:"page-horizontal-overflow"});
    if (state==="warning" && document.querySelector("[data-value=errorRate]").textContent!=="0.024%") issues.push({kind:"positive-error-rate-rounded-to-zero"});
    if (state==="unknown" && ![...document.querySelectorAll("[data-value=ai]")].every(node=>node.textContent==="—")) issues.push({kind:"unknown-ai-not-preserved"});
    report.push({width:innerWidth,font,theme,state,rows,issues});
  }
  try {
    for (const font of ["default","wide"]) {
      stress.textContent=font==="wide" ? '.numeral{font-family:"Courier New",monospace!important;letter-spacing:1.5px!important}' : "";
      await document.fonts.ready;
      for (const theme of ["dark","light"]) {
        document.querySelector('[data-theme-choice="'+theme+'"]').click();
        for (const state of ["normal","warning","unknown","paid"]) {
          document.querySelector("#scenario").value=state;
          document.querySelector("#scenario").dispatchEvent(new Event("change",{bubbles:true}));
          await frames();
          measure(font,theme,state);
        }
        // Exercise the extra digit at the free-limit boundary without adding fake API scenarios.
        document.querySelectorAll(".main-value,.dual-value").forEach(node=>{node.textContent=node.dataset.value==="ai"?"10,000.0":"100,000"});
        window.dispatchEvent(new Event("resize"));
        await frames();
        measure(font,theme,"100000-boundary");
      }
    }
  } finally {
    stress.remove();
    window.FusionPreview.setTheme(originalTheme);
    window.FusionPreview.setScenario(originalScenario);
    await frames();
  }
  return {layout:document.documentElement.dataset.layout,cases:report.length,passed:report.every(item=>!item.issues.length),report};
}
