# Osteria di Lucca — README Técnico Completo
> Última atualização: **chat 25**
> Status: ✅ Sino de notificações por usuário — nova reserva pisca até cada usuário ler individualmente

---

## INSTRUÇÕES PARA A IA — LEIA ANTES DE QUALQUER AÇÃO

Este README é o ponto de partida de cada novo chat. Antes de escrever ou alterar qualquer linha de código, a IA deve:

1. **Ler este README completo** — entender a arquitetura, regras e histórico
2. **Ler todos os arquivos envolvidos na tarefa** — nunca alterar às cegas
3. **Identificar efeitos colaterais** — verificar se a mudança impacta outros módulos
4. **Aplicar a mudança mínima necessária** — sem refatorações não solicitadas
5. **Atualizar o README** ao final de cada chat que gere alteração em algum arquivo

Regras absolutas que nunca devem ser quebradas estão marcadas com 🔴.

---

## O que é o projeto

SPA (Single Page Application) vanilla JS para gestão de reservas do restaurante **Osteria di Lucca**, num contexto hoteleiro. Backend em tempo real com **Firebase Firestore**. Zero frameworks — ES6 modules nativos, sem build step, sem npm. Roda direto no browser via `index.html`.

O Firebase SDK v8 (compat) é carregado via CDN como scripts clássicos **antes** dos módulos ES6. Isso é **intencional e obrigatório** — os módulos precisam do global `firebase` já disponível quando executam.

---

## Versões atuais de todos os arquivos

| Arquivo | Versão | Status |
|---|---|---|
| `js/core/database.js` | v1.4 | ✅ alterado chat 25 — métodos de notificações + escutarReservasPorDataComMudancas |
| `js/core/state.js` | v6.0 | ✅ estável |
| `js/core/init.js` | v2.2 | ✅ alterado chat 25 — importa e chama iniciarEscutaNotificacoes() |
| `js/core/notificacao.js` | v1.0 | ✅ estável |
| `js/core/navigation.js` | v5.5 | ✅ estável |
| `js/features/reservas/listener.js` | v5.0 | ✅ alterado chat 25 — sino simplificado, só nova reserva |
| `js/features/reservas/service.js` | v3.10 | ✅ estável |
| `js/features/reservas/modal.js` | v3.12 | ✅ estável |
| `js/features/reservas/log.js` | v2.1 | ✅ alterado chat 25 — destacarLogPorReservaId sem índice composto |
| `js/features/reservas/validators.js` | v1.2 | ✅ estável |
| `js/features/mesas/modal.js` | v1.4 | ✅ estável |
| `js/features/home.js` | v2.3 | ✅ alterado chat 24 — KPI Degustação + cards condicionais |
| `js/features/dashboard.js` | v3.9 | ✅ estável |
| `js/features/roomservice.js` | v2.2 | ✅ estável |
| `js/ui/render.js` | v6.1 | ✅ alterado chat 24 — mini-card Degustação + visibilidade condicional |
| `js/ui/controls.js` | v8.7 | ✅ estável |
| `js/ui/filters.js` | v3.0 | ✅ estável |
| `js/ui/timers.js` | v4.1 | ✅ estável |
| `index.html` | — | ✅ alterado chat 24 — sino + mini-card Degustação + KPI home Degustação |
| `css/style.css` | v4.13 | ✅ alterado chat 24/25 — alturas de gráficos + estilos do sino |

---

## Estrutura de pastas

