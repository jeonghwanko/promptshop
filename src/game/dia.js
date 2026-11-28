// Diamonds (2026-11-28): the top bar shows them, a tap opens the shop. Builds past the five free a day take a build ticket,
// else 50 diamonds (server/shop.mjs keeps the wallet; the island doc never holds it). Packs are paid on Polar, in dollars;
// coming back (?paid=<checkout>), the page asks until the server has seen Polar's payment.
import { site, S } from './state.js';
import { track } from './persist.js';
import { toast } from './hud.js';
import { $, el, xbtn } from './ui.js';
import { iconEl } from '../ui/icons.js';

let view = null, busy = false;
const won = (n) => `약 ${n.toLocaleString('ko-KR')}원`, usd = (c) => `$${(c / 100).toFixed(2)}`;

/** Ask the server for my wallet and the packs (nothing on a page without the hosted server, or with the shop off). */
export async function loadDia() {
  if (!site?.shop) return null;
  try { view = await site.shop(); } catch { return null; }
  drawDia(); return view;
}
/** The top bar's diamonds: shown once the shop is open, with tickets beside them when I have some. */
export function drawDia() {
  const b = $('diab'); if (!b) return;
  b.hidden = !view?.enabled || !S.myDoc;   // once I have an island (not on the showcase)
  if (b.hidden) return;
  b.replaceChildren(...[iconEl('dia', 26, ''), el('b', {}, Math.max(0, view.dia).toLocaleString('ko-KR')), view.builds > 0 ? el('small', { class: 'tk' }, iconEl('hammer', 16, ''), String(view.builds)) : null].filter(Boolean));
}

/** The shop. why = 'limit' when a build was refused because today's free ones are used up. */
export async function openDiaShop(why = '') {
  if (!site?.shop) return false;
  if (!view) await loadDia(); if (!view?.enabled) return false;
  document.getElementById('diashop')?.remove(); track('shop_open', { why });
  const close = () => box.remove();
  // what a pack is worth in builds, first: tickets + diamonds ÷ 50 (2026-11-28 "총 20회 + 10회(500다이아)로 안내되어야 이해")
  const pack = (x) => { const byDia = Math.floor(x.dia / view.buildDia), total = x.builds + byDia;
    return el('button', { class: 'pack' + (x.sku === 'starter' ? ' first' : ''), on: { click: () => buy(x.sku, btnOf(x.sku)) }, 'data-sku': x.sku },
      el('span', { class: 'got' }, el('span', { class: 'total' }, iconEl('hammer', 24, ''), el('b', {}, `짓기 ${total}번`)),
        el('small', { class: 'parts' }, x.builds ? `짓기권 ${x.builds}번 + ` : '', iconEl('dia', 16, ''), `${x.dia.toLocaleString('ko-KR')} (${byDia}번)`)),
      el('span', { class: 'price' }, el('b', {}, won(x.won)), el('small', {}, usd(x.cents)))); };
  const btnOf = (sku) => box.querySelector(`[data-sku="${sku}"]`);
  const packs = view.packs.some(x => x.sku === 'starter') ? view.packs.filter(x => x.sku === 'starter') : view.packs;   // the first purchase alone, until it is bought
  const box = el('div', { class: 'diashop', id: 'diashop', role: 'dialog', 'aria-label': '다이아 상점', on: { pointerdown: (e) => { if (e.target === box) close(); } } },
    el('div', { class: 'shopcard' }, xbtn(close),
      el('h2', {}, why === 'limit' ? '오늘 무료 짓기를 다 썼어요' : '다이아'),
      el('div', { class: 'have' }, iconEl('dia', 22, ''), el('b', {}, Math.max(0, view.dia).toLocaleString('ko-KR')), iconEl('hammer', 20, ''), el('b', {}, `짓기권 ${view.builds}`), el('small', {}, `짓기 1번 = ${view.buildDia}다이아`)),
      el('div', { class: 'packs' }, ...packs.map(pack)),
      el('p', { class: 'fine' }, '결제는 Polar에서 달러로 해요. 구매 후 3일 이내, 쓰지 않은 짓기권 · 다이아만 환불해 드려요.')));
  document.body.append(box);
  return true;
}
async function buy(sku, btn) {
  if (busy) return; busy = true; if (btn) btn.disabled = true; track('shop_checkout', { sku });
  try { location.href = await site.checkout(sku); }
  catch (e) { busy = false; if (btn) btn.disabled = false; toast(e?.message === 'starter_bought' ? '첫 결제 묶음은 이미 받았어요' : '결제창을 열지 못했어요. 잠시 뒤 다시 눌러 주세요', 2600); }
}

/** Back from Polar: wait for the server to see the payment, then say what came in (and once, how to keep it on another device). */
export async function paidReturn() {
  const q = new URLSearchParams(location.search), id = q.get('paid'); if (!id || !site?.shop) return;
  q.delete('paid'); history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash);
  const before = view ?? await loadDia(); toast('결제를 확인하고 있어요…', 3000);
  for (let i = 0; i < 30; i++) {
    let v; try { v = await site.shop(id); } catch { v = null; }
    if (v?.order === 'paid') {
      view = v; drawDia(); track('shop_paid', { checkout: id });
      const dd = v.dia - (before?.dia ?? 0), db = v.builds - (before?.builds ?? 0);
      toast(`받았어요 · ${db > 0 ? `짓기 ${db}번 + ` : ''}다이아 ${Math.max(dd, 0).toLocaleString('ko-KR')}`, 4200);
      setTimeout(() => toast('다른 기기에서도 쓰려면 · 내 섬 창의 ‘내 섬 열쇠’를 저장해 두세요', 5000), 4600);
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  toast('결제 확인이 늦어지고 있어요. 조금 뒤 다이아를 눌러 확인해 주세요', 5000);
}
