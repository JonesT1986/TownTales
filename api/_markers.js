// Place markers (Nov 26 2026): provincial/territorial capitals get a legislature-building marker, other cities
// a small city marker, towns keep the normal look. Driven by towns.place_kind. Same drawings as towntales-more.js.
const CAP_SVG = '<svg class="tt-mk-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="#B4512C" stroke="#1E2930" stroke-width="1.5" stroke-linejoin="round">' +
  '<path d="M12 2v2.2"/><path d="M7.5 9.5a4.5 4.5 0 0 1 9 0z"/><rect x="9" y="9.5" width="6" height="1.8"/><path d="M3 12.5L12 11l9 1.5z"/></g>' +
  '<g fill="#FFFCF3" stroke="#1E2930" stroke-width="1.5"><rect x="4" y="12.5" width="16" height="7.5"/></g>' +
  '<path d="M7 13.5v5.5M10.3 13.5v5.5M13.7 13.5v5.5M17 13.5v5.5" stroke="#1E2930" stroke-width="1.4"/>' +
  '<rect x="2.5" y="20" width="19" height="2" fill="#1E2930"/></svg>';
const CITY_SVG = '<svg class="tt-mk-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="#2B5C80" stroke="#1E2930" stroke-width="1.5" stroke-linejoin="round">' +
  '<rect x="3" y="11" width="6" height="10"/><rect x="9" y="5" width="6" height="16"/><rect x="15" y="9" width="6" height="12"/></g>' +
  '<path d="M11 8h2M11 11h2M11 14h2M5 14h2M17 12h2M17 15h2" stroke="#FFFCF3" stroke-width="1.3"/></svg>';
const LABEL = { capital: 'Provincial or territorial capital', city: 'City' };
function mark(kind) {
  if (kind !== 'capital' && kind !== 'city') return '';
  return `<span class="tt-mk tt-mk-${kind}" title="${LABEL[kind]}" role="img" aria-label="${LABEL[kind]}">${kind === 'capital' ? CAP_SVG : CITY_SVG}</span>`;
}
const CSS = '.tt-mk{display:inline-flex;vertical-align:-0.12em;margin-right:.3em;line-height:0}.tt-mk-svg{width:1em;height:1em;display:block}' +
  '.tt-mk-capital .tt-mk-svg{width:1.15em;height:1.15em}.tt-mk-city .tt-mk-svg{width:.8em;height:.8em}' +
  '.tt-mk-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.92rem;color:var(--ink-2,#46525A);margin:0}';
function legend(kinds) {
  const has = (k) => kinds.includes(k);
  if (!has('capital') && !has('city')) return '';
  return `<p class="tt-mk-legend">${has('capital') ? `<span>${mark('capital')}Capital</span>` : ''}${has('city') ? `<span>${mark('city')}City</span>` : ''}<span>Others are towns and villages</span></p>`;
}
module.exports = { mark, legend, CSS };