```
/
├── index.html                  SPA: login, sidebar, todas as telas como divs ocultas
├── css/
│   └── style.css               Estilos globais, sidebar, home, modal, grid, timers, dark mode
└── js/
    ├── core/
    │   ├── database.js         DatabaseService Singleton — Firebase, Firestore, notificações
    │   ├── init.js             Orquestrador de boot — event delegation, dispatcher de modais
    │   ├── state.js            Fonte única de verdade em memória (nunca window.*)
    │   ├── navigation.js       Troca de telas, sidebar toggle por dispositivo, bottombar sync
    │   └── notificacao.js      Toasts não-bloqueantes — canal oficial de feedback
    │
    ├── features/
    │   ├── reservas/
    │   │   ├── listener.js     onSnapshot reservas + config_dia + escuta notificações por usuário
    │   │   ├── service.js      Todo CRUD Firestore — batch writes, registrarLog, regras de negócio
    │   │   ├── modal.js        ReservaModal — formulário de criação/edição de reservas
    │   │   ├── log.js          Auditoria — timeline com diff visual + destacarLogPorReservaId
    │   │   └── validators.js   Validações reutilizáveis — importado por modal.js e init.js
    │   ├── mesas/
    │   │   └── modal.js        MesaModal — atribuir, iniciar, trocar e liberar mesa
    │   ├── home.js             KPIs, gráficos, Giro de Mesa, Obs Noite, tickers
    │   ├── dashboard.js        Painel analítico de período com Chart.js
    │   └── roomservice.js      Relatório de room services filtrado por data
    │
    └── ui/
        ├── render.js           Grid principal de horários e mini-cards do header
        ├── controls.js         Tema dark/light, gerenciar linhas, relógio do modal
        ├── filters.js          Filtros por tipo de cliente na tela de reservas
        └── timers.js           Cronômetros com cores progressivas (verde/amarelo/vermelho)
```

---

## Carregamento de scripts no index.html

```html
<!-- Firebase SDK clássico — DEVE vir antes de qualquer módulo ES6 -->
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-firestore.js"></script>

<!-- Core -->
<script type="module" src="js/core/init.js"></script>
<script type="module" src="js/core/navigation.js"></script>

<!-- Features -->
<script type="module" src="js/features/home.js"></script>
<script type="module" src="js/features/reservas/log.js"></script>
<script type="module" src="js/features/dashboard.js"></script>
<script type="module" src="js/features/roomservice.js"></script>

<!-- UI -->
<script type="module" src="js/ui/controls.js"></script>
<script type="module" src="js/ui/filters.js"></script>
```

Os demais módulos (`render.js`, `service.js`, `listener.js`, `validators.js` etc.) **não aparecem aqui** — são importados via `import` ES6 pelos módulos que os usam.

---

## Telas da aplicação

Cada tela é uma `<div id="tela-{nome}" class="view">` no `index.html`. A classe `.hidden` (`display:none !important`) é adicionada/removida por `navigation.js`.

| Tela | ID | Carregada por |
|---|---|---|
| Home | `tela-home` | `home.js::carregarHome()` |
| Reservas | `tela-reservas` | `listener.js` (onSnapshot contínuo) |
| Dashboard | `tela-dashboard` | `dashboard.js::carregarDadosDashboard()` |
| Room Service | `tela-roomservice` | `roomservice.js::carregarRoomServices()` |
| Logs | `tela-logs` | `log.js` (carregarLogs() manual via botão BUSCAR) |
| Configurações | `tela-configuracoes` | `init.js::carregarConfiguracoes()` |

---

## Arquitetura — Regras que nunca devem ser quebradas

### 🔴 Regra 1 — Camadas
```
core/     → infraestrutura pura (db, state, notificações, navegação)
features/ → regras de negócio por domínio
ui/       → apresentação e interação visual
```
Camadas superiores nunca importam de camadas inferiores. `ui/` importa de `core/` e `features/`. `features/` importa de `core/`. Nunca o contrário.

### 🔴 Regra 2 — Estado global
`state.js` é a única fonte da verdade em memória. Nenhum módulo usa `window.*` para armazenar estado. Toda leitura e escrita passa pelos getters/setters de `state.js`.

### 🔴 Regra 3 — Feedback ao usuário
`notificacao.js` é o único canal de feedback. Nunca usar `alert()`, `confirm()` ou `prompt()`. Para confirmações destrutivas usar `window.modalConfirmar()` (exposto por `init.js`).

### 🔴 Regra 4 — Firestore apenas em service.js
Todo acesso ao Firestore que envolva regras de negócio deve estar em `service.js`. Arquivos de UI nunca chamam o Firestore diretamente. Exceções permitidas: `database.js` (abstração), `listener.js` (onSnapshot + notificações), `log.js` (auditoria), `home.js` (leitura).

