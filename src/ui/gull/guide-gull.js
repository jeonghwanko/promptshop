// The guide's 끼룩이: the live voxel gull (gull3d.js) where WebGL2 works, else the flat pre-rendered one (../gull.js).
// Same API either way: { talk(on), cheer(), point([x, y] | null) } — point is a no-op on the flat one.
import { mountGull } from '../gull.js';
import { mountGull3D } from './gull3d.js';

export function mountGuideGull(host) {
  let impl = null; const st = { talk: false, point: null };
  const flat = () => { host.classList.add('flat'); host.style.width = host.style.height = ''; impl = mountGull(host); impl.talk(st.talk); };
  if (typeof WebGL2RenderingContext === 'undefined' || typeof DecompressionStream === 'undefined') flat();
  else mountGull3D(host).then((g) => { impl = g; g.talk(st.talk); g.point(st.point); }).catch((e) => { console.warn('끼룩이: flat fallback', e); flat(); });
  return {
    talk(on) { st.talk = on; impl?.talk(on); },
    cheer() { impl?.cheer(); },
    point(pt) { st.point = pt; impl?.point?.(pt); },
  };
}
