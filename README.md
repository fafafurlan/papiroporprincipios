# Papiro por Princípios — Banco de Questões

Site estático com provas comentadas de concursos da **PMESP (Soldado)** e da **Guarda Civil Municipal**.
Publicado em <https://papiroporprincipios.netlify.app/>.

## Estrutura

```
index.html                  Página inicial (escolha do banco)
banco_questoes_pmsp.html    Página do banco PMESP  (só configuração)
banco_questoes_gcm.html     Página do banco GCM    (só configuração)

data/questoes_pmsp.js       Questões e imagens da PMESP
data/questoes_gcm.js        Questões e imagens da GCM
data/img/<banco>/           Imagens usadas nas questões

assets/css/app.css          Visual compartilhado (cores, componentes, modo escuro)
assets/css/home.css         Visual da página inicial
assets/js/app.js            Toda a lógica do banco (filtros, revisão, simulado, estatísticas…)
assets/js/home.js           Lógica da página inicial
assets/js/icons.js          Ícones em SVG
assets/icons/               Ícones do app (favicon, instalação no celular)

manifest.webmanifest        Permite instalar o site como aplicativo
sw.js                       Service worker — funcionamento offline
```

As duas páginas de banco usam **o mesmo código** (`assets/js/app.js`). Uma correção ou
melhoria feita ali vale para os dois bancos.

## Como adicionar questões

Abra `data/questoes_<banco>.js` e acrescente um objeto na lista `window.QB_QUESTIONS`:

```js
{"id": "2026-1", "year": 2026, "subject": "portugues", "num": 1,
 "context": null,                      // texto de apoio em HTML, ou null
 "image": null,                        // chave em window.QB_IMAGES, ou null
 "statement": "Enunciado da questão…",
 "options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E"],
 "correct": 2,                         // índice da correta (0 = A, 1 = B…)
 "expl": ["Por que A…", "Por que B…", "Por que C…", "Por que D…", "Por que E…"]}
```

- `id` precisa ser único. No banco GCM, o prefixo antes do hífen identifica o concurso
  (`taubate-5`, `gcmsp-12`…); para um concurso novo, inclua o nome dele em `groups`
  no `QB_CONFIG` de `banco_questoes_gcm.html`.
- Para imagens, salve o arquivo em `data/img/<banco>/` e registre em `window.QB_IMAGES`.
- Para uma matéria nova, inclua-a em `subjects` no `QB_CONFIG` da página e, se quiser uma
  cor própria, defina `--s-<materia>` e `--s-<materia>-bg` em `assets/css/app.css`.
- Anos, concursos e matérias aparecem nos filtros automaticamente.

Depois de publicar mudanças em arquivos listados em `CORE` no `sw.js`, aumente a versão
(`qb-core-v1` → `qb-core-v2`) para que os aparelhos com o app instalado atualizem o cache.

## Progresso do aluno

Tudo fica no `localStorage` do navegador, com prefixo por banco (`pmsp_…`, `gcm_…`):
respostas, alternativas riscadas, favoritas, histórico, fila de revisão espaçada e simulados.
As chaves antigas (`*_answers`, `*_struck`, `*_starred`, `*_streak`) continuam as mesmas,
então quem já usava o site não perde nada. O menu **⋯ → Backup do progresso** exporta e
importa tudo num arquivo `.json`.

## Testar localmente

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

Abrir o arquivo direto (`file://`) também funciona, mas o modo offline e a instalação
como app só funcionam servindo por HTTP(S).