### 🔴 Regra 5 — Posição de reservas
Qualquer código que **crie ou mova** um documento no Firestore com uma posição (`posicao`) **obrigatoriamente** deve:
1. Consultar o snapshot do bloco destino
2. Chamar `_calcularPosicaoLivre(snapBloco, posicaoDesejada)`
3. Nunca copiar a posição de origem diretamente sem verificação

Violação gera documentos fantasmas — bug difícil de detectar que corrompe operações futuras.

### 🔴 Regra 6 — Event delegation
Nenhum evento de clique nos elementos da grade é registrado via `onclick` inline no HTML/templates. Toda interação passa pelo event delegation em `init.js` usando `data-*` attributes.

### 🔴 Regra 7 — stopPropagation em overlays e modais
Todo listener de clique que fecha um modal, overlay ou sidebar **deve** chamar `e.stopPropagation()`. Sem isso o clique faz bubble até o `gridReservas` em `init.js` e aciona células da grade.

**Locais corrigidos:** `reservas/modal.js`, `navigation.js`, `init.js`, `mesas/modal.js` v1.4.

---

## Modelo de dados — Reserva no Firestore

```javascript
{
  data:             "2026-03-15",      // YYYY-MM-DD
  horario:          "20:15",           // horário real exibido
  originalBase:     "20:00",           // bloco a que pertence (coluna do grid)
  posicao:          2,                 // linha dentro do bloco (0-based)
  tipo:             "hospede",         // "hospede" | "externo" | "passante" | "roomservice"
  nomes:            "SILVA, JOÃO",     // sempre em maiúsculas
  apto:             "301",
  whatsapp:         "(11) 99999-9999",
  avulsa:           "",
  paxs:             2,                 // adultos
  chd:              1,                 // crianças
  obs:              "ALERGIA A FRUTOS DO MAR",
  bloqueado:        false,
  somenteHospedes:  false,
  menuDegustacao:   false,             // badge no grid, KPI na home, obs da noite
  pagamento:        "pago",            // "" | "pago" | "pendente"
  mesa:             "5",               // "" | "ROOM" | número como string
  inicioMesa:       "2026-03-15T20:05:00.000Z",
  fimMesa:          "2026-03-15T21:45:00.000Z",
}
```

---

## Modelo de dados — Notificação no Firestore

Coleção: `notificacoes`

```javascript
{
  texto:      "20:30  ·  Hóspede  ·  SILVA, JOÃO",  // exibido no painel do sino
  reservaId:  "abc123xyz",                           // ID do doc da reserva
  timestamp:  "2026-03-15T20:30:00.000Z",            // ISO string
  lido_por:   ["recepcao"],                          // usuários que já leram
}
```

Janela de escuta: **12 horas** atrás. Notificações são filtradas no cliente — docs onde `lido_por` não contém o usuário atual são considerados pendentes.

---

## Sino de notificações — listener.js v5.0 + database.js v1.4

### Fluxo completo

1. `escutarReservasPorDataComMudancas()` detecta `docChanges()` do Firestore
2. Filtra apenas `type === 'added'` com `nomes` preenchido (ignora bloqueados, somenteHospedes, linhas vazias)
3. Salva doc em `notificacoes/{id}` com `lido_por: []` via `db.salvarNotificacao()`
4. `iniciarEscutaNotificacoes()` (chamado no boot por `init.js`) escuta a coleção `notificacoes` em tempo real para o usuário atual
5. Filtra no cliente docs onde `lido_por` não contém `USUARIO_ATUAL`
6. Se houver pendentes → sino pisca infinitamente. Se lista esvaziar → sino para automaticamente

### Texto da notificação
```
20:30  ·  Hóspede  ·  SILVA, JOÃO
```
Formato: `horario · tipo · nomes`

### Painel ao clicar no sino
- Lista todas as notificações pendentes do usuário
- Botão **OK** marca todas como lidas via `db.marcarNotificacaoLida(id, usuario)` → `arrayUnion`
- O `onSnapshot` dos outros usuários não é afetado — cada um tem seu próprio controle de leitura
- Fecha ao clicar fora

