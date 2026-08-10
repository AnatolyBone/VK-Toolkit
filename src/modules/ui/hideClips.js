export const clipsCss = `
  a[href^="/clips"], a[href*="/video/clips"], [data-testid*="clip"], [class*="ClipsCarousel"] { display:none !important; }
`;
export const compactMenuCss = `
  #side_bar .left_label, [class*="LeftMenuItem__label"] { font-size:12px !important; }
  #side_bar ol li, [class*="LeftMenuItem"] { min-height:30px !important; }
`;
export function mountStyle(id, css) { const style = document.createElement('style'); style.id = id; style.textContent = css; document.documentElement.appendChild(style); return style; }
