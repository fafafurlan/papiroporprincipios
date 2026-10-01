/* Página inicial: tema, progresso salvo de cada banco, frases e instalação do app. */
(function(){
  'use strict';
  var ic = window.QB_ICON;
  function $(s, el){ return (el || document).querySelector(s); }
  function $$(s, el){ return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

  $$('[data-icon]').forEach(function(el){ el.outerHTML = ic(el.getAttribute('data-icon')); });

  // tema
  var themeBtn = $('#themeBtn');
  function theme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function paint(){ themeBtn.innerHTML = ic(theme() === 'dark' ? 'sun' : 'moon'); }
  themeBtn.addEventListener('click', function(){
    var t = theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem('qb_theme', t); }catch(e){}
    paint();
  });
  paint();

  // progresso de cada banco
  $$('.bank').forEach(function(card){
    var key = card.getAttribute('data-bank');
    var total = Number(card.getAttribute('data-total'));
    var box = $('[data-progress]', card);
    var s = null;
    try{ s = JSON.parse(get(key + '_summary') || 'null'); }catch(e){}
    if(!s){
      var a = {};
      try{ a = JSON.parse(get(key + '_answers') || '{}'); }catch(e){}
      var n = Object.keys(a).length;
      if(n) s = {total:total, answered:n, correct:null, due:0};
    }
    if(!s || !s.answered){
      box.innerHTML = '<div class="row"><span>Você ainda não começou este banco.</span><b>0 / ' + total + '</b></div><div class="track"><div class="fill" style="width:0"></div></div>';
      return;
    }
    var p = Math.round(s.answered / (s.total || total) * 100);
    var acc = s.correct != null && s.answered ? ' · ' + Math.round(s.correct / s.answered * 100) + '% de acerto' : '';
    box.innerHTML = '<div class="row"><span>Seu progresso' + acc + '</span><b>' + s.answered + ' / ' + (s.total || total) + '</b></div>' +
      '<div class="track"><div class="fill" style="width:' + p + '%"></div></div>' +
      (s.due ? '<div class="due">' + ic('review', 'sm') + s.due + (s.due === 1 ? ' questão para revisar hoje' : ' questões para revisar hoje') + '</div>' : '');
    $('[data-cta]', card).textContent = 'Continuar estudando';
  });

  // frases motivacionais
  var QUOTES = {
    pmsp: ['A disciplina de hoje é a farda de amanhã.', 'Cada questão resolvida é um passo mais perto da aprovação.', 'Servir e proteger começa nos estudos.', 'Onde a dedicação é rotina, a aprovação é consequência.', 'Não é sobre ter tempo, é sobre fazer o tempo valer.'],
    gcm: ['Cuidar da cidade é cuidar de quem você ama.', 'A farda também se conquista com estudo.', 'Todo dia de estudo é um degrau até a aprovação.', 'Proteger a comunidade começa com preparo.', 'Sua dedicação de hoje é a cidade mais segura de amanhã.']
  };
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!still) Object.keys(QUOTES).forEach(function(k, n){
    var el = $('.quote[data-quotes="' + k + '"]');
    var i = 0;
    setTimeout(function(){
      setInterval(function(){
        i = (i + 1) % QUOTES[k].length;
        el.classList.add('fade');
        setTimeout(function(){ el.textContent = '“' + QUOTES[k][i] + '”'; el.classList.remove('fade'); }, 400);
      }, 5200);
    }, n * 1300);
  });

  // instalação (PWA)
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferred = e;
    $('#installBanner').classList.add('show');
    $('#installTop').hidden = false;
  });
  function install(){
    if(!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function(){
      deferred = null;
      $('#installBanner').classList.remove('show');
      $('#installTop').hidden = true;
    });
  }
  $('#installBtn').addEventListener('click', install);
  $('#installTop').addEventListener('click', install);
  window.addEventListener('appinstalled', function(){ $('#installBanner').classList.remove('show'); $('#installTop').hidden = true; });
})();