### Usuários cadastrados
```javascript
const USUARIOS_VALIDOS = {
    'recepcao': 'usuario1',
    'osteria':  'usuario2',
    'gerencia': 'usuario 3'
};
```
Identificador salvo em `localStorage('usuario_nome')` no login.

### Métodos novos em database.js v1.4

| Método | O que faz |
|---|---|
| `salvarNotificacao(dados)` | Cria doc em `notificacoes` com `lido_por: []` |
| `marcarNotificacaoLida(id, usuario)` | `arrayUnion(usuario)` em `lido_por` |
| `escutarNotificacoesNaoLidas(usuario, callback)` | onSnapshot com filtro no cliente; retorna unsubscribe |
| `escutarReservasPorDataComMudancas(data, cbReservas, cbMudancas)` | Como `escutarReservasPorData` + expõe `docChanges()` |

### ⚠️ Índices Firestore
A query `where('reservaId', '==', id).orderBy('timestamp', 'desc')` exige índice composto. Para evitar isso, `log.js::destacarLogPorReservaId` faz apenas `where('reservaId', '==', id)` e ordena no cliente.

### Sino no HTML (index.html)
```html
<div id="sino-notificacao" class="sino-wrap">
  <svg id="sino-icone" .../>
  <span id="sino-badge" class="sino-badge hidden"></span>
</div>
```
Posicionado dentro do `.left-group` ao lado do input de data na tela de reservas. No tablet, `.left-group` tem `display: flex; align-items: center; gap: 8px` explícito na media query `max-width: 900px`.

### Animação CSS (style.css v4.13)
```css
@keyframes sino-piscar { /* balanço de 0.7s */ }
.sino-animando #sino-icone { animation: sino-piscar 0.7s ease infinite; color: #e74c3c; }
```
Pisca **infinitamente** — só para quando o usuário clica e marca como lido.

---

## Menu Degustação — integração completa (chat 23–24)

### Checkbox no modal (reservas/modal.js v3.12)
- `#checkMenuDegustacao` dentro de `.pax-column-check` na `.pax-row` de `#camposReserva`
- **Oculto para Room Service** via `.tipo-roomservice` no `#modalReserva` (CSS, não inline)
- `_limparFormulario()` reseta `checked = false`
- `_preencherFormulario()` restaura o valor ao editar
- `obterDados()` inclui `menuDegustacao: this.elementos.checkMenuDegustacao?.checked || false`

### Badge no grid (render.js v6.1)
```html
<span class="badge-deg">🍽 DEG</span>
```

### Mini-card na tela de reservas (render.js v6.1)
- ID: `#dashMenuDegustacao`, border `#d4a373`
- Conta **adultos** (`qtdAdultos`), não reservas
- **Oculto** quando `totais.menuDegustacao === 0`
- Filtrável via `aplicarFiltro('menuDegustacao')`

### KPI na tela home (home.js v2.3)
- ID: `#home-kpi-degustacao`, label "Degustação"
- Conta adultos (`adt`) de reservas com `menuDegustacao === true`
- **Oculto** quando `degustacao === 0` via `.closest('.home-kpi-card').style.display`

### Obs da Noite (home.js v2.3)
Filtra reservas com `obs` **ou** `menuDegustacao === true`. Ordenadas por horário.
Coluna esquerda: `Mesa 9` (formato corrigido — era `M.9`).

### Cards condicionais na home (home.js v2.3)
Os cards **Crianças**, **Room** e **Degustação** são ocultados quando seu valor é zero:
```javascript
['home-kpi-criancas', 'home-kpi-roomservice', 'home-kpi-degustacao'].forEach(id => {
    el.closest('.home-kpi-card').style.display = valor > 0 ? '' : 'none';
});
```

### Por que CSS em vez de style.display inline no modal
`_mostrarCamposBasicos()` faz `querySelectorAll("*").forEach(el => el.style.display = "")` — reseta qualquer inline. Solução: classe `.tipo-roomservice` no `#modalReserva` + CSS:
```css
#modalReserva.tipo-roomservice .pax-column-check { display: none !important; }
```

---

## Validação de reservas — validators.js v1.2

