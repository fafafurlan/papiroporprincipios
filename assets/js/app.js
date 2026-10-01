/* ==========================================================================
   Papiro por Princípios — aplicação do banco de questões
   Compartilhada por todas as páginas de banco. Cada página define:
     window.QB_CONFIG    → dados da corporação (chave, títulos, matérias…)
     window.QB_QUESTIONS → lista de questões   (data/questoes_<chave>.js)
     window.QB_IMAGES    → imagens das questões (data/questoes_<chave>.js)
   ========================================================================== */
(function(){
'use strict';

const C = window.QB_CONFIG;
const QUESTIONS = window.QB_QUESTIONS || [];
const IMAGES = window.QB_IMAGES || {};
const ic = window.QB_ICON;
const P = C.key;
const LETTERS = ['A','B','C','D','E'];
const DAY = 86400000;
const REVIEW_INTERVALS = [1, 3, 7, 15, 30]; // dias até rever, por nível de acerto
const HISTORY_MAX = 5000;
const QBY = {};
QUESTIONS.forEach(q => { QBY[q.id] = q; });

/* ---------- Armazenamento ---------- */
const LS = {
  raw(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  setRaw(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
  get(k, def){
    const v = LS.raw(P + '_' + k);
    if(v == null) return def;
    try{ return JSON.parse(v); }catch(e){ return def; }
  },
  set(k, v){ LS.setRaw(P + '_' + k, JSON.stringify(v)); }
};

const answers = LS.get('answers', {});      // id → índice escolhido | 'skip'
const struck = LS.get('struck', {});        // "id-idx" → true
const starred = LS.get('starred', {});      // id → true
const review = LS.get('review', {});        // id → {box, due}
let history = LS.get('history', []);        // [{id, a, t}]
let sims = LS.get('sims', []);              // simulados concluídos
let streak = Number(LS.get('streak', 0)) || 0;
let bestStreak = Math.max(Number(LS.get('best', 0)) || 0, streak);

function today0(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }

// Primeira execução com revisão espaçada: as questões já erradas entram na fila de hoje.
if(!LS.get('review_init', false)){
  Object.keys(answers).forEach(id => {
    const q = QBY[id];
    if(!q || review[id]) return;
    if(answers[id] === 'skip' || answers[id] !== q.correct) review[id] = {box:0, due:today0()};
  });
  LS.set('review', review);
  LS.set('review_init', true);
}

/* ---------- Utilidades ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function norm(s){ return String(s || '').replace(/<[^>]*>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function pct(a, b){ return b ? Math.round(a / b * 100) : 0; }
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
function fmtDate(t){ const d = new Date(t); return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0'); }
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function groupOf(q){ return C.groups ? q.id.split('-')[0] : null; }
function groupLabel(g){ return (C.groups && C.groups[g]) || g; }
function subjectName(s){ return (C.subjects[s] && C.subjects[s].name) || s; }
function subjectShort(s){ return (C.subjects[s] && C.subjects[s].short) || subjectName(s); }
function subjStyle(s){ return '--sc:var(--s-' + s + ', var(--brand-ink));--sbg:var(--s-' + s + '-bg, var(--surface-3));'; }

function status(q){
  const a = answers[q.id];
  if(a === undefined) return 'unanswered';
  if(a === 'skip') return 'skip';
  return a === q.correct ? 'correct' : 'wrong';
}
function isDue(id){ const r = review[id]; return !!r && r.due <= Date.now() && !!QBY[id]; }
function dueIds(){ return Object.keys(review).filter(isDue).sort((a,b) => review[a].due - review[b].due); }

const SUBJECTS = (function(){
  const cnt = {};
  QUESTIONS.forEach(q => { cnt[q.subject] = (cnt[q.subject] || 0) + 1; });
  const order = Object.keys(C.subjects);
  return Object.keys(cnt).sort((a,b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).map(id => ({id, count:cnt[id]}));
})();
const YEARS = Array.from(new Set(QUESTIONS.map(q => q.year))).sort();
const GROUPS = C.groups ? Array.from(new Set(QUESTIONS.map(groupOf))).sort((a,b) => {
  const ya = Math.min.apply(null, QUESTIONS.filter(q => groupOf(q) === a).map(q => q.year));
  const yb = Math.min.apply(null, QUESTIONS.filter(q => groupOf(q) === b).map(q => q.year));
  return ya - yb || groupLabel(a).localeCompare(groupLabel(b));
}) : [];

/* ---------- Ordem (embaralhamento estável) ---------- */
function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let seed = Number(LS.get('seed', 0)) || Math.floor(Math.random() * 1e9);
LS.set('seed', seed);
let rank = {};
function computeRank(){
  const ids = QUESTIONS.map(q => q.id);
  const r = rng(seed);
  for(let i = ids.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  rank = {};
  ids.forEach((id, i) => { rank[id] = i; });
}
computeRank();
const provaRank = {};
QUESTIONS.slice().sort((a,b) => a.year - b.year || String(groupOf(a)).localeCompare(String(groupOf(b))) || a.num - b.num)
  .forEach((q, i) => { provaRank[q.id] = i; });

/* ---------- Estado da tela ---------- */
const view = Object.assign({group:'all', year:'all', subject:'all', status:'all', search:'', order:'shuffle', idx:0}, LS.get('view', {}));
let session = null;   // {label, ids, done:{id:answer}}
let list = [];        // ids exibidos (congelados até mudar o filtro)

function saveView(){ LS.set('view', view); }

const STATUS_OPTS = [
  ['all', 'Todas'],
  ['unanswered', 'Não respondidas'],
  ['wrong', 'Errei'],
  ['correct', 'Acertei'],
  ['skip', 'Não sei'],
  ['starred', 'Favoritas'],
  ['due', 'Revisar hoje']
];

function matches(q, f, ignoreStatus){
  if(f.group !== 'all' && groupOf(q) !== f.group) return false;
  if(f.year !== 'all' && String(q.year) !== String(f.year)) return false;
  if(f.subject !== 'all' && q.subject !== f.subject) return false;
  if(!ignoreStatus && f.status !== 'all'){
    if(f.status === 'starred'){ if(!starred[q.id]) return false; }
    else if(f.status === 'due'){ if(!isDue(q.id)) return false; }
    else if(status(q) !== f.status) return false;
  }
  if(f.search){
    if(!q._hay) q._hay = norm([q.id, q.statement, q.context || '', q.options.join(' ')].join(' '));
    const words = norm(f.search).split(/\s+/).filter(Boolean);
    if(!words.every(w => q._hay.includes(w))) return false;
  }
  return true;
}
function filtered(ignoreStatus){
  const R = view.order === 'prova' ? provaRank : rank;
  return QUESTIONS.filter(q => matches(q, view, ignoreStatus)).sort((a,b) => R[a.id] - R[b.id]);
}
function rebuildList(){
  list = session ? session.ids.slice() : filtered().map(q => q.id);
  if(view.idx >= list.length) view.idx = Math.max(0, list.length - 1);
}
function activeFilterCount(){
  return ['group','year','subject','status'].filter(k => view[k] !== 'all').length + (view.search ? 1 : 0);
}

/* ---------- Registro de respostas ---------- */
function recordAnswer(q, a){
  answers[q.id] = a;
  LS.set('answers', answers);
  history.push({id:q.id, a:a, t:Date.now()});
  if(history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
  LS.set('history', history);
  const ok = a === q.correct;
  const r = review[q.id];
  if(!ok){
    review[q.id] = {box:0, due:today0() + DAY};
  } else if(r){
    const box = r.box + 1;
    if(box >= REVIEW_INTERVALS.length) delete review[q.id];
    else review[q.id] = {box:box, due:today0() + REVIEW_INTERVALS[box] * DAY};
  }
  LS.set('review', review);
  saveSummary();
}
function saveSummary(){
  let answered = 0, correct = 0;
  QUESTIONS.forEach(q => {
    const a = answers[q.id];
    if(a === undefined) return;
    answered++;
    if(a === q.correct) correct++;
  });
  LS.set('summary', {total:QUESTIONS.length, answered:answered, correct:correct, due:dueIds().length, t:Date.now()});
}
function updateStreak(ok){
  streak = ok ? streak + 1 : 0;
  LS.set('streak', streak);
  if(streak > bestStreak){ bestStreak = streak; LS.set('best', bestStreak); }
  if(ok && streak > 0 && streak % 5 === 0){
    toast(ic('flame') + '<span>' + streak + ' acertos seguidos! Mandou muito bem!</span>', 'streak');
    confetti();
  }
}

/* ---------- Layout ---------- */
function brandMark(){
  return C.logo.svg ? C.logo.svg : '<img src="' + C.logo.img + '" alt="Brasão">';
}
function buildLayout(){
  const app = document.getElementById('app');
  app.innerHTML = `
  <a class="skip-link" href="#qarea">Pular para a questão</a>
  <header class="appbar">
    <div class="appbar-inner">
      <a class="brand" href="index.html" title="Voltar para o início">
        <span class="brand-mark${C.logo.img ? ' emblem' : ''}">${brandMark()}</span>
        <span class="brand-text">
          <span class="brand-title">${esc(C.name)}</span>
          <span class="brand-sub">${esc(C.subtitle)}</span>
        </span>
      </a>
      <nav class="appnav" aria-label="Ferramentas">
        <button class="btn btn-ghost" id="navReview" title="Revisão (V)">${ic('review')}<span class="nav-label">Revisão</span><span class="badge-count" id="dueBadge" hidden></span></button>
        <button class="btn btn-ghost" id="navSim" title="Simulado (M)">${ic('target')}<span class="nav-label">Simulado</span></button>
        <button class="btn btn-ghost hide-sm" id="navStats" title="Desempenho (G)">${ic('chart')}<span class="nav-label">Desempenho</span></button>
        <button class="icon-btn" id="themeBtn" aria-label="Alternar tema claro/escuro"></button>
        <div class="menu-wrap">
          <button class="icon-btn" id="menuBtn" aria-label="Mais opções" aria-haspopup="true" aria-expanded="false">${ic('more')}</button>
          <div class="menu" id="menu" role="menu">
            <button class="menu-item" role="menuitem" data-act="stats">${ic('chart')}Meu desempenho<kbd>G</kbd></button>
            <button class="menu-item" role="menuitem" data-act="backup">${ic('download')}Backup do progresso</button>
            <button class="menu-item" role="menuitem" data-act="print">${ic('printer')}Imprimir / PDF</button>
            <button class="menu-item" role="menuitem" data-act="keys">${ic('keyboard')}Atalhos de teclado<kbd>?</kbd></button>
            <div class="menu-sep"></div>
            <a class="menu-item" role="menuitem" href="${esc(C.otherBank.href)}">${ic('swap')}Ir para ${esc(C.otherBank.name)}</a>
            <a class="menu-item" role="menuitem" href="index.html">${ic('home')}Página inicial</a>
          </div>
        </div>
      </nav>
    </div>
  </header>

  <div class="scrim" id="scrim"></div>
  <div class="layout">
    <aside class="sidebar" id="sidebar" aria-label="Filtros">
      <div class="drawer-head"><h2>Filtros</h2><button class="icon-btn" id="drawerClose" aria-label="Fechar filtros">${ic('x')}</button></div>
      <section class="panel">
        <div class="progress-card">
          <div class="ring" id="ring"></div>
          <div class="progress-facts" id="progressFacts"></div>
        </div>
      </section>
      <section class="panel">
        <label class="search">
          ${ic('search')}
          <span class="sr-only">Buscar questões</span>
          <input type="search" id="search" placeholder="Buscar no enunciado…" autocomplete="off">
          <button class="search-clear" id="searchClear" type="button" aria-label="Limpar busca">${ic('x','sm')}</button>
        </label>
        <div id="filterGroups" style="margin-top:16px"></div>
        <div class="filter-foot">
          <button class="btn btn-sm" id="clearFilters">${ic('x','sm')}Limpar filtros</button>
          <button class="btn btn-sm" id="orderBtn"></button>
        </div>
      </section>
    </aside>

    <main class="main" id="qarea" tabindex="-1">
      <div class="tiles" id="tiles"></div>
      <div id="sessionBanner"></div>
      <div class="toolbar">
        <button class="btn btn-sm filters-btn" id="filtersBtn">${ic('filter','sm')}Filtros<span class="badge-count" id="filterBadge" hidden></span></button>
        <div class="count" id="countLabel"></div>
        <div class="spacer"></div>
        <button class="btn btn-sm" id="redoWrongBtn" title="Refazer as questões que você errou com os filtros atuais">${ic('redo','sm')}Refazer erradas</button>
      </div>
      <div class="active-filters" id="activeFilters"></div>
      <div class="progressline" aria-hidden="true"><div id="progressFill"></div></div>
      <div id="card"></div>
      <nav class="pager" id="pager" aria-label="Navegação entre questões"></nav>
    </main>
  </div>
  <div class="pager-mobile" id="pagerMobile">
    <button class="btn" id="pmPrev" aria-label="Questão anterior">${ic('left')}Anterior</button>
    <span class="pm-count" id="pmCount"></span>
    <button class="btn btn-primary" id="pmNext" aria-label="Próxima questão">Próxima${ic('right')}</button>
  </div>
  <footer class="footer">Papiro por Princípios · Seu progresso fica salvo neste navegador — faça um <a href="#" id="footBackup">backup</a> de vez em quando.</footer>

  ${modal('statsModal', 'chart', 'Meu desempenho', '<div id="statsBody"></div>', true)}
  ${modal('reviewModal', 'review', 'Revisão', '<div id="reviewBody"></div>')}
  ${modal('simSetupModal', 'target', 'Modo simulado', simSetupHTML())}
  ${modal('simResultModal', 'flag', 'Resultado do simulado', '<div id="simResultBody"></div>', true)}
  ${modal('backupModal', 'download', 'Backup do progresso', backupHTML())}
  ${modal('keysModal', 'keyboard', 'Atalhos de teclado', keysHTML())}

  <section class="sim" id="sim" role="dialog" aria-modal="true" aria-label="Simulado em andamento">
    <div class="sim-top">
      <div><div class="sim-title">Simulado</div><div class="sim-sub" id="simProgress"></div></div>
      <div class="sim-timer" id="simTimer">${ic('clock','sm')}<span></span></div>
      <button class="btn btn-primary btn-sm" id="simFinish">${ic('check','sm')}Finalizar</button>
      <button class="icon-btn" id="simExit" aria-label="Sair do simulado">${ic('x')}</button>
    </div>
    <div class="sim-grid" id="simGrid" aria-label="Mapa de questões"></div>
    <div class="sim-body" id="simBody"></div>
    <div class="sim-bottom">
      <button class="btn" id="simPrev">${ic('left')}Anterior</button>
      <button class="btn" id="simNext">Próxima${ic('right')}</button>
    </div>
  </section>
  <div class="toasts" id="toasts" aria-live="polite"></div>
  `;
  // fora do #app, para continuar visível quando o resto é ocultado na impressão
  const pc = document.createElement('div');
  pc.className = 'print-container';
  pc.id = 'printContainer';
  document.body.appendChild(pc);
}

function modal(id, icon, title, body, wide){
  return `<div class="modal" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
    <div class="modal-box${wide ? ' wide' : ''}">
      <div class="modal-head"><h2 id="${id}-t">${ic(icon)}${title}</h2><button class="icon-btn" data-close aria-label="Fechar">${ic('x')}</button></div>
      <div class="modal-body">${body}</div>
    </div>
  </div>`;
}
function simSetupHTML(){
  return `<p class="modal-desc">Responda como na prova: sem correção imediata e com cronômetro. O resultado — e o gabarito comentado — aparecem no final.</p>
  <div class="opt-group"><span class="fgroup-label">Quantidade de questões</span>
    <div class="seg" id="simQty">
      <button class="chip" data-v="10" aria-pressed="false">10</button>
      <button class="chip" data-v="20" aria-pressed="false">20</button>
      <button class="chip" data-v="40" aria-pressed="true">40</button>
      <button class="chip" data-v="60" aria-pressed="false">60</button>
      <button class="chip" data-v="all" aria-pressed="false">Todas filtradas</button>
    </div></div>
  <div class="opt-group"><span class="fgroup-label">Tempo</span>
    <div class="seg" id="simTime">
      <button class="chip" data-v="0" aria-pressed="false">Sem limite</button>
      <button class="chip" data-v="auto" aria-pressed="true">Automático (3 min/questão)</button>
      <button class="chip" data-v="30" aria-pressed="false">30 min</button>
      <button class="chip" data-v="60" aria-pressed="false">1 h</button>
      <button class="chip" data-v="120" aria-pressed="false">2 h</button>
    </div></div>
  <div class="opt-group"><span class="fgroup-label">Questões</span>
    <div class="seg" id="simPool">
      <button class="chip" data-v="filtered" aria-pressed="true">Seguir filtros atuais</button>
      <button class="chip" data-v="unanswered" aria-pressed="false">Só inéditas</button>
      <button class="chip" data-v="all" aria-pressed="false">Banco inteiro</button>
    </div></div>
  <p class="note" id="simNote"></p>
  <button class="btn btn-primary btn-lg btn-block" id="simStart">${ic('play','sm')}Começar simulado</button>`;
}
function backupHTML(){
  return `<p class="modal-desc">Seu progresso (respostas, favoritas, revisões e simulados) fica guardado somente neste navegador. Exporte um arquivo para não perder nada ao trocar de aparelho ou limpar o navegador.</p>
  <div class="backup-card"><div class="icon-wrap">${ic('download')}</div><div class="grow"><h3>Exportar progresso</h3><p>Baixa um arquivo <b>.json</b> com o progresso dos dois bancos (PMESP e GCM).</p><button class="btn btn-primary btn-sm" id="exportBtn">${ic('download','sm')}Baixar backup</button></div></div>
  <div class="backup-card"><div class="icon-wrap">${ic('upload')}</div><div class="grow"><h3>Importar progresso</h3><p>Restaura um backup feito antes. O progresso atual deste aparelho será substituído.</p><button class="btn btn-sm" id="importBtn">${ic('upload','sm')}Escolher arquivo…</button><input type="file" id="importFile" accept="application/json,.json" hidden></div></div>
  <div class="backup-card danger"><div class="icon-wrap">${ic('trash')}</div><div class="grow"><h3>Recomeçar do zero</h3><p>Apaga respostas, histórico, revisões e simulados deste banco. As favoritas são mantidas.</p><button class="btn btn-danger btn-sm" id="resetBtn">${ic('trash','sm')}Apagar meu progresso</button></div></div>`;
}
function keysHTML(){
  const k = (...a) => a.map(x => '<kbd>' + x + '</kbd>').join('');
  return `<dl class="shortcuts">
    <dt>${k('A')}–${k('E')}</dt><dd>Escolher alternativa (ou ${k('1')}–${k('5')})</dd>
    <dt>${k('Enter')}</dt><dd>Responder · depois, ir para a próxima</dd>
    <dt>${k('N')}</dt><dd>Marcar “Não sei”</dd>
    <dt>${k('←')}${k('→')}</dt><dd>Questão anterior / próxima</dd>
    <dt>${k('F')}</dt><dd>Favoritar a questão</dd>
    <dt>${k('R')}</dt><dd>Refazer a questão atual</dd>
    <dt>${k('/')}</dt><dd>Buscar</dd>
    <dt>${k('V')}</dt><dd>Abrir revisão</dd>
    <dt>${k('M')}</dt><dd>Abrir simulado</dd>
    <dt>${k('G')}</dt><dd>Meu desempenho</dd>
    <dt>${k('T')}</dt><dd>Alternar tema claro/escuro</dd>
    <dt>${k('Esc')}</dt><dd>Fechar janelas</dd>
  </dl>`;
}

/* ---------- Filtros ---------- */
function renderFilters(){
  const counts = (key, val) => QUESTIONS.filter(q => matches(q, Object.assign({}, view, {[key]:val}))).length;
  let h = '';
  if(GROUPS.length){
    h += `<div class="fgroup"><label class="fgroup-label" for="groupSel">${esc(C.groupName || 'Concurso')}</label>
      <select class="fselect" id="groupSel"><option value="all">Todos os concursos</option>
      ${GROUPS.map(g => `<option value="${esc(g)}"${view.group === g ? ' selected' : ''}>${esc(groupLabel(g))} (${QUESTIONS.filter(q => groupOf(q) === g).length})</option>`).join('')}
      </select></div>`;
  }
  h += `<div class="fgroup"><span class="fgroup-label">Ano</span><div class="chips">
    ${chip('year','all','Todos')}${YEARS.map(y => chip('year', String(y), String(y))).join('')}</div></div>`;
  h += `<div class="fgroup"><span class="fgroup-label">Matéria</span><div class="chips">
    ${chip('subject','all','Todas')}
    ${SUBJECTS.map(s => chip('subject', s.id, '<span class="sw" style="--sc:var(--s-' + s.id + ')"></span>' + esc(subjectShort(s.id)), counts('subject', s.id))).join('')}</div></div>`;
  h += `<div class="fgroup"><span class="fgroup-label">Situação</span><div class="chips">
    ${STATUS_OPTS.map(([v,l]) => chip('status', v, l, v === 'all' ? null : counts('status', v))).join('')}</div></div>`;
  $('#filterGroups').innerHTML = h;
  const gs = $('#groupSel');
  if(gs) gs.addEventListener('change', () => setFilter('group', gs.value));
  $$('#filterGroups .chip').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.k, b.dataset.v)));
  $('#orderBtn').innerHTML = view.order === 'prova' ? ic('list','sm') + 'Ordem da prova' : ic('shuffle','sm') + 'Aleatória';
  $('#orderBtn').title = view.order === 'prova' ? 'Mostrando na ordem da prova — clique para embaralhar' : 'Ordem aleatória — clique para ver na ordem da prova';
}
function chip(k, v, label, count){
  const on = String(view[k]) === String(v);
  return `<button class="chip" data-k="${k}" data-v="${esc(v)}" aria-pressed="${on}">${label}${count != null ? ' <span class="count">' + count + '</span>' : ''}</button>`;
}
function setFilter(k, v){
  if(session) endSession(true);
  view[k] = v;
  view.idx = 0;
  saveView();
  rebuildList();
  renderAll();
}
function renderActiveFilters(){
  const items = [];
  if(view.group !== 'all') items.push(['group', groupLabel(view.group)]);
  if(view.year !== 'all') items.push(['year', view.year]);
  if(view.subject !== 'all') items.push(['subject', subjectShort(view.subject)]);
  if(view.status !== 'all') items.push(['status', (STATUS_OPTS.find(s => s[0] === view.status) || [,''])[1]]);
  if(view.search) items.push(['search', '“' + view.search + '”']);
  const el = $('#activeFilters');
  el.innerHTML = session ? '' : items.map(([k,l]) => `<span class="afilter">${esc(l)}<button data-k="${k}" aria-label="Remover filtro ${esc(l)}">${ic('x','sm')}</button></span>`).join('');
  $$('button', el).forEach(b => b.addEventListener('click', () => {
    if(b.dataset.k === 'search'){ $('#search').value = ''; $('#searchClear').classList.remove('show'); setFilter('search', ''); }
    else setFilter(b.dataset.k, 'all');
  }));
  const n = activeFilterCount();
  const badge = $('#filterBadge');
  badge.hidden = !n; badge.textContent = n;
}

/* ---------- Painéis de resumo ---------- */
function renderProgress(){
  let answered = 0, correct = 0, wrong = 0, skip = 0;
  QUESTIONS.forEach(q => {
    const s = status(q);
    if(s === 'unanswered') return;
    answered++;
    if(s === 'correct') correct++; else if(s === 'wrong') wrong++; else skip++;
  });
  const total = QUESTIONS.length;
  const p = pct(answered, total);
  const R = 32, L = 2 * Math.PI * R;
  $('#ring').innerHTML = `<svg viewBox="0 0 76 76" aria-hidden="true"><circle class="track" cx="38" cy="38" r="${R}" stroke-width="7" fill="none"/><circle class="bar" cx="38" cy="38" r="${R}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - answered / total)}"/></svg><div class="ring-label">${p}%<small>do banco</small></div>`;
  $('#ring').setAttribute('role', 'img');
  $('#ring').setAttribute('aria-label', p + '% do banco praticado');
  $('#progressFacts').innerHTML = `<div><b>${answered}</b> de <b>${total}</b> praticadas</div>
    <div><span class="dot ok"></span><b>${correct}</b> acertos</div>
    <div><span class="dot no"></span><b>${wrong}</b> erros</div>
    <div><span class="dot skip"></span><b>${skip}</b> não sei</div>`;

  const decided = correct + wrong;
  const due = dueIds().length;
  $('#tiles').innerHTML = `
    <div class="tile"><span class="tile-label">${ic('book','sm')}Praticadas</span><span class="tile-value">${answered}<small> / ${total}</small></span><span class="tile-sub">${p}% do banco</span></div>
    <div class="tile"><span class="tile-label">${ic('target','sm')}Aproveitamento</span><span class="tile-value">${decided ? pct(correct, decided) + '%' : '—'}</span><span class="tile-sub">${plural(correct, 'acerto', 'acertos')} de ${decided}</span></div>
    <div class="tile"><span class="tile-label">${ic('flame','sm')}Sequência</span><span class="tile-value">${streak}</span><span class="tile-sub">Recorde: ${bestStreak}</span></div>
    <button class="tile action${due ? ' highlight' : ''}" id="tileDue"><span class="tile-label">${ic('review','sm')}Revisar hoje</span><span class="tile-value">${due}</span><span class="tile-sub">${due ? 'Começar revisão →' : 'Tudo em dia'}</span></button>`;
  $('#tileDue').addEventListener('click', () => due ? startDueReview() : openReview());
  const badge = $('#dueBadge');
  badge.hidden = !due; badge.textContent = due;
}

function renderSessionBanner(){
  const el = $('#sessionBanner');
  if(!session){ el.innerHTML = ''; return; }
  const done = Object.keys(session.done).length;
  const ok = Object.keys(session.done).filter(id => session.done[id] === QBY[id].correct).length;
  const finished = done === session.ids.length;
  el.innerHTML = `<div class="session-banner" role="status">
    ${ic(finished ? 'checkCircle' : 'review', 'lg')}
    <div class="sb-text"><b>${esc(session.label)}${finished ? ' — concluída!' : ''}</b>
      ${done} de ${session.ids.length} respondidas · ${plural(ok, 'acerto', 'acertos')}</div>
    <button class="btn btn-sm" id="endSession">${finished ? 'Voltar ao banco' : 'Encerrar revisão'}</button>
  </div>`;
  $('#endSession').addEventListener('click', () => endSession());
}

/* ---------- Cartão da questão ---------- */
let current = null; // controlador do cartão em exibição

function questionHTML(q){
  let h = '';
  if(q.image && IMAGES[q.image]) h += `<div class="qimage"><img src="${IMAGES[q.image]}" alt="Imagem da questão ${q.num}" loading="lazy"></div>`;
  if(q.context) h += `<div class="context">${q.context}</div>`;
  h += `<div class="statement"><span class="qnum">${q.num}.</span> ${q.statement}</div>`;
  return h;
}
function metaHTML(q){
  const g = groupOf(q);
  return `<span class="pill subj" style="${subjStyle(q.subject)}">${esc(subjectShort(q.subject))}</span>
    <span class="pill year">${q.year}</span>
    ${g ? `<span class="pill">${esc(groupLabel(g))}</span>` : ''}`;
}
function optionsHTML(q, prefix){
  return `<div class="options" role="group" aria-label="Alternativas">${q.options.map((o, i) => `
    <div class="opt-row">
      <div class="option" data-i="${i}" role="button" tabindex="0" aria-pressed="false" aria-label="Alternativa ${LETTERS[i]}">
        <span class="letter" aria-hidden="true">${LETTERS[i]}</span><span class="otext">${o}</span>
      </div>
      <button class="cut-btn" data-i="${i}" type="button" aria-pressed="false" aria-label="Riscar alternativa ${LETTERS[i]}" title="Riscar alternativa">${ic('scissors','sm')}</button>
    </div>`).join('')}</div>`;
}

function renderCard(){
  const box = $('#card');
  if(!list.length){
    current = null;
    const hasFilters = activeFilterCount() > 0;
    box.innerHTML = `<div class="empty">${ic('search')}<b>Nenhuma questão encontrada</b>
      ${view.status === 'due' ? 'Você não tem revisões pendentes para hoje. Bom trabalho!' : 'Ajuste os filtros ou o termo de busca para ver mais resultados.'}
      ${hasFilters ? '<div><button class="btn" id="emptyClear">Limpar filtros</button></div>' : ''}</div>`;
    const b = $('#emptyClear'); if(b) b.addEventListener('click', clearFilters);
    return;
  }
  const q = QBY[list[view.idx]];
  const inSession = !!session;
  const saved = inSession ? session.done[q.id] : answers[q.id];
  const st = status(q);
  const stPill = !inSession && st !== 'unanswered'
    ? `<span class="pill status-${st === 'correct' ? 'ok' : st === 'wrong' ? 'no' : 'skip'}">${st === 'correct' ? 'Acertou' : st === 'wrong' ? 'Errou' : 'Não sabia'}</span>` : '';
  const duePill = isDue(q.id) ? '<span class="pill due">Revisar hoje</span>' : '';

  box.innerHTML = `<article class="qcard" style="${subjStyle(q.subject)}" aria-labelledby="qstmt">
    <header class="qhead">
      <div class="qmeta">${metaHTML(q)}${stPill}${duePill}</div>
      <div class="qtools">
        <button class="icon-btn redo-btn" title="Refazer esta questão (R)" aria-label="Refazer questão"${saved === undefined ? ' hidden' : ''}>${ic('redo')}</button>
        <button class="icon-btn star-btn" aria-pressed="${!!starred[q.id]}" title="Favoritar (F)" aria-label="Favoritar questão">${ic('star')}</button>
      </div>
    </header>
    <div class="qbody">
      <div id="qstmt">${questionHTML(q)}</div>
      ${optionsHTML(q)}
      <div class="qactions">
        <button class="btn btn-primary" id="answerBtn" disabled>${ic('check','sm')}Responder</button>
        <button class="btn" id="skipBtn">${ic('help','sm')}Não sei</button>
        <span class="hint">Use <kbd>A</kbd>–<kbd>${LETTERS[q.options.length - 1]}</kbd> e <kbd>Enter</kbd></span>
      </div>
      <div class="result" id="result" aria-live="polite"></div>
      <div id="explBox"></div>
    </div>
    <footer class="qfoot"><span>ID ${esc(q.id)}</span><span class="spacer"></span><span>Questão ${view.idx + 1} de ${list.length}</span></footer>
  </article>`;

  const card = $('.qcard', box);
  const opts = $$('.option', card);
  const cuts = $$('.cut-btn', card);
  const answerBtn = $('#answerBtn', card);
  const skipBtn = $('#skipBtn', card);
  let selected = null;
  let locked = false;

  function select(i){
    if(locked || i >= opts.length) return;
    if(struck[q.id + '-' + i]) toggleCut(i);
    selected = i;
    opts.forEach((o, j) => o.setAttribute('aria-pressed', String(j === i)));
    answerBtn.disabled = false;
  }
  function toggleCut(i){
    if(locked) return;
    const key = q.id + '-' + i;
    const on = !struck[key];
    if(on) struck[key] = true; else delete struck[key];
    LS.set('struck', struck);
    opts[i].classList.toggle('struck', on);
    cuts[i].setAttribute('aria-pressed', String(on));
    if(on && selected === i){ selected = null; opts[i].setAttribute('aria-pressed', 'false'); answerBtn.disabled = true; }
  }
  function lock(a, fresh){
    locked = true;
    opts.forEach((o, i) => {
      o.classList.add('locked');
      o.setAttribute('tabindex', '-1');
      o.setAttribute('aria-pressed', 'false');
      if(i === q.correct) o.classList.add('correct');
      else if(i === a) o.classList.add('wrong');
    });
    cuts.forEach(c => { c.disabled = true; });
    answerBtn.hidden = true; skipBtn.hidden = true;
    const hint = $('.hint', card); if(hint) hint.hidden = true;
    $('.redo-btn', card).hidden = false;
    const r = $('#result', card);
    const last = view.idx >= list.length - 1;
    const nextBtn = last ? '' : `<span class="spacer"></span><button class="btn btn-sm" id="resNext">Próxima${ic('right','sm')}</button>`;
    if(a === 'skip'){ r.className = 'result skip'; r.innerHTML = ic('help') + `<span>Sem problema! A correta é a <b>${LETTERS[q.correct]}</b>.</span>` + nextBtn; }
    else if(a === q.correct){ r.className = 'result ok'; r.innerHTML = ic('checkCircle') + '<span>Você acertou!</span>' + nextBtn; }
    else { r.className = 'result no'; r.innerHTML = ic('xCircle') + `<span>Você errou. A correta é a <b>${LETTERS[q.correct]}</b>.</span>` + nextBtn; }
    const nb = $('#resNext', card);
    if(nb) nb.addEventListener('click', () => go(1));
    $('#explBox', card).innerHTML = explHTML(q);
    if(fresh && nb) nb.focus({preventScroll:true});
  }
  function answer(a){
    if(locked) return;
    if(a === undefined){ if(selected === null) return; a = selected; }
    recordAnswer(q, a);
    if(session){ session.done[q.id] = a; renderSessionBanner(); }
    updateStreak(a === q.correct);
    lock(a, true);
    renderProgress();
    renderPager();
    renderFilters();
  }
  function redo(){
    if(!locked) return;
    if(session){ delete session.done[q.id]; }
    else { delete answers[q.id]; LS.set('answers', answers); saveSummary(); }
    renderCard(); renderProgress(); renderPager(); renderSessionBanner(); renderFilters();
    const first = $('.option', box); if(first) first.focus({preventScroll:true});
  }
  function star(){
    const b = $('.star-btn', card);
    if(starred[q.id]) delete starred[q.id]; else starred[q.id] = true;
    LS.set('starred', starred);
    b.setAttribute('aria-pressed', String(!!starred[q.id]));
    toast(ic('star', 'sm') + (starred[q.id] ? 'Adicionada às favoritas' : 'Removida das favoritas'));
  }

  opts.forEach((o, i) => {
    if(struck[q.id + '-' + i]){ o.classList.add('struck'); cuts[i].setAttribute('aria-pressed', 'true'); }
    o.addEventListener('click', () => select(i));
    o.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        if(selected === i && e.key === 'Enter') answer(); else select(i);
      }
    });
  });
  cuts.forEach((c, i) => c.addEventListener('click', () => toggleCut(i)));
  answerBtn.addEventListener('click', () => answer());
  skipBtn.addEventListener('click', () => answer('skip'));
  $('.redo-btn', card).addEventListener('click', redo);
  $('.star-btn', card).addEventListener('click', star);
  $$('.qimage img, .option img', card).forEach(img => img.addEventListener('click', e => e.stopPropagation()));

  if(saved !== undefined) lock(saved, false);

  current = {
    select: select, answer: answer, redo: redo, star: star,
    skip: () => answer('skip'),
    get locked(){ return locked; },
    get selected(){ return selected; }
  };
}

