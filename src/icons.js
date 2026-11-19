// Line icons (stroke uses currentColor so they take the gold from CSS).
const P = {
  chart: '<path d="M4 44h40"/><rect x="7" y="30" width="7" height="12"/><rect x="18" y="22" width="7" height="20"/><rect x="29" y="26" width="7" height="16"/><rect x="40" y="14" width="0" height="0"/><path d="M8 24l12-9 9 6 13-12"/><path d="M36 9h6v6"/>',
  desk: '<circle cx="24" cy="8" r="4"/><path d="M17 20c0-4 3-6 7-6s7 2 7 6"/><rect x="6" y="20" width="36" height="7"/><path d="M10 27v15h28V27"/>',
  floorplan: '<path d="M6 6h14v8M20 22v20H6V6"/><path d="M20 6h22v36H26"/><path d="M26 30h16M32 6v10M6 24h8"/><circle cx="33" cy="22" r="1.5"/>',
  analysis: '<rect x="5" y="10" width="26" height="26"/><path d="M11 30v-6M17 30v-11M23 30v-8"/><circle cx="34" cy="31" r="8"/><path d="M40 37l5 5"/>',
  doc: '<path d="M12 4h17l9 9v31H12z"/><path d="M29 4v9h9"/><path d="M17 33l5-6 5 4 6-8"/>',
  trophy: '<path d="M16 6h16v10a8 8 0 0 1-16 0z"/><path d="M16 9H9v3a6 6 0 0 0 7 6M32 9h7v3a6 6 0 0 1-7 6"/><path d="M24 24v8M17 42h14M19 42l1-10h8l1 10"/>',
  gear: '<circle cx="24" cy="24" r="6"/><path d="M24 4l3 5 6-1 1 6 5 3-3 5 3 5-5 3-1 6-6-1-3 5-3-5-6 1-1-6-5-3 3-5-3-5 5-3 1-6 6 1z"/>',
  target: '<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="10"/><circle cx="24" cy="24" r="3"/><path d="M24 24L40 8M34 8h6v6"/>',
  layers: '<path d="M24 6L4 16l20 10 20-10z"/><path d="M4 24l20 10 20-10M4 32l20 10 20-10"/>',
  people: '<circle cx="24" cy="13" r="6"/><circle cx="11" cy="17" r="4.5"/><circle cx="37" cy="17" r="4.5"/><path d="M14 40c0-7 4-12 10-12s10 5 10 12M3 38c0-6 3-10 8-10M45 38c0-6-3-10-8-10"/>',
  mail: '<rect x="4" y="10" width="40" height="28" rx="2"/><path d="M4 12l20 15 20-15"/>',
  clock: '<circle cx="24" cy="24" r="18"/><path d="M24 13v12l8 5"/>',
  user: '<circle cx="24" cy="16" r="8"/><path d="M8 42c0-9 7-14 16-14s16 5 16 14"/>',
  lock: '<rect x="9" y="21" width="30" height="22" rx="3"/><path d="M15 21v-6a9 9 0 0 1 18 0v6"/><path d="M24 30v5"/>',
  eye: '<path d="M3 24s8-13 21-13 21 13 21 13-8 13-21 13S3 24 3 24z"/><circle cx="24" cy="24" r="6"/>',
  arrow: '<path d="M6 24h34M30 14l10 10-10 10"/>',
  send: '<path d="M44 4L4 21l16 6 6 17z"/><path d="M44 4L20 27"/>',
  login: '<path d="M28 6h12v36H28"/><path d="M4 24h26M20 14l10 10-10 10"/>',
  chevron: '<path d="M18 10l14 14-14 14"/>',
};
module.exports = function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
};