**Fonte única de validação.** Importado por `reservas/modal.js` e `js/core/init.js`.

> ⚠️ **O arquivo deve existir no servidor em `js/features/reservas/validators.js`.**
> 404 → modal.js não carrega → init.js não carrega → grid não renderiza → tema dark não restaura.

### Regras obrigatórias por tipo

| Tipo | Campos obrigatórios |
|---|---|
| `hospede` | `apto`, `nomes`, `paxs >= 1` |
| `externo` | `nomes`, `paxs >= 1` |
| `passante` | `nomes`, `paxs >= 1` |
| `roomservice` | `apto`, `nomes`, `paxs >= 1` |
| `bloqueado` / `somenteHospedes` | nenhum — bypass automático |

### ⚠️ Armadilha — validarApartamento vs obrigatoriedade
`validarApartamento('')` retorna **`true`** — apto é opcional para externos/passantes. Para checar **presença obrigatória**, usar `validarNaoVazio(dados.apto)`. **Nunca substituir por `validarApartamento`.**

---

## Comportamento de linhasExtras (config_dia)

- Cada bloco abre com **3 linhas base** por padrão
- `linhasExtras[hr]` pode ser **negativo** — intencional (linhas removidas pelo usuário)
- Persiste via `config_dia/{data}` no Firestore

```
linhas visíveis = base + linhasExtras[hr]
base = 3 para horários padrão | base = 1 para horários editados
```

---

## Horários padrão

Definidos em `state.js::getHorariosPadrao()`:
```javascript
["20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]
```
Nunca hardcodar esta lista em outro lugar.

---

## Sincronização de dois listeners (listener.js)

A tela de reservas mantém dois `onSnapshot` simultâneos (reservas + config_dia). Flags `reservasCarregadas` e `configCarregada` garantem que a grade só renderiza quando **os dois** entregaram. Ao trocar de data, flags resetam e listeners reiniciam.

O terceiro listener (`escutarNotificacoesNaoLidas`) é independente — iniciado uma única vez no boot, nunca cancelado.

---

## Mecanismo anti-fantasma

**Fantasma:** doc no Firestore com `posicao` fora do range visual.

| Camada | Onde | Quando |
|---|---|---|
| Preventiva | `_calcularPosicaoLivre()` em `service.js` | Toda criação/movimentação |
| Reativa | `removerLinhaDoBloco()` em `service.js` | Ao remover linha |
| Proativa | `limparFantasmasDoDia()` em `service.js` | 2s após boot, uma vez por sessão |

---

## Fluxo obrigatório ao criar/mover reserva

```javascript
// 1. Buscar snapshot do bloco destino
const snap = await firestore.collection('reservas')
  .where('data', '==', data).where('originalBase', '==', originalBase).get();

// 2. Calcular posição livre
const pos = _calcularPosicaoLivre(snap, posicaoDesejada);

// 3. Salvar com batch
const batch = firestore.batch();
batch.delete(refAntigo);
batch.set(firestore.collection('reservas').doc(), { posicao: pos, ...dados });
await batch.commit();
// NUNCA batch.add() — não existe no SDK v8
```

---

## Mapa de funções — service.js v3.10

| Função | O que faz | Usa _calcularPosicaoLivre? |
|---|---|---|
| `salvarReserva(dados)` | Cria ou edita reserva | ✅ Sempre que cria |
| `excluirReserva(id)` | Deleta + log | — |
| `desbloquearReserva(id)` | Remove flags de bloqueio | — |
| `salvarApenasHorario(dados)` | Muda horário/bloco | ✅ Nos dois branches |
| `atribuirMesa` / `iniciarAtendimento` / `finalizarAtendimento` / `cancelarMesa` | Updates simples | — |
| `atualizarBloqueio` / `adicionarObservacao` | Updates simples | — |
| `alterarData(id, novaData)` | Move para outra data | ✅ v3.9 |
| `buscarReservasPorData` / `buscarReservasPorPeriodo` | Leituras pontuais | — |
| `removerLinhaDoBloco(hr, data)` | Remove linha + reposiciona | ✅ |
| `limparFantasmasDoDia(data)` | Varredura proativa | — |