function explHTML(q){
  if(!Array.isArray(q.expl)) return '';
  let h = `<div class="expl"><div class="expl-head">${ic('bulb')}Gabarito comentado</div>`;
  h += `<div class="expl-row right"><span class="expl-tag ok">${LETTERS[q.correct]}</span><span class="expl-text"><b>Correta.</b> ${q.expl[q.correct] || ''}</span></div>`;
  const others = q.options.map((_, i) => i).filter(i => i !== q.correct && q.expl[i]);
  if(others.length){
    h += `<div class="expl-sub">Por que as outras estão erradas</div>`;
    others.forEach(i => { h += `<div class="expl-row"><span class="expl-tag no">${LETTERS[i]}</span><span class="expl-text">${q.expl[i]}</span></div>`; });
  }
  return h + '</div>';
}

/* ---------- Navegação ---------- */
function go(delta){ goTo(view.idx + delta); }
function goTo(i){
  if(i < 0 || i >= list.length || i === view.idx) return;
  view.idx = i;
  if(!session) saveView();
  renderCard(); renderPager();
  const area = $('#qarea');
  const top = area.getBoundingClientRect().top;
  if(top < 0) window.scrollTo({top:window.scrollY + top - 80, behavior:reduceMotion ? 'auto' : 'smooth'});
}
function stClass(id){
  if(session){
    const a = session.done[id];
    if(a === undefined) return '';
    return a === 'skip' ? ' st-skip' : a === QBY[id].correct ? ' st-ok' : ' st-no';
  }
  const s = status(QBY[id]);
  return s === 'correct' ? ' st-ok' : s === 'wrong' ? ' st-no' : s === 'skip' ? ' st-skip' : '';
}
function renderPager(){
  const n = list.length, i = view.idx;
  $('#countLabel').innerHTML = session ? `<b>${n}</b> na revisão` : `<b>${n}</b> ${n === 1 ? 'questão' : 'questões'}`;
  $('#progressFill').style.width = n ? ((i + 1) / n * 100) + '%' : '0%';
  $('#pmCount').textContent = n ? (i + 1) + ' / ' + n : '0 / 0';
  $('#pmPrev').disabled = i <= 0;
  $('#pmNext').disabled = i >= n - 1;
  const pager = $('#pager');
  if(n <= 1){ pager.innerHTML = ''; return; }
  const pages = new Set([0, n - 1]);
  for(let k = i - 2; k <= i + 2; k++) if(k >= 0 && k < n) pages.add(k);
  const arr = Array.from(pages).sort((a,b) => a - b);
  let nums = '', prev = -1;
  arr.forEach(k => {
    if(k - prev > 1) nums += '<span class="pg-ellipsis">…</span>';
    nums += `<button class="pg${stClass(list[k])}" data-i="${k}"${k === i ? ' aria-current="true"' : ''} aria-label="Questão ${k + 1}">${k + 1}</button>`;
    prev = k;
  });
  pager.innerHTML = `<button class="btn" id="pgPrev"${i <= 0 ? ' disabled' : ''}>${ic('left')}Anterior</button>
    <div class="pager-nums">${nums}</div>
    <button class="btn btn-primary" id="pgNext"${i >= n - 1 ? ' disabled' : ''}>Próxima${ic('right')}</button>`;
  $('#pgPrev').addEventListener('click', () => go(-1));
  $('#pgNext').addEventListener('click', () => go(1));
  $$('.pg', pager).forEach(b => b.addEventListener('click', () => goTo(Number(b.dataset.i))));
}

