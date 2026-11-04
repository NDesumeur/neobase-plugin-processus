// Processus : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle tourne dans le bac à sable de NeoBase, avec ses outils d'interface (ctx.host) et seulement les autorisations de son plugin.json.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Processus</span><span class=\"hint\" id=\"prInfo\"></span></div>\n      <div class=\"row\"><input class=\"f\" id=\"prFilter\" placeholder=\"Filtrer…\" spellcheck=\"false\" style=\"flex:1\"><select class=\"f\" id=\"prSort\" style=\"width:220px\"><option value=\"cpu\">Trier : processeur</option><option value=\"mem\">Trier : mémoire</option><option value=\"name\">Trier : nom</option></select></div>\n      <div class=\"sysCard px\"><div class=\"prRow head\"><span></span><span>Programme</span><span>Processeur</span><span>Mémoire</span><span></span></div><div id=\"prList\"></div></div>\n      <div class=\"hint\">« Fermer » force la fermeture, comme « Fin de tâche » dans le Gestionnaire des tâches. Les programmes indispensables à Windows sont protégés.</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.prRow{display:grid;grid-template-columns:24px 1fr 100px 100px 90px;gap:12px;align-items:center;padding:6px 4px;font-size:15px;border-bottom:1px solid rgba(255,255,255,.05)}
.prRow img{width:20px;height:20px;object-fit:contain}
.prRow .tn{color:#fff;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prRow small{display:block;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.prRow .v{text-align:right;color:var(--lilac)}
.prRow .v.hot{color:var(--pink)}
.prRow .btn{height:30px;font-size:13px;padding:0 10px}
.prRow.head{font:7px var(--title);letter-spacing:1px;color:var(--muted)}
.prRow.head span:nth-child(3),.prRow.head span:nth-child(4){text-align:right}
#prList{max-height:62vh;overflow-y:auto}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const nbConfirm = host.confirm;  // la boîte de confirmation de NeoBase, à la place de celle de Windows
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "procsApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  // ---- ton code d'origine ----
const gb = b => (b / 1073741824).toFixed(b < 107374182400 ? 1 : 0).replace('.', ',') + ' Go';
const mo = b => b >= 1073741824 ? gb(b) : Math.round(b / 1048576) + ' Mo';

/* ---------- Processus app: programs grouped by name, CPU and memory, refreshed every 2 seconds while shown ---------- */
let prTimer = null, prSort = 'cpu', prOpenGroups = new Set();
async function prOpen() {
  clearTimeout(prTimer);
  if (!view.classList.contains('on')) return;
  prTimer = setTimeout(prOpen, 2000);
  let list; try { list = await neo.procList(); } catch (e) { $('prList').replaceChildren(el('div', 'hint', 'Lecture impossible : ' + e.message)); return; }
  const q = $('prFilter').value.trim().toLowerCase(), groups = new Map();
  for (const p of list) { const k = p.name.toLowerCase(); if (!groups.has(k)) groups.set(k, {name: p.name, procs: [], cpu: 0, mem: 0, title: '', path: '', protected: false}); const gr = groups.get(k); gr.procs.push(p); gr.cpu += p.cpu; gr.mem += p.mem; gr.title ||= p.title; gr.path ||= p.path; gr.protected ||= p.protected; }
  const rows = [...groups.values()].filter(gr => !q || (gr.name + ' ' + gr.title).toLowerCase().includes(q)).sort(prSort === 'mem' ? (a, b) => b.mem - a.mem : prSort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'fr') : (a, b) => b.cpu - a.cpu || b.mem - a.mem);
  const cpu = [...groups.values()].reduce((s, gr) => s + gr.cpu, 0);
  $('prInfo').textContent = list.length + ' processus · ' + groups.size + ' programmes · processeur ' + Math.round(cpu) + ' %';  // no memory total: shared memory would be counted several times
  $('prList').replaceChildren(...rows.slice(0, 150).map(gr => {
    const r = el('div', 'prRow'), ic = el('img'), n = el('div', 'tn'), x = el('button', 'btn px', 'Fermer');
    ic.onerror = () => ic.style.visibility = 'hidden'; if (gr.path) neo.exeIcon(gr.path).then(u => { ic.src = u; }, () => ic.onerror()); else ic.onerror();  // l'icône du programme, donnée par NeoBase
    n.append(gr.name + (gr.procs.length > 1 ? ' (' + gr.procs.length + ')' : ''), el('small', '', gr.title || gr.path || ''));
    x.disabled = gr.protected; x.title = gr.protected ? 'Programme de Windows : le fermer pourrait bloquer le PC' : 'Forcer la fermeture';
    x.onclick = async () => {
      if (!await nbConfirm('Forcer la fermeture de « ' + gr.name + ' »' + (gr.procs.length > 1 ? ' (' + gr.procs.length + ' processus)' : '') + ' ?\nCe qui n\'est pas enregistré dans ce programme sera perdu.')) return;
      const r = await neo.procEnd(gr.procs.map(p => p.pid));
      toast(r.failed.length ? 'Fermé en partie : ' + r.failed.length + ' processus refusé(s) (droits administrateur ?)' : gr.name + ' fermé', !!r.failed.length);
      prOpen();
    };
    r.append(ic, n, el('span', 'v' + (gr.cpu > 25 ? ' hot' : ''), gr.cpu.toFixed(1).replace('.', ',') + ' %'), el('span', 'v', mo(gr.mem)), x);
    return r;
  }));
}
$('prFilter').oninput = () => prOpen();
$('prSort').onchange = e => { prSort = e.target.value; prOpen(); };  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { prOpen(); });
}