---

## Navegação e sidebar — navigation.js v5.5

| Dispositivo | Comportamento |
|---|---|
| Desktop (> 1200px) | Sidebar hover CSS: 52px → 220px. Botão ☰ oculto. |
| Tablet (768px–1200px) | Sidebar 52px fixo com ícones. Botão ☰ abre/fecha via JS. Overlay transparente. |
| Landscape mobile (≤ 767px landscape) | Sidebar oculta (`left: -220px`). Botão ☰ com overlay escuro. |
| Portrait mobile (≤ 767px portrait) | Sem sidebar. Bottombar cuida da navegação. |

### Hooks de tela ao navegar
```javascript
navegar('home')          → _atualizarLabelDataHome() + carregarHome()
navegar('dashboard')     → carregarDadosDashboard() (delay 100ms)
navegar('roomservice')   → carregarRoomServices() + preenche data atual se vazia
navegar('configuracoes') → carregarConfiguracoes()
// Logs NÃO tem hook — carregarLogs() é manual via botão BUSCAR
```

### ⚠️ Armadilha do :hover CSS no tablet
O CSS global tem regras `.sidebar:hover` que no tablet ativam via toque e deslocam o layout. Media query `(min-width: 768px) and (max-width: 1200px)` neutraliza. **Se adicionar novos elementos à sidebar com `.sidebar:hover`, neutralizá-los nessa media query.**

---

## Tela Home — home.js v2.3

### Duas listas — NUNCA confundir
```javascript
const reservasHoje = [...];  // COMPLETA — Giro de Mesa, Obs Noite
const reaisHoje = reservasHoje.filter(r => r.nomes && !r.bloqueado && !r.somenteHospedes);  // FILTRADA — KPIs, gráficos
```

### Cards condicionais (v2.3)
`home-kpi-criancas`, `home-kpi-roomservice` e `home-kpi-degustacao` ficam ocultos quando seu valor é zero. Atualiza a cada snapshot do Firebase.

### Obs da Noite (v2.3)
- Filtra reservas com `obs` ou `menuDegustacao === true`
- Ordenadas por horário
- Coluna esquerda: `Mesa 9` (não `M.9`)

### Ticker KPI
Visível em `≤1200px`. Clones triplicados do `#home-kpis-grid`. RAF a ≈40px/s. Altura forçada 88px via JS. Pausa ao toque.

---

## DatabaseService — database.js v1.4

Singleton. Métodos:

**Originais:** `aguardarInicializacao`, `getFirestore`, `getReservasPorData`, `getReservasPorPeriodo`, `getReservaPorId`, `criarReserva`, `atualizarReserva`, `excluirReserva`, `escutarReservasPorData`, `salvarConfigDia`, `escutarConfigDia`, `limparConfigDiasAntigos`.

**Novos (v1.4):**
- `escutarReservasPorDataComMudancas(data, cbReservas, cbMudancas)` — expõe `docChanges()` para o sino
- `salvarNotificacao(dados)` — cria doc em `notificacoes`
- `marcarNotificacaoLida(id, usuario)` — `arrayUnion` em `lido_por`
- `escutarNotificacoesNaoLidas(usuario, callback)` — onSnapshot + filtro no cliente

---

## Log de alterações — log.js v2.1

Timeline com diff ANTES/DEPOIS. Carregada manualmente via botão BUSCAR.

### destacarLogPorReservaId(reservaId)
Chamada por `listener.js` ao clicar numa notificação do sino.

Fluxo:
1. Limpa o container imediatamente (evita mostrar conteúdo anterior)
2. Tenta a query até **5 vezes com 800ms** de intervalo (cobre race condition: notificação chega antes do `registrarLog` terminar)
3. Query: `where('reservaId', '==', reservaId)` sem `orderBy` — **evita necessidade de índice composto**
4. Ordena no cliente por `timestamp` desc, pega o mais recente
5. Renderiza apenas **esse único log** — nada mais
6. `requestAnimationFrame` → scroll + destaque dourado 3s + abre diff automaticamente