function renderAll(){
  renderFilters();
  renderActiveFilters();
  renderProgress();
  renderSessionBanner();
  renderCard();
  renderPager();
  $('#redoWrongBtn').hidden = !!session;
}

function clearFilters(){
  if(session) endSession(true);
  Object.assign(view, {group:'all', year:'all', subject:'all', status:'all', search:'', idx:0});
  $('#search').value = '';
  $('#searchClear').classList.remove('show');
  saveView(); rebuildList(); renderAll();
}

/* ---------- Sessões de revisão ---------- */
function startSession(ids, label){
  if(!ids.length){ toast(ic('checkCircle','sm') + 'Nada para revisar aqui. Bom trabalho!'); return; }
  closeAllModals();
  session = {label:label, ids:ids, done:{}, prevIdx:view.idx};
  view.idx = 0;
  rebuildList(); renderAll(); closeDrawer();
  $('#qarea').focus({preventScroll:true});
  window.scrollTo({top:0, behavior:reduceMotion ? 'auto' : 'smooth'});
}
function endSession(silent){
  if(!session) return;
  view.idx = session.prevIdx || 0;
  session = null;
  if(silent) return;
  rebuildList(); renderAll();
}
function startDueReview(){ startSession(dueIds(), 'Revisão espaçada de hoje'); }
function wrongInFilter(){ return filtered(true).filter(q => { const s = status(q); return s === 'wrong' || s === 'skip'; }).map(q => q.id); }
function startRedoWrong(){ startSession(wrongInFilter(), 'Refazendo questões erradas'); }

