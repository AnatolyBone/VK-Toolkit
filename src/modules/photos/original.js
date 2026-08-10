const VIEWER = '[class*="PhotoViewer"], .pv_photo_wrap, [data-testid="photo-viewer"]';
export class OriginalPhotoTool {
  mount() {
    this.button = document.createElement('a');
    this.button.id = 'vk-toolkit-photo-original';
    this.button.textContent = 'Открыть оригинал'; this.button.target = '_blank'; this.button.rel = 'noopener noreferrer';
    Object.assign(this.button.style, { position: 'fixed', right: '18px', top: '72px', zIndex: '2147483000', display: 'none', padding: '8px 12px', borderRadius: '8px', background: '#447bba', color: '#fff', textDecoration: 'none', font: '13px system-ui' });
    document.documentElement.appendChild(this.button);
    this.refresh = () => this.update();
    this.observer = new MutationObserver(this.refresh); this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
    document.addEventListener('click', this.refresh, true); this.update();
  }
  update() {
    const viewer = document.querySelector(VIEWER);
    const images = [...(viewer || document).querySelectorAll('img[src],source[srcset]')].filter((node) => viewer || node.closest(VIEWER));
    const candidates = images.flatMap((node) => parseCandidates(node.srcset || node.currentSrc || node.src));
    const best = candidates.sort((a, b) => b.width - a.width || scoreUrl(b.url) - scoreUrl(a.url))[0];
    this.button.style.display = best ? 'block' : 'none'; if (best) this.button.href = best.url;
  }
  unmount() { this.observer?.disconnect(); document.removeEventListener('click', this.refresh, true); this.button?.remove(); }
}
function parseCandidates(value = '') { return value.split(',').map((part) => { const [url, size = '0w'] = part.trim().split(/\s+/); return { url, width: parseInt(size, 10) || dimension(url) }; }).filter((item) => /^https?:/.test(item.url)); }
function dimension(url) { const match = url.match(/(?:w|width)[_=-]?(\d{3,5})|_(\d{3,5})x\d{3,5}/i); return Number(match?.[1] || match?.[2] || 0); }
function scoreUrl(url) { return /orig|original|type=3|size=0/i.test(url) ? 1000 : url.length; }
