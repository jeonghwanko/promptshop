// The game's name and brand files. Change the name here only: the page (isles.html tokens), the server's link
// previews (server/main.mjs), the dev server (scripts/dev.mjs) and the game's HUD, panel and invite all read it.
// oddbout.com lists the same game from crashbang-heroes kaito_web/src/creator/portal-games.json (key "islands").
export const BRAND = Object.freeze({
  name: '팝업섬',
  nameEn: 'POPISLE',
  tagline: '한 줄을 쓰면 Claude가 가게를 지어요. 옆 섬에 살면서 다리를 놓아요.',
  icon: '/src/brand/icon-192.webp',
  touchIcon: '/src/brand/icon-180.png',
  logo: '/src/brand/logo.webp',
  og: 'src/brand/og.png',   // served as /og/default.png
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Fills `%brand.<key>%` in a page. A key the brand does not have is an error, so a typo cannot ship. */
export function brandPage(html) {
  return html.replace(/%brand\.([a-zA-Z]+)%/g, (token, key) => {
    if (!(key in BRAND)) throw new Error(`src/brand.js has no ${token}`);
    return esc(BRAND[key]);
  });
}