function openReview(){
  const due = dueIds();
  const wrong = wrongInFilter();
  const allWrong = QUESTIONS.filter(q => { const s = status(q); return s === 'wrong' || s === 'skip'; }).length;
  const favs = QUESTIONS.filter(q => starred[q.id]).map(q => q.id);
  const scheduled = Object.keys(review).filter(id => QBY[id] && !isDue(id));
  const next = scheduled.length ? Math.min.apply(null, scheduled.map(id => review[id].due)) : null;
  $('#reviewBody').innerHTML = `<p class="modal-desc">As questões que você erra voltam para revisão em intervalos crescentes — <b>1, 3, 7, 15 e 30 dias</b>. Acertou na revisão, ela sobe de nível; errou, volta para o começo.</p>
    <div class="backup-card"><div class="icon-wrap">${ic('review')}</div><div class="grow"><h3>Revisão espaçada de hoje</h3>
      <p>${due.length ? plural(due.length, 'questão aguardando', 'questões aguardando') + ' revisão.' : 'Nenhuma revisão para hoje.'} ${next ? 'Próxima revisão agendada: ' + fmtDate(next) + '.' : ''}</p>
      <button class="btn btn-primary btn-sm" id="rvDue"${due.length ? '' : ' disabled'}>${ic('play','sm')}Começar (${due.length})</button></div></div>
    <div class="backup-card"><div class="icon-wrap">${ic('redo')}</div><div class="grow"><h3>Refazer erradas</h3>
      <p>Refaz as questões que você errou ou marcou “Não sei”${activeFilterCount() ? ' com os filtros atuais' : ''}: ${wrong.length} de ${allWrong} no total.</p>
      <button class="btn btn-sm" id="rvWrong"${wrong.length ? '' : ' disabled'}>${ic('play','sm')}Refazer (${wrong.length})</button></div></div>
    <div class="backup-card"><div class="icon-wrap">${ic('star')}</div><div class="grow"><h3>Favoritas</h3>
      <p>${plural(favs.length, 'questão marcada', 'questões marcadas')} com estrela.</p>
      <button class="btn btn-sm" id="rvFav"${favs.length ? '' : ' disabled'}>${ic('play','sm')}Revisar favoritas</button></div></div>`;
  $('#rvDue').addEventListener('click', startDueReview);
  $('#rvWrong').addEventListener('click', startRedoWrong);
  $('#rvFav').addEventListener('click', () => startSession(favs, 'Revisando favoritas'));
  openModal('reviewModal');
}

