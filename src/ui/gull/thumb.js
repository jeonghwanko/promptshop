// 끼룩이 as the guide's portrait: three drawn faces (talking, thinking, cheering) on one image that bobs while the words
// type out. Same calls as the old live gull (talk, cheer, point), so the guide does not care which one it has.
const face = (k) => new URL(`./kkiruk-${k}.webp`, import.meta.url).href;
const FACES = { talk: face('talk'), think: face('think'), cheer: face('cheer') };
export function mountThumbGull(host) {
  for (const u of Object.values(FACES)) { const i = new Image(); i.src = u; }   // all three ready before they are needed
  const img = document.createElement('img'); img.className = 'gthumb'; img.alt = '끼룩이'; img.draggable = false; img.src = FACES.talk;
  host.replaceChildren(img);
  let mood = 'talk', cheerT = 0;
  const show = (k) => { const u = FACES[k] ?? FACES.talk; if (!img.src.endsWith(u)) img.src = u; };
  return {
    talk(on) { img.classList.toggle('talking', !!on); },
    /** A face for the step (talk | think); a cheer in progress keeps its face until it ends. */
    mood(k) { mood = k ?? 'talk'; if (!cheerT) show(mood); },
    cheer() { clearTimeout(cheerT); show('cheer'); img.classList.remove('hop'); void img.offsetWidth; img.classList.add('hop'); cheerT = setTimeout(() => { cheerT = 0; img.classList.remove('hop'); show(mood); }, 1600); },
    point() {},   // the card's tail points now
  };
}
