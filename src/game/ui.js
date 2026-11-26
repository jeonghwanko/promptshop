// Small DOM helpers every screen of the game uses.
import { iconEl } from '../ui/icons.js';

export const $ = (id) => document.getElementById(id);
/** el('div', { class, on: { click }, ...attributes }, ...children): children may be nodes, strings, arrays, null or false. */
export const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'class') e.className = v; else e.setAttribute(k, v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c))); return e; };
/** A round close button with the pixel ✕. */
export const xbtn = (fn) => { const b = el('button', { class: 'xb', on: { click: fn } }); b.append(iconEl('close', 22, '')); return b; };