### ⚠️ Race condition — notificação vs registrarLog
O `docChanges()` do listener chega quando o Firestore confirma a escrita da reserva, mas `registrarLog()` ainda está executando em paralelo. O retry de 5×800ms garante que o log seja encontrado.

### ⚠️ Índice composto não necessário
Query com apenas `where` simples — sem `orderBy` no Firestore. Ordenação feita no cliente.

---

## Login

Credenciais hardcoded em `index.html`. Sem Firebase Auth. Adequado para uso interno.
Login salvo em `localStorage('usuario_nome')`.

```javascript
const USUARIOS_VALIDOS = {
    'recepcao': 'usuario1',
    'osteria':  'usuario2',
    'gerencia': 'usuario 3'
};
```

---

## Configurações

Salvas em `localStorage('osteria_config')`: `{ "capacidade": 30, "mesas": 18 }`.

---

## Timers de mesa — timers.js v4.1

| Tipo | Verde | Amarelo | Vermelho |
|---|---|---|---|
| Padrão | 0–89 min | 90–114 min | 115+ min |
| Room Service | 0–44 min | — | 45+ min (piscante) |

---

## Pitfalls conhecidos

### `validators.js` deve existir no servidor
404 → cadeia inteira quebra.

### `validarApartamento('')` retorna `true`
Nunca usar para checar obrigatoriedade.

### `:hover` CSS ativa em touch no tablet
Neutralizado na media query do tablet.

### `stopPropagation` obrigatório em overlays
Clique fora sem stopPropagation → bubble → grid abre célula.

### `batch.add()` não existe no SDK v8
Usar `batch.set(firestore.collection(...).doc(), dados)`.

### Firebase SDK — ordem obrigatória
`firebase-app.js` e `firebase-firestore.js` antes de qualquer `<script type="module">`.

### `linhasExtras` negativo — não é bug
Intencional. Nunca corrigir para `0`.

### `height:100%` colapsa no ticker
Forçar `height: 88px` via JS em `_iniciarKpiTicker()`.

### `forEach` reseta style.display nos filhos de camposReserva
`_mostrarCamposBasicos()` faz `querySelectorAll("*").forEach(el => el.style.display = "")`. Qualquer display inline nos filhos é anulado. Solução: classe CSS no elemento pai.

### Logs não têm hook de navegação
`navegar('logs')` **não chama** `carregarLogs()`. A tela de logs só carrega via botão BUSCAR. A função `destacarLogPorReservaId` faz sua própria busca independente.

### Notificações — índice Firestore
`where('reservaId', '==', id).orderBy('timestamp', 'desc')` exige índice composto — **não usar**. Sempre ordenar no cliente.

### Race condition notificação vs log
O sino dispara via `docChanges()` antes do `registrarLog()` terminar. `destacarLogPorReservaId` tem retry de 5×800ms para contornar.

### Erro no console que não é do projeto
`Uncaught (in promise) Error: A listener indicated an asynchronous response...` — extensões do browser. Confirmar em aba anônima.

---

## Pendências

### 🔴 Segurança (antes de produção pública)
- Login sem Firebase Auth — credenciais hardcoded no `index.html`
- API key visível em `database.js`

### 🔵 Melhorias arquiteturais
- **Bug #12** — Extrair `formatarTempo(segundos)` usada inline em 4 arquivos
- **Bug #15** — Remover `buscarReservasPorData/Periodo` de `service.js` (duplicam `database.js`)

### 🟡 Melhorias futuras
- Firebase Auth + regras Firestore por perfil
- Limpeza automática de notificações antigas (> 24h)
- Horários padrão — expor na tela de configuração
- Room Service não aparece na bottombar — avaliar
- Gráfico semanal usa `get()` — considerar `onSnapshot`

---

## Histórico de chats