/* ---------- Desempenho ---------- */
function openStats(){
  $('#statsBody').innerHTML = statsHTML();
  bindChart($('#statsBody'));
  $$('[data-train]', $('#statsBody')).forEach(b => b.addEventListener('click', () => {
    closeAllModals();
    if(session) endSession(true);
    Object.assign(view, {group:'all', year:'all', subject:b.dataset.train, status:'all', search:'', idx:0});
    $('#search').value = '';
    saveView(); rebuildList(); renderAll();
    toast(ic('target','sm') + 'Filtrando ' + subjectName(b.dataset.train));
  }));
  openModal('statsModal');
}
function statsHTML(){
  let correct = 0, wrong = 0, skip = 0;
  const bySubj = {}, byGroup = {};
  QUESTIONS.forEach(q => {
    const g = C.groups ? groupOf(q) : String(q.year);
    [[bySubj, q.subject], [byGroup, g]].forEach(([m, k]) => { if(!m[k]) m[k] = {total:0, ok:0, no:0, skip:0}; m[k].total++; });
    const s = status(q);
    if(s === 'unanswered') return;
    const key = s === 'correct' ? 'ok' : s === 'wrong' ? 'no' : 'skip';
    bySubj[q.subject][key]++; byGroup[g][key]++;
    if(s === 'correct') correct++; else if(s === 'wrong') wrong++; else skip++;
  });
  const practiced = correct + wrong + skip;
  if(!practiced && !history.length){
    return `<div class="empty">${ic('chart')}<b>Nada por aqui ainda</b>Responda algumas questões para acompanhar seu desempenho por matéria, por concurso e ao longo dos dias.</div>`;
  }
  let h = `<div class="stat-grid">
    <div class="stat"><div class="num">${practiced}<small style="font-size:.8rem;color:var(--text-3)"> / ${QUESTIONS.length}</small></div><div class="lbl">Praticadas</div></div>
    <div class="stat ok"><div class="num">${correct}</div><div class="lbl">Acertos</div></div>
    <div class="stat no"><div class="num">${wrong}</div><div class="lbl">Erros</div></div>
    <div class="stat"><div class="num">${pct(correct, correct + wrong)}%</div><div class="lbl">Aproveitamento</div></div>
    <div class="stat"><div class="num">${dueIds().length}</div><div class="lbl">Revisões hoje</div></div>
    <div class="stat"><div class="num">${bestStreak}</div><div class="lbl">Recorde de sequência</div></div>
  </div>`;

  h += `<div class="section-title" style="margin-top:24px">Atividade nos últimos 14 dias<small>${weekCompare()}</small></div>` + activityChart();

  // matérias: as mais fracas primeiro
  const subjRows = Object.keys(bySubj).map(s => Object.assign({id:s}, bySubj[s]));
  const acc = r => (r.ok + r.no) ? r.ok / (r.ok + r.no) : null;
  subjRows.sort((a,b) => {
    const pa = acc(a), pb = acc(b);
    if(pa === null && pb === null) return b.total - a.total;
    if(pa === null) return 1; if(pb === null) return -1;
    return pa - pb;
  });
  const weakest = subjRows.find(r => acc(r) !== null && (r.ok + r.no) >= 3 && acc(r) < .7);
  h += `<div class="section-title">Por matéria<small>das mais fracas para as mais fortes</small></div><div class="bars">`;
  subjRows.forEach(r => { h += barRow(subjectName(r.id), r, `<span class="sw dot" style="background:var(--s-${r.id})"></span>`, r === weakest, r.id); });
  h += '</div>';

  const gRows = Object.keys(byGroup).map(g => Object.assign({id:g}, byGroup[g]));
  if(C.groups) gRows.sort((a,b) => GROUPS.indexOf(a.id) - GROUPS.indexOf(b.id));
  else gRows.sort((a,b) => a.id.localeCompare(b.id));
  h += `<div class="section-title">${C.groups ? 'Por concurso' : 'Por ano de prova'}</div><div class="bars">`;
  gRows.forEach(r => { h += barRow(C.groups ? groupLabel(r.id) : 'Prova ' + r.id, r, '', false, null); });
  h += '</div>';

  if(sims.length){
    h += `<div class="section-title">Simulados recentes</div><div class="list">`;
    sims.slice(-6).reverse().forEach(s => {
      h += `<div class="list-item">${ic('flag','sm')}<div class="grow"><b>${pct(s.correct, s.total)}%</b> — ${s.correct}/${s.total} acertos <div class="muted">${new Date(s.t).toLocaleDateString('pt-BR')} · ${Math.round(s.sec / 60)} min</div></div></div>`;
    });
    h += '</div>';
  }
  h += `<p class="note">As estatísticas consideram a resposta mais recente de cada questão. O gráfico de atividade conta a partir da atualização do site em que o histórico passou a ser registrado.</p>`;
  return h;
}
function barRow(name, r, deco, weak, trainId){
  const answered = r.ok + r.no + r.skip;
  const w = v => (answered ? v / r.total * 100 : 0).toFixed(2) + '%';
  const segs = [['b-ok', r.ok], ['b-no', r.no], ['b-skip', r.skip]].filter(s => s[1]).map(s => `<span class="${s[0]}" style="width:${w(s[1])}"></span>`).join('');
  const accTxt = (r.ok + r.no) ? pct(r.ok, r.ok + r.no) + '% de acerto' : 'ainda não praticada';
  return `<div class="bar-row">
    <div class="name">${deco}<span>${esc(name)}</span>${weak ? '<span class="weak-tag">Ponto fraco</span>' : ''}</div>
    <div class="val"><b>${answered}</b> / ${r.total}</div>
    <div class="bar-track" role="img" aria-label="${esc(name)}: ${r.ok} acertos, ${r.no} erros, ${r.skip} não sei, de ${r.total} questões">${segs}</div>
    <div class="meta">${accTxt}${trainId ? `<button class="btn btn-sm btn-ghost" data-train="${esc(trainId)}">Treinar${ic('arrowRight','sm')}</button>` : ''}</div>
  </div>`;
}
function dayBuckets(days){
  const t0 = today0();
  const out = [];
  for(let d = days - 1; d >= 0; d--) out.push({t:t0 - d * DAY, ok:0, no:0, skip:0});
  history.forEach(h => {
    const q = QBY[h.id];
    if(!q) return;
    const idx = days - 1 - Math.floor((t0 - new Date(h.t).setHours(0,0,0,0)) / DAY);
    if(idx < 0 || idx >= days) return;
    if(h.a === 'skip') out[idx].skip++; else if(h.a === q.correct) out[idx].ok++; else out[idx].no++;
  });
  return out;
}
function weekCompare(){
  const b = dayBuckets(14);
  const sum = arr => arr.reduce((s, x) => ({ok:s.ok + x.ok, no:s.no + x.no}), {ok:0, no:0});
  const a = sum(b.slice(7)), p = sum(b.slice(0, 7));
  if(!(a.ok + a.no)) return '';
  let txt = 'Últimos 7 dias: ' + pct(a.ok, a.ok + a.no) + '% de acerto';
  if(p.ok + p.no){
    const diff = pct(a.ok, a.ok + a.no) - pct(p.ok, p.ok + p.no);
    txt += ' (' + (diff >= 0 ? '+' : '') + diff + ' p.p. vs. semana anterior)';
  }
  return txt;
}
function activityChart(){
  const data = dayBuckets(14);
  const max = Math.max.apply(null, data.map(d => d.ok + d.no + d.skip));
  if(!max) return `<div class="empty" style="padding:28px">${ic('trend')}<b>Sem atividade registrada</b>Suas respostas a partir de agora aparecem aqui, dia a dia.</div>`;
  const W = 640, H = 170, padL = 28, padB = 22, padT = 8;
  const innerW = W - padL, innerH = H - padB - padT;
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * Math.ceil(max / step);
  const y = v => padT + innerH - v / top * innerH;
  const colW = innerW / data.length, barW = Math.min(22, colW * .56);
  let grid = '', cols = '';
  for(let v = 0; v <= top; v += step) grid += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  data.forEach((d, i) => {
    const cx = padL + colW * i + colW / 2, x = cx - barW / 2;
    const segs = [['var(--ok)', d.ok], ['var(--no)', d.no], ['var(--skip)', d.skip]].filter(s => s[1]);
    let base = y(0), marks = '';
    segs.forEach((s, k) => {
      const h = s[1] / top * innerH;
      const yy = base - h;
      // o segmento de cima tem cantos arredondados; os de baixo deixam 2px de respiro
      if(k === segs.length - 1) marks += `<path d="${topRounded(x, yy, barW, h, Math.min(4, h))}" fill="${s[0]}"/>`;
      else marks += `<rect x="${x}" y="${yy + 2}" width="${barW}" height="${Math.max(0, h - 2)}" fill="${s[0]}"/>`;
      base = yy;
    });
    const label = (i % 2 === (data.length - 1) % 2) ? `<text x="${cx}" y="${H - 6}" text-anchor="middle">${fmtDate(d.t)}</text>` : '';
    cols += `<g class="col" data-tip="${fmtDate(d.t)}|${d.ok}|${d.no}|${d.skip}"><rect class="hit" x="${padL + colW * i + 1}" y="${padT}" width="${colW - 2}" height="${innerH}" rx="4"/>${marks}</g><g class="axis">${label}</g>`;
  });
  const rows = data.filter(d => d.ok + d.no + d.skip).map(d => `<tr><td>${fmtDate(d.t)}</td><td>${d.ok}</td><td>${d.no}</td><td>${d.skip}</td></tr>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Questões respondidas por dia nos últimos 14 dias"><g class="grid axis">${grid}</g>${cols}</svg><div class="chart-tip"></div></div>
    <div class="chart-legend"><span><i style="background:var(--ok)"></i>Acertos</span><span><i style="background:var(--no)"></i>Erros</span><span><i style="background:var(--skip)"></i>Não sei</span></div>
    <table class="sr-only"><caption>Atividade por dia</caption><tr><th>Dia</th><th>Acertos</th><th>Erros</th><th>Não sei</th></tr>${rows}</table>`;
}
function topRounded(x, y, w, h, r){
  if(h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function bindChart(root){
  const chart = $('.chart', root);
  if(!chart) return;
  const tip = $('.chart-tip', chart);
  $$('.col', chart).forEach(g => {
    g.addEventListener('mouseenter', () => {
      const [d, ok, no, sk] = g.dataset.tip.split('|');
      const total = +ok + +no + +sk;
      tip.innerHTML = `<b>${d}</b> · ${plural(total, 'questão', 'questões')}<br>${ok} acertos · ${no} erros · ${sk} não sei`;
      const r = g.getBoundingClientRect(), c = chart.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(r.left - c.left + r.width / 2, 90), c.width - 90) + 'px';
      tip.style.top = (r.top - c.top + 4) + 'px';
      tip.style.display = 'block';
    });
    g.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

/* ---------- Simulado ---------- */
let sim = null;
const simCfg = {qty:'40', time:'auto', pool:'filtered'};
function simPool(){
  if(simCfg.pool === 'all') return QUESTIONS.slice();
  if(simCfg.pool === 'unanswered') return QUESTIONS.filter(q => answers[q.id] === undefined);
  return filtered();
}
function simCount(){ const p = simPool().length; return simCfg.qty === 'all' ? p : Math.min(Number(simCfg.qty), p); }
function simMinutes(n){ return simCfg.time === 'auto' ? n * 3 : Number(simCfg.time); }
function updateSimNote(){
  const n = simCount(), m = simMinutes(n);
  $('#simNote').textContent = `${plural(simPool().length, 'questão disponível', 'questões disponíveis')} · o simulado terá ${n} ${n === 1 ? 'questão' : 'questões'}${m ? ' em ' + (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') : m + ' min') : ', sem limite de tempo'}.`;
  $('#simStart').disabled = !n;
}
function openSimSetup(){ updateSimNote(); openModal('simSetupModal'); }
function startSim(){
  const pool = simPool();
  const n = simCount();
  if(!n) return;
  const r = rng(Date.now() & 0xffffffff);
  const arr = pool.slice();
  for(let i = arr.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  const mins = simMinutes(n);
  sim = {pool:arr.slice(0, n), idx:0, ans:{}, flags:{}, left:mins ? mins * 60 : null, start:Date.now(), timer:null};
  closeAllModals();
  $('#sim').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderSim();
  if(sim.left !== null){
    tickSim();
    sim.timer = setInterval(() => { sim.left--; tickSim(); if(sim.left <= 0) finishSim(true); }, 1000);
  } else {
    $('#simTimer span').textContent = 'Sem limite';
  }
}
function tickSim(){
  const s = Math.max(0, sim.left);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  $('#simTimer span').textContent = (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  $('#simTimer').classList.toggle('warn', s <= 60);
}
function renderSim(){
  const q = sim.pool[sim.idx];
  const n = sim.pool.length;
  $('#simProgress').textContent = `Questão ${sim.idx + 1} de ${n} · ${Object.keys(sim.ans).length} respondidas`;
  $('#simGrid').innerHTML = sim.pool.map((x, i) => `<button class="sim-cell${sim.ans[x.id] !== undefined ? ' answered' : ''}${sim.flags[x.id] ? ' flag' : ''}" data-i="${i}"${i === sim.idx ? ' aria-current="true"' : ''} aria-label="Questão ${i + 1}${sim.ans[x.id] !== undefined ? ', respondida' : ''}">${i + 1}</button>`).join('');
  $$('.sim-cell', $('#simGrid')).forEach(b => b.addEventListener('click', () => { sim.idx = Number(b.dataset.i); renderSim(); }));
  const cur = $('.sim-cell[aria-current]', $('#simGrid'));
  if(cur) cur.scrollIntoView({block:'nearest'});
  $('#simBody').innerHTML = `<article class="qcard" style="${subjStyle(q.subject)}">
    <header class="qhead"><div class="qmeta">${metaHTML(q)}</div>
      <div class="qtools"><button class="icon-btn" id="simFlag" aria-pressed="${!!sim.flags[q.id]}" title="Marcar para revisar depois" aria-label="Marcar questão">${ic('flag')}</button></div></header>
    <div class="qbody">${questionHTML(q)}${optionsHTML(q)}</div>
  </article>`;
  $('#simBody').scrollTop = 0;
  const opts = $$('#simBody .option');
  const cuts = $$('#simBody .cut-btn');
  opts.forEach((o, i) => {
    if(sim.ans[q.id] === i) o.setAttribute('aria-pressed', 'true');
    if(struck[q.id + '-' + i]){ o.classList.add('struck'); cuts[i].setAttribute('aria-pressed', 'true'); }
    const pick = () => { simSelect(i); };
    o.addEventListener('click', pick);
    o.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
  });
  cuts.forEach((c, i) => c.addEventListener('click', () => {
    const key = q.id + '-' + i, on = !struck[key];
    if(on) struck[key] = true; else delete struck[key];
    LS.set('struck', struck);
    opts[i].classList.toggle('struck', on);
    c.setAttribute('aria-pressed', String(on));
  }));
  $('#simFlag').addEventListener('click', () => { sim.flags[q.id] = !sim.flags[q.id]; renderSim(); });
  $('#simPrev').disabled = sim.idx === 0;
  $('#simNext').disabled = sim.idx === n - 1;
}
function simSelect(i){
  const q = sim.pool[sim.idx];
  if(i >= q.options.length) return;
  sim.ans[q.id] = i;
  $$('#simBody .option').forEach((o, j) => o.setAttribute('aria-pressed', String(j === i)));
  const cell = $(`.sim-cell[data-i="${sim.idx}"]`);
  if(cell) cell.classList.add('answered');
  $('#simProgress').textContent = `Questão ${sim.idx + 1} de ${sim.pool.length} · ${Object.keys(sim.ans).length} respondidas`;
}
function simGo(d){ const i = sim.idx + d; if(i >= 0 && i < sim.pool.length){ sim.idx = i; renderSim(); } }
function closeSim(){
  if(sim && sim.timer) clearInterval(sim.timer);
  $('#sim').classList.remove('open');
  document.body.style.overflow = '';
}
function finishSim(timeUp){
  const s = sim;
  closeSim();
  sim = null;
  let correct = 0, wrong = 0, blank = 0;
  const bySubj = {};
  const wrongIds = [];
  s.pool.forEach(q => {
    if(!bySubj[q.subject]) bySubj[q.subject] = {total:0, ok:0, no:0, skip:0};
    bySubj[q.subject].total++;
    const a = s.ans[q.id];
    if(a === undefined){ blank++; wrongIds.push(q.id); return; }
    recordAnswer(q, a);
    if(a === q.correct){ correct++; bySubj[q.subject].ok++; }
    else { wrong++; bySubj[q.subject].no++; wrongIds.push(q.id); }
  });
  const sec = Math.round((Date.now() - s.start) / 1000);
  sims.push({t:Date.now(), total:s.pool.length, correct:correct, wrong:wrong, blank:blank, sec:sec});
  if(sims.length > 50) sims = sims.slice(-50);
  LS.set('sims', sims);
  const total = s.pool.length;
  const p = pct(correct, total);
  const flagged = s.pool.filter(q => s.flags[q.id]).map(q => q.id);
  let h = timeUp ? `<div class="result no" style="margin:0 0 16px">${ic('clock')}<span>Tempo esgotado! As questões em branco contam como erro.</span></div>` : '';
  h += `<div class="stat-grid">
    <div class="stat"><div class="num">${p}%</div><div class="lbl">Aproveitamento</div></div>
    <div class="stat ok"><div class="num">${correct}</div><div class="lbl">Acertos</div></div>
    <div class="stat no"><div class="num">${wrong}</div><div class="lbl">Erros</div></div>
    <div class="stat"><div class="num">${blank}</div><div class="lbl">Em branco</div></div>
    <div class="stat"><div class="num">${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</div><div class="lbl">Tempo usado</div></div>
  </div>`;
  h += `<div class="section-title" style="margin-top:22px">Por matéria</div><div class="bars">`;
  Object.keys(bySubj).sort((a,b) => bySubj[b].total - bySubj[a].total).forEach(k => {
    h += barRow(subjectName(k), bySubj[k], `<span class="dot" style="background:var(--s-${k})"></span>`, false, null);
  });
  h += '</div>';
  h += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:22px">
    ${wrongIds.length ? `<button class="btn btn-primary" id="srWrong">${ic('redo','sm')}Corrigir erradas e em branco (${wrongIds.length})</button>` : ''}
    ${flagged.length ? `<button class="btn" id="srFlag">${ic('flag','sm')}Rever marcadas (${flagged.length})</button>` : ''}
    <button class="btn" id="srAll">${ic('book','sm')}Ver todas com gabarito</button>
  </div>
  <p class="note">As respostas foram salvas no seu progresso e as erradas entraram na revisão espaçada.</p>`;
  $('#simResultBody').innerHTML = h;
  const ids = s.pool.map(q => q.id);
  // abre as questões já corrigidas (com gabarito), como estavam no simulado
  const showAnswered = (sel, label) => () => {
    startSession(sel, label);
    sel.forEach(id => { if(s.ans[id] !== undefined) session.done[id] = s.ans[id]; });
    renderAll();
  };
  if(wrongIds.length) $('#srWrong').addEventListener('click', () => startSession(wrongIds, 'Erradas do simulado'));
  if(flagged.length) $('#srFlag').addEventListener('click', showAnswered(flagged, 'Marcadas no simulado'));
  $('#srAll').addEventListener('click', showAnswered(ids, 'Gabarito do simulado'));
  rebuildList(); renderAll();
  openModal('simResultModal');
  if(p >= 70) confetti();
}

/* ---------- Backup ---------- */
const BACKUP_KEY = /^(gcm|pmsp|qb)_[a-z_]+$/;
function exportBackup(){
  const data = {};
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(BACKUP_KEY.test(k)) data[k] = localStorage.getItem(k);
    }
  }catch(e){}
  const payload = {app:'papiro-por-principios', version:1, exportedAt:new Date().toISOString(), data:data};
  const blob = new Blob([JSON.stringify(payload, null, 1)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'papiro-progresso-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(ic('checkCircle','sm') + 'Backup baixado');
}
function importBackup(file){
  const fr = new FileReader();
  fr.onload = () => {
    let obj;
    try{ obj = JSON.parse(fr.result); }catch(e){ toast(ic('xCircle','sm') + 'Arquivo inválido'); return; }
    if(!obj || obj.app !== 'papiro-por-principios' || typeof obj.data !== 'object' || !obj.data){ toast(ic('xCircle','sm') + 'Este arquivo não é um backup do site'); return; }
    const keys = Object.keys(obj.data).filter(k => BACKUP_KEY.test(k) && typeof obj.data[k] === 'string');
    if(!keys.length){ toast(ic('xCircle','sm') + 'O backup está vazio'); return; }
    const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString('pt-BR') : 'data desconhecida';
    if(!confirm('Restaurar o backup de ' + when + '?\nO progresso atual deste navegador será substituído.')) return;
    try{
      const old = [];
      for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(BACKUP_KEY.test(k)) old.push(k); }
      old.forEach(k => localStorage.removeItem(k));
      keys.forEach(k => localStorage.setItem(k, obj.data[k]));
    }catch(e){ toast(ic('xCircle','sm') + 'Não foi possível salvar o backup'); return; }
    location.reload();
  };
  fr.readAsText(file);
}
function resetProgress(){
  if(!confirm('Apagar todas as respostas, o histórico, as revisões e os simulados deste banco?\nAs favoritas serão mantidas. Esta ação não pode ser desfeita.')) return;
  ['answers','struck','history','review','sims','streak','best','summary','view'].forEach(k => LS.del(P + '_' + k));
  location.reload();
}

/* ---------- Impressão ---------- */
function printList(){
  const qs = list.map(id => QBY[id]);
  const c = $('#printContainer');
  const parts = [];
  if(view.group !== 'all') parts.push('Concurso: ' + groupLabel(view.group));
  if(view.year !== 'all') parts.push('Ano: ' + view.year);
  if(view.subject !== 'all') parts.push('Matéria: ' + subjectName(view.subject));
  if(view.search) parts.push('Busca: "' + view.search + '"');
  c.innerHTML = '';
  const title = document.createElement('div'); title.className = 'pq-title'; title.textContent = C.title; c.appendChild(title);
  const sub = document.createElement('div'); sub.className = 'pq-sub'; sub.textContent = (parts.length ? parts.join(' · ') + ' · ' : '') + qs.length + ' questões'; c.appendChild(sub);
  qs.forEach((q, n) => {
    const item = document.createElement('div'); item.className = 'pq-item';
    const g = groupOf(q);
    item.innerHTML = `<div class="pq-head">${n + 1}) ${q.year}${g ? ' · ' + esc(groupLabel(g)) : ''} · ${esc(subjectName(q.subject))} · Questão ${q.num}</div>
      ${q.image && IMAGES[q.image] ? `<img class="pq-img" src="${IMAGES[q.image]}" alt="">` : ''}
      ${q.context ? `<div class="pq-context">${q.context}</div>` : ''}
      <div class="pq-statement">${q.statement}</div>
      <ul class="pq-options">${q.options.map((o, i) => `<li>${LETTERS[i]}) ${o}</li>`).join('')}</ul>`;
    c.appendChild(item);
  });
  if(qs.length){
    const gab = document.createElement('div'); gab.className = 'pq-gabarito';
    gab.innerHTML = '<h2>Gabarito</h2><div class="pq-gabarito-grid">' + qs.map((q, n) => `<div>${n + 1}) ${LETTERS[q.correct]}</div>`).join('') + '</div>';
    c.appendChild(gab);
  }
  window.print();
}

/* ---------- Modais, menu, gaveta ---------- */
let lastFocus = null;
function openModal(id){
  const m = document.getElementById(id);
  lastFocus = document.activeElement;
  closeMenu();
  m.classList.add('open');
  const f = $('button:not([disabled]):not([data-close]), [href], input, select', $('.modal-body', m)) || $('[data-close]', m);
  if(f) f.focus({preventScroll:true});
}
function closeModal(m){
  m.classList.remove('open');
  if(lastFocus && document.body.contains(lastFocus)) lastFocus.focus({preventScroll:true});
}
function closeAllModals(){ $$('.modal.open').forEach(m => m.classList.remove('open')); }
function openMenu(){ $('#menu').classList.add('open'); $('#menuBtn').setAttribute('aria-expanded', 'true'); const f = $('#menu .menu-item'); if(f) f.focus(); }
function closeMenu(){ $('#menu').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); }
function openDrawer(){ $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); $('#drawerClose').focus(); }
function closeDrawer(){ $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); }

/* ---------- Tema ---------- */
function getTheme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function setTheme(t){
  if(t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.setAttribute('data-theme', 'light');
  LS.setRaw('qb_theme', t);
  renderThemeBtn();
  const meta = $('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t === 'dark' ? '#0b111b' : '#ffffff');
}
function renderThemeBtn(){
  const dark = getTheme() === 'dark';
  $('#themeBtn').innerHTML = ic(dark ? 'sun' : 'moon');
  $('#themeBtn').title = dark ? 'Usar tema claro (T)' : 'Usar tema escuro (T)';
}

/* ---------- Avisos ---------- */
function toast(html, cls){
  const t = document.createElement('div');
  t.className = 'toast' + (cls ? ' ' + cls : '');
  t.innerHTML = html;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, 2600);
}
function confetti(){
  if(reduceMotion) return;
  const colors = ['#f0a500', '#1c63ad', '#15803d', '#2f7bd0', '#ffdf85', '#c62828'];
  for(let i = 0; i < 36; i++){
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = (2 + Math.random() * 1.5) + 's';
    el.style.animationDelay = Math.random() * .3 + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
}

/* ---------- Eventos ---------- */
function bind(){
  $('#navReview').addEventListener('click', openReview);
  $('#navSim').addEventListener('click', openSimSetup);
  $('#navStats').addEventListener('click', openStats);
  $('#themeBtn').addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));
  $('#menuBtn').addEventListener('click', e => { e.stopPropagation(); $('#menu').classList.contains('open') ? closeMenu() : openMenu(); });
  document.addEventListener('click', e => { if(!e.target.closest('.menu-wrap')) closeMenu(); });
  $$('#menu [data-act]').forEach(b => b.addEventListener('click', () => {
    closeMenu();
    const a = b.dataset.act;
    if(a === 'stats') openStats();
    else if(a === 'backup') openModal('backupModal');
    else if(a === 'print') printList();
    else if(a === 'keys') openModal('keysModal');
  }));
  $('#footBackup').addEventListener('click', e => { e.preventDefault(); openModal('backupModal'); });
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if(e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });

  const search = $('#search');
  search.value = view.search;
  $('#searchClear').classList.toggle('show', !!view.search);
  let st;
  search.addEventListener('input', () => {
    $('#searchClear').classList.toggle('show', !!search.value);
    clearTimeout(st);
    st = setTimeout(() => setFilter('search', search.value.trim()), 250);
  });
  $('#searchClear').addEventListener('click', () => { search.value = ''; $('#searchClear').classList.remove('show'); setFilter('search', ''); search.focus(); });
  $('#clearFilters').addEventListener('click', clearFilters);
  $('#orderBtn').addEventListener('click', () => {
    if(view.order === 'prova'){ view.order = 'shuffle'; seed = Math.floor(Math.random() * 1e9); LS.set('seed', seed); computeRank(); }
    else view.order = 'prova';
    setFilter('order', view.order);
  });
  $('#filtersBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#redoWrongBtn').addEventListener('click', startRedoWrong);
  $('#pmPrev').addEventListener('click', () => go(-1));
  $('#pmNext').addEventListener('click', () => go(1));

  // simulado
  [['#simQty', 'qty'], ['#simTime', 'time'], ['#simPool', 'pool']].forEach(([sel, key]) => {
    $$(sel + ' .chip').forEach(b => b.addEventListener('click', () => {
      simCfg[key] = b.dataset.v;
      $$(sel + ' .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      updateSimNote();
    }));
  });
  $('#simStart').addEventListener('click', startSim);
  $('#simPrev').addEventListener('click', () => simGo(-1));
  $('#simNext').addEventListener('click', () => simGo(1));
  $('#simExit').addEventListener('click', () => {
    if(confirm('Sair do simulado? As respostas dele serão descartadas.')){ closeSim(); sim = null; }
  });
  $('#simFinish').addEventListener('click', () => {
    const blanks = sim.pool.length - Object.keys(sim.ans).length;
    if(blanks && !confirm('Você deixou ' + plural(blanks, 'questão', 'questões') + ' em branco. Finalizar mesmo assim?')) return;
    finishSim(false);
  });

  // backup
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { const f = e.target.files[0]; if(f) importBackup(f); e.target.value = ''; });
  $('#resetBtn').addEventListener('click', resetProgress);

  document.addEventListener('keydown', onKey);
  window.addEventListener('storage', e => { if(e.key === 'qb_theme' && e.newValue) setTheme(e.newValue); });
}

function onKey(e){
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const k = e.key;
  if(k === 'Escape'){
    if($('#menu').classList.contains('open')){ closeMenu(); $('#menuBtn').focus(); return; }
    const m = $$('.modal.open').pop();
    if(m){ closeModal(m); return; }
    if($('#sidebar').classList.contains('open')){ closeDrawer(); return; }
    if(t.matches && t.matches('input')){ t.blur(); }
    return;
  }
  if(t.matches && t.matches('input, textarea, select, [contenteditable="true"]')) return;
  const onControl = t.closest && t.closest('button, a, .option');
  if((k === 'Enter' || k === ' ') && onControl) return;
  if($$('.modal.open').length) return;
  const lower = k.length === 1 ? k.toLowerCase() : k;
  let letter = LETTERS.map(x => x.toLowerCase()).indexOf(lower);
  if(letter < 0 && /^[1-5]$/.test(k)) letter = Number(k) - 1;

  if(sim){
    if(letter >= 0){ e.preventDefault(); simSelect(letter); }
    else if(k === 'ArrowRight'){ e.preventDefault(); simGo(1); }
    else if(k === 'ArrowLeft'){ e.preventDefault(); simGo(-1); }
    return;
  }
  if(letter >= 0 && current && !current.locked){ e.preventDefault(); current.select(letter); return; }
  switch(lower){
    case 'Enter':
      if(!current) return;
      e.preventDefault();
      if(current.locked) go(1); else current.answer();
      break;
    case 'ArrowRight': e.preventDefault(); go(1); break;
    case 'ArrowLeft': e.preventDefault(); go(-1); break;
    case 'n': if(current && !current.locked){ e.preventDefault(); current.skip(); } break;
    case 'f': if(current){ e.preventDefault(); current.star(); } break;
    case 'r': if(current && current.locked){ e.preventDefault(); current.redo(); } break;
    case '/': e.preventDefault(); if(window.innerWidth <= 960) openDrawer(); $('#search').focus(); break;
    case '?': e.preventDefault(); openModal('keysModal'); break;
    case 'v': e.preventDefault(); openReview(); break;
    case 'm': e.preventDefault(); openSimSetup(); break;
    case 'g': e.preventDefault(); openStats(); break;
    case 't': e.preventDefault(); setTheme(getTheme() === 'dark' ? 'light' : 'dark'); break;
  }
}

/* ---------- Offline (PWA) ---------- */
function setupOffline(){
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // guarda as imagens deste banco para estudar sem internet
  const urls = new Set(Object.values(IMAGES));
  QUESTIONS.forEach(q => [q.statement, q.context || ''].concat(q.options).forEach(h => {
    String(h).replace(/src="([^"]+)"/g, (m, u) => { if(!/^data:/.test(u)) urls.add(u); return m; });
  }));
  const run = () => {
    if(!window.caches) return;
    caches.open('qb-media-v1').then(cache => Promise.all(Array.from(urls).map(u =>
      cache.match(u).then(hit => hit || cache.add(u).catch(() => {}))
    ))).catch(() => {});
  };
  (window.requestIdleCallback || (f => setTimeout(f, 3000)))(run);
}

/* ---------- Início ---------- */
buildLayout();
renderThemeBtn();
rebuildList();
bind();
renderAll();
saveSummary();
setupOffline();

})();