| Chat | O que mudou |
|---|---|
| **25** | Sino de notificações por usuário. `database.js` v1.4: `escutarReservasPorDataComMudancas`, `salvarNotificacao`, `marcarNotificacaoLida`, `escutarNotificacoesNaoLidas`. `listener.js` v5.0: só `added` com nomes gera notificação; texto `horario · tipo · nomes`; sino pisca até cada usuário clicar OK individualmente. `init.js` v2.2: `iniciarEscutaNotificacoes()` no boot. `log.js` v2.1: `destacarLogPorReservaId` sem índice composto, retry 5×800ms, renderiza só o log da reserva. Corrigido bug de sintaxe no `database.js` (JSDoc cortado). |
| **24** | Cards condicionais. `render.js` v6.1: mini-card Degustação (contagem por adulto), visibilidade condicional de Crianças/Room/Degustação. `home.js` v2.3: KPI Degustação (por adulto), cards condicionais. `style.css` v4.12→v4.13: alturas de gráficos responsivas, estilos do sino. `index.html`: sino + mini-card Degustação reservas + KPI Degustação home. Label `M.9` → `Mesa 9` em Obs da Noite. |
| **23** | Menu Degustação totalmente integrado. `reservas/modal.js` v3.12: checkbox, `_limparFormulario`, `obterDados`, `_preencherFormulario`. `service.js` v3.10: campo salvo. `render.js` v6.0: badge 🍽 DEG. `home.js` v2.2: Obs da Noite com degustação. `style.css` v4.10. |
| **22** | `mesas/modal.js` v1.4: stopPropagation. `reservas/modal.js` v3.6→v3.7: reserva em atendimento oculta campos. Checkbox Menu Degustação no `index.html`. |
| **21** | `validators.js` v1.2 integrado. `stopPropagation` em overlays. Sidebar tablet migrada para toggle JS. `navigation.js` v5.5. |
| **20** | `alterarData()` recalcula posição no destino. `service.js` v3.9. README reescrito. |
| **19** | Bug `salvarApenasHorario()` branch vazio. `service.js` v3.8. Breakpoint ticker `1024px` → `1200px`. |
| **18** | Auditoria de bugs. `listener.js` v4.1. |
| **17** | Breakpoint → 1200px. Ticker Obs Noite vertical. |
| **16** | Bug ticker height:0 corrigido. |
| **15** | Card Giro de Mesa. KPI ticker horizontal RAF. |
| **14** | `navigation.js` v5.3: portrait/landscape. `home.js` onSnapshot, gauge. |
| **13** | Sidebar mobile: botão ☰, toggle JS, overlay. |
| **12** | Tela home como padrão. Sidebar hover desktop. |
| **7–11** | `render.js`, sidebar, `init.js`, `limparFantasmasDoDia`, `modalConfirmar`. |

---

## Arquivos a enviar no próximo chat

| Arquivo | Versão | Obs |
|---|---|---|
| `readme.md` | — | Este arquivo |
| `js/core/database.js` | v1.4 | ✅ alterado chat 25 |
| `js/core/state.js` | v6.0 | |
| `js/core/init.js` | v2.2 | ✅ alterado chat 25 |
| `js/core/notificacao.js` | v1.0 | |
| `js/core/navigation.js` | v5.5 | |
| `js/features/home.js` | v2.3 | ✅ alterado chat 24 |
| `js/features/reservas/listener.js` | v5.0 | ✅ alterado chat 25 |
| `js/features/reservas/service.js` | v3.10 | |
| `js/features/reservas/modal.js` | v3.12 | |
| `js/features/reservas/log.js` | v2.1 | ✅ alterado chat 25 |
| `js/features/reservas/validators.js` | v1.2 | |
| `js/features/mesas/modal.js` | v1.4 | |
| `js/features/dashboard.js` | v3.9 | |
| `js/features/roomservice.js` | v2.2 | |
| `js/ui/render.js` | v6.1 | ✅ alterado chat 24 |
| `js/ui/controls.js` | v8.7 | |
| `js/ui/filters.js` | v3.0 | |
| `js/ui/timers.js` | v4.1 | |
| `css/style.css` | v4.13 | ✅ alterado chat 24/25 |
| `index.html` | — | ✅ alterado chat 24/25 |

> **Primeira mensagem do próximo chat:** mencionar que estamos no **chat 26**, continuando do chat 25. Sem bug ativo — aguardar o que o usuário quiser resolver. Incluir este README e todos os arquivos acima.