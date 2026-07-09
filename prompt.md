# Osteria Di Lucca — Sistema de Gestão de Reservas

**README versão:** 4.24  
**Data:** 2026-07-09  

---

## 1. Contexto do Projeto

Sistema web de gerenciamento de reservas para o restaurante **Osteria Di Lucca**. Usado em tablet durante o serviço do jantar. Controla reservas em tempo real, atribuição de mesas, timers de atendimento, room service e analytics.

**Não há build step.** JavaScript ES6 modules nativos carregados diretamente pelo browser. Firebase Firestore como banco em tempo real via CDN compat (não modular).

**URL local de desenvolvimento:** `http://127.0.0.1:5500/osteria21/osteria-reservas/`

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6 modules nativos (sem bundler, sem npm) |
| Banco de dados | Firebase Firestore v8.10.0 (CDN compat — `firebase-app.js` + `firebase-firestore.js`) |
| Gráficos | Chart.js (CDN) |
| Autenticação | Firebase Authentication (e-mail/senha) — sessão validada pelo servidor |
| Deploy | Arquivos estáticos — sem servidor backend |

---

## 3. Estrutura de Arquivos

```
/osteria21/osteria-reservas/
├── index.html                         ← Único HTML. Contém login, todos os modais, carrega scripts
├── css/
│   └── style.css                      ← Estilos globais, dark/light theme, timers, grade
└── js/
    ├── config/
    │   └── firebase-config.js         ← Inicializa Firebase (usa CDN global firebase.*)
    ├── core/
    │   ├── database.js                ← DatabaseService singleton — ÚNICO acesso ao Firestore
    │   ├── init.js                    ← Boot do sistema. Orquestra tudo ao carregar a página
    │   ├── navigation.js              ← Troca de telas e controle do menu lateral
    │   └── state.js                   ← Estado global: reservas, data, linhasExtras, filtros
    ├── features/
    │   ├── reservas/
    │   │   ├── listener.js            ← Listener onSnapshot do Firebase. Re-renderiza automaticamente
    │   │   ├── log.js                 ← Registra CRIAR/EDITAR/EXCLUIR/DESBLOQUEAR no Firestore
    │   │   ├── modal.js               ← Classe ReservaModal — todo o fluxo do modal de reserva
    │   │   └── service.js             ← CRUD assíncrono do Firestore
    │   ├── mesas/
    │   │   └── modal.js               ← Classe MesaModal — atribuição e timers de mesas
    │   ├── dashboard.js               ← Analytics com Chart.js. Expostos via window.*
    │   └── roomservice.js             ← Relatório de room service
    └── ui/
        ├── controls.js                ← Funções globais (window.*): tema, relógio, linhas, bloqueio
        ├── filters.js                 ← Filtros por tipo de cliente na grade
        ├── render.js                  ← Renderiza a grade de reservas e mini-cards
        ├── timers.js                  ← Atualiza cronômetros de mesa a cada segundo
        └── validators.js              ← Funções de validação e formatação reutilizáveis
```

---

## 4. Versões Atuais de Todos os Arquivos

| Arquivo | Versão | Última mudança significativa |
|---|---|---|
| `js/config/firebase-config.js` | v1.0 | Inicialização Firebase |
| `js/core/supabaseClient.js` | **v1.0** | Criado em 2026-07-09 — Fase 1 da migração Firestore→Supabase, ver `plano_de_ação.md` |
| `supabase/migrations/20260709133321_initial_schema.sql` | — | Criado em 2026-07-09 — Fase 2: schema real (hospedes/mesas/reservas/reservas_log/config_dia/notificacoes), aplicado e testado (RLS bloqueando acesso, como esperado antes da Fase 3) |
| `supabase/migrations/20260709135200_rls_policies.sql` | — | Criado em 2026-07-09 — Fase 3: políticas RLS (`auth.uid() is not null`) nas 6 tabelas. Decisão: login de produção migra pro Supabase Auth só na Fase 5 (junto com o resto do código) |
| `supabase/migrations/20260709140241_grants_authenticated.sql` | — | Criado em 2026-07-09 — Fase 3: `GRANT` ao papel `authenticated` nas 6 tabelas. RLS sozinho não bastava porque "Expor automaticamente novas tabelas" foi desmarcado na Fase 1 — Postgres bloqueava antes mesmo de avaliar as políticas |
| `scripts/migrar-dados.mjs` | v1.0 | Criado em 2026-07-09 — Fase 4: migração única dos dados do Firestore pro Supabase. 100% dos registros migrados (477 reservas, 225 logs, 12 config_dia, 250 notificações). Suporta `--retry-ids=` pra reprocessar registros específicos sem duplicar o resto |
| `js/core/database.js` | **v1.5** | Persistência offline do Firestore ativada (bug #41) |
| `js/core/init.js` | **v1.3** | Corrige leitura do relógio em ALTERAR HORÁRIO |
| `js/core/navigation.js` | v4.10 | Overlay fecha menu lateral |
| `js/core/state.js` | v4.22 | Permite `linhasExtras` negativos |
| `js/features/reservas/modal.js` | **v3.11** | Centraliza reset de estado de bloqueio em `_limparFormulario()` |
| `js/features/reservas/service.js` | **v2.5** | `salvarApenasHorario` sempre atualiza `originalBase` + posição livre |
| `js/features/reservas/listener.js` | **v4.2** | `recarregarNotificacoes()` — sino reconecta em `onAuthStateChanged` (dívida técnica #2 resolvida) |
| `js/features/reservas/log.js` | v1.3 | Exibe usuário logado nos cards |
| `js/features/reservas/validators.js` | **v1.3** | `escapeHtml()` adicionada — sanitização de saída contra XSS |
| `js/features/mesas/modal.js` | v1.0 | — |
| `js/features/dashboard.js` | **v3.14** | Remove `borderRadius` das barras empilhadas — corrige "degrau" visual (bug #49) |
| `js/features/home.js` | **v2.5** | Remove `borderRadius` da barra empilhada — corrige "degrau" visual (bug #49) |
| `js/features/roomservice.js` | **v2.3** | Escapa `nomes`/`obs` no card — corrige XSS |
| `js/ui/controls.js` | **v7.9** | `ajustarHora()` adicionada |
| `js/ui/filters.js` | v3.0 | 100% modular |
| `js/ui/render.js` | **v6.0** | Escapa `nomes`/`obs`/`avulsa` antes de inserir em innerHTML — corrige XSS |
| `js/ui/timers.js` | v4.1 | Sem dependência de render.js |
| `index.html` | — | Scripts Firebase (CDN) sem `integrity` (SRI, bug #36); login gate usa `onAuthStateChanged()` como fonte da verdade em vez de `localStorage`, chamando `recarregarReservas()` + `carregarHome()` + `recarregarNotificacoes()` ao confirmar usuário real (bugs #37, #38, #40); manifest/ícones linkados e Service Worker registrado (bugs #42, #43) |
| `css/style.css` | — | — |
| `manifest.json` | — | Criado em 2026-07-03 — nome, ícones e cores do PWA (bug #42) |
| `sw.js` | **v1.1** | `{ cache: 'no-store' }` em todos os `fetch()` — evita reforçar cache HTTP desatualizado (bug #44) |
| `firebase.json` / `.firebaserc` | — | Corrigido em 2026-07-03 — deploy de Hosting agora aponta pro mesmo projeto do Firestore/Auth (`osteriadilucca-afea6`), site `osteriadilucca` → **https://osteriadilucca.web.app**. Antes apontava, por engano, pro projeto de um produto não relacionado (`osteria-di-lucca-links`, um encurtador de links) — ver bug #39 |

---

## 5. Arquitetura Central

### 5.1 DatabaseService (`database.js`) — REGRA CRÍTICA

**Todo acesso ao Firestore passa exclusivamente pelo DatabaseService.** Nunca usar `window.db`, `firebase.firestore()` ou qualquer outra forma direta.

```javascript
import { db } from '../../core/database.js';

// Padrão obrigatório em qualquer módulo que acesse o Firestore:
await db.aguardarInicializacao();
const firestore = db.getFirestore();
await firestore.collection('reservas').doc(id).update({ campo: valor });
```

| Método do DatabaseService | Descrição |
|---|---|
| `db.aguardarInicializacao()` | Promise — aguarda Firebase pronto (timeout 10s) |
| `db.getFirestore()` | Retorna instância Firestore compat |
| `db.getReservasPorData(data)` | Busca snapshot por data |
| `db.getReservasPorPeriodo(ini, fim)` | Busca entre datas |
| `db.getReservaPorId(id)` | Busca um doc |
| `db.criarReserva(dados)` | Adiciona doc |
| `db.atualizarReserva(id, dados)` | Atualiza doc |
| `db.excluirReserva(id)` | Deleta doc |
| `db.escutarReservasPorData(data, cb)` | Listener `onSnapshot` — retorna `unsubscribe` |

### 5.2 Estado Global (`state.js`)

| Função | Descrição |
|---|---|
| `getDataAtual()` | Data atual `YYYY-MM-DD` (lê `#dataFiltro` ou data do sistema) |
| `setDataAtual(str)` | Atualiza data |
| `getTodasReservas()` | Array de reservas do dia em memória |
| `setTodasReservas(arr)` | Atualiza array + `window.todasReservas` |
| `getHorariosPadrao()` | `["20:00","20:30","21:00","21:30","22:00","22:30"]` (ou `window.horariosPadrao`) |
| `getConfig()` | Lê `localStorage["osteria_config"]` → `{capacidade, mesas}` |
| `getLinhasExtras()` | Objeto `{hr: delta}` — linhas extras/removidas por slot |
| `setLinhasExtras(obj)` | Substitui objeto inteiro |
| `adicionarLinhaExtra(hr)` | Incrementa delta do slot |
| `removerLinhaExtra(hr)` | Decrementa delta do slot (pode ir negativo) |
| `getFiltroAtivo()` / `setFiltroAtivo(tipo)` | Filtro da grade (null = nenhum) |
| `getUnsubscribe()` / `setUnsubscribe(fn)` | Referência ao listener Firebase ativo |

`window.todasReservas` e `window.linhasExtras` são mantidos sincronizados por compatibilidade com código legado. Novos módulos usam sempre as funções do `state.js`.

### 5.3 Sequência de Boot (`init.js`)

```
DOMContentLoaded
  → aguardarFirebase()          — db.aguardarInicializacao()
  → window.linhasExtras = {}    — inicializa objeto de controle de linhas
  → configurarDataInicial()     — lê/seta #dataFiltro
  → new ReservaModal()          — instancia modal de reservas
  → new MesaModal()             — instancia modal de mesas + gera botões
  → configurarEventListeners()  — grade, btnSalvar, btnExcluir, etc.
  → escutarReservas()           — ativa listener Firebase
  → iniciarTimers()             — setInterval(atualizarTimers, 1000)
  → configurarTema()            — aplica tema salvo no localStorage
  → exponerFuncoesGlobais()     — window.abrirModal, abrirEditar, atribuirMesa, etc.
```

### 5.4 Fluxo de Re-renderização — REGRA CRÍTICA

**Nunca chamar `renderizarGrid()` manualmente após operações Firebase** (exceto em `acaoExcluir()` e `acaoAdicionar()`). O listener `onSnapshot` detecta qualquer mudança no Firestore e chama `renderizarGrid()` automaticamente.

```
Firebase.update() / .add() / .delete()
  → onSnapshot dispara
  → listener.js recebe reservas
  → setTodasReservas(reservas)
  → renderizarGrid(reservas)   ← automático
```

Exceções que chamam `renderizarGrid` manualmente:
- `acaoExcluir()` — operação local que remove linha sem tocar Firebase
- `acaoAdicionar()` — adiciona linha visual sem Firebase

---

## 6. Modelo de Dados — Coleção `reservas`

```
reservas/{autoId} {
  data:             string    "YYYY-MM-DD"         — obrigatório
  horario:          string    "HH:MM"              — horário visível na linha
  originalBase:     string    "HH:MM"              — define o BLOCO na grade (ver §7)
  posicao:          number    0, 1, 2…             — linha dentro do bloco
  tipo:             string    "hospede" | "externo" | "passante" | "roomservice"
  nomes:            string    maiúsculas — vazio = linha disponível
  apto:             string    número do apartamento (hospede/roomservice)
  whatsapp:         string    "(XX) XXXXX-XXXX"    (externo)
  avulsa:           string    valor da taxa avulsa (externo)
  paxs:             number    adultos
  chd:              number    crianças
  obs:              string    maiúsculas, separador " | " ao concatenar
  pagamento:        string    "pago" | "pendente" | ""
  bloqueado:        boolean   slot bloqueado (vermelho)
  somenteHospedes:  boolean   só hóspedes (azul)
  mesa:             string    "1"–"18" | "ROOM" | ""
  inicioMesa:       string    ISO 8601 timestamp | undefined
  fimMesa:          string    ISO 8601 timestamp | undefined
}
```

**Linha disponível** = documento com `nomes: ""` (ou falsy), `bloqueado: false`, `somenteHospedes: false`.

---

## 7. Grade de Reservas — Funcionamento Completo

### 7.1 Conceito de `horario` vs `originalBase` — REGRA CRÍTICA

| Campo | Significado | Quem define |
|---|---|---|
| `originalBase` | **Slot da grade.** Em qual bloco a reserva aparece | Sempre atualizado junto com `horario` ao usar ALTERAR HORÁRIO |
| `horario` | Horário real exibido na linha | Pode ser diferente do `originalBase` (legado — casos raros) |

**Regra de ouro:** o bloco de exibição é sempre determinado por `originalBase`. O `horario` é só o texto exibido na célula de dados.

Reservas legadas sem `originalBase` usam `horario` como fallback:
```javascript
r.originalBase === hrBase || (!r.originalBase && r.horario === hrBase)
```

### 7.2 Tipos de Bloco

| Tipo | Condição | Comportamento |
|---|---|---|
| **Bloco padrão** | `originalBase` ∈ `["20:00","20:30","21:00","21:30","22:00","22:30"]` | Exibe N slots por posição. Tem botão de gerenciar linhas. |
| **Bloco editado** | `originalBase` fora do padrão (ex: `"20:15"`, `"21:45"`) | Bloco próprio inserido na ordem cronológica correta |

### 7.3 Linhas por Slot

Cada bloco padrão exibe `3 + (linhasExtras[hr] || 0)` linhas. `linhasExtras` pode ser negativo (remover linhas):

```javascript
window.linhasExtras = {
  "20:00":  2,   // 5 linhas visíveis
  "21:00": -1,   // 2 linhas visíveis
  "22:30":  0,   // 3 linhas (padrão)
}
```

**`Math.max(0, linhasExtras)` nunca deve ser aplicado.** Negativos são intencionais.

### 7.4 Lógica de Renderização (`render.js` v5.3)

```
Para cada bloco (padrão + editados, ordenados cronologicamente):

SE bloco editado (originalBase fora do padrão):
  linhasEditadas = reservas onde (originalBase || horario) === hrBloco
  Renderiza todas na ordem de posicao. Sem limite de linhas.

SE bloco padrão:
  filtradasBase = reservas onde originalBase === hrBase (exceto vazias com hrFora)
  slotsBase = array[limiteConfigurado] indexado por posicao
  linhasMigradas = reservas onde originalBase === hrBase E horario é outro padrão
  linhasForaPadrao = reservas vazias onde originalBase === hrBase E horario fora do padrão
  totalLinhas = slots + migradas + foraPadrao  ← usado no rowspan
  Renderiza slots, depois migradas, depois foraPadrao
```

**Regra do `rowspan` — CRÍTICA:**
```javascript
const totalLinhas = linhasOrdenadas.length + linhasMigradas.length + linhasForaPadrao.length;
// rowspan na célula HORA = totalLinhas
// Sem isso, células HORA ficam ausentes e a tabela quebra visualmente
```

### 7.5 Estrutura Visual da Grade

```
| HORA  | DADOS DA RESERVA         | PAX | CHD | MESA | PAG |
|-------|--------------------------|-----|-----|------|-----|
| 20:00 | APTO 101 — JOÃO          |  2  |  0  |  3   | pago|  ← rowspan=3
|       | EXT — MARIA              |  4  |  1  |  -   |  -  |
|       | + DISPONÍVEL             |  -  |  -  |  -   |  -  |
| 20:15 | EXT — CARLOS (editado)   |  2  |  0  |  -   |  -  |  ← bloco próprio
| 20:30 | APTO 632 — ALESSANDRA    |  2  |  0  |  6   |  -  |
```

---

## 8. Fluxo Completo — ALTERAR HORÁRIO

### 8.1 A partir de linha disponível

1. Clicar na linha vazia → `reservaModal.abrirNova(horario, posicao, hrBase)`
2. Resumo exibe 4 opções: NOVA RESERVA / BLOQUEAR / ALTERAR HORÁRIO / FECHAR
3. Clicar ALTERAR HORÁRIO → relógio aparece, campos ocultos
4. Ajustar relógio → clicar SALVAR
5. `init.js` detecta `checkAlterarHorario.checked === true`
6. Lê `displayHoras:displayMinutos`, sincroniza `input#horario` e `dados.horario`
7. Chama `salvarApenasHorario(dados)`
8. Linha vazia antiga é deletada, novo doc criado com `originalBase = novoHorario`

### 8.2 A partir de reserva existente (v2.5)

1. Clicar na reserva → `reservaModal.abrirEditar(id)`
2. Resumo exibe 4 botões: EDITAR RESERVA / ALTERAR HORÁRIO / CANCELAR RESERVA / FECHAR
3. Clicar ALTERAR HORÁRIO → `_abrirFormularioCompleto(id)`, depois marca `checkAlterarHorario`, inicializa relógio com horário atual, oculta campos
4. Ajustar relógio → clicar SALVAR
5. `init.js` lê o relógio diretamente (não o `input#horario` — pode estar desatualizado)
6. Chama `salvarApenasHorario(dados)`
7. `service.js` atualiza `horario`, `originalBase` e `posicao` (posição livre no novo bloco)

### 8.3 Lógica de `salvarApenasHorario` (`service.js` v2.5)

```javascript
// Para reservas com dados reais (nomes/bloqueado/somenteHospedes):

const novoOriginalBase = novoHorario; // ← SEMPRE atualiza. Comportamento idêntico a linha vazia.

// Se mudou de bloco → calcula posição livre
if (novoOriginalBase !== originalBaseAnterior) {
    const snapBloco = await firestore.collection('reservas')
        .where('data', '==', data)
        .where('originalBase', '==', novoOriginalBase)
        .get();

    const posicoesOcupadas = [];
    snapBloco.forEach(d => {
        // NÃO excluir o próprio doc (ainda está no bloco antigo neste momento)
        posicoesOcupadas.push(d.data().posicao ?? 0);
    });

    novaPosicao = 0;
    while (posicoesOcupadas.includes(novaPosicao)) novaPosicao++;
}

await firestore.collection('reservas').doc(dados.id).update({
    horario: novoHorario,
    originalBase: novoOriginalBase,
    posicao: novaPosicao
});
```

**Por que não excluir o próprio doc da query:** no momento da query, o doc ainda está no bloco antigo — não apareceria no novo bloco de qualquer forma. Excluir causaria conflito de posição.

### 8.4 Relógio — HTML e Funções

```html
<!-- index.html — containerNovoHorario -->
<div id="containerNovoHorario" class="time-picker-container hidden">
  <div class="time-display-row">
    <div class="time-group">
      <button onclick="ajustarHora(1)">▲</button>
      <div class="time-value" id="displayHoras">20</div>
      <button onclick="ajustarHora(-1)">▼</button>
    </div>
    <div class="time-separator">:</div>
    <div class="time-group">
      <button onclick="ajustarMinuto(15)">▲</button>
      <div class="time-value" id="displayMinutos">00</div>
      <button onclick="ajustarMinuto(-15)">▼</button>
    </div>
  </div>
</div>
```

| Função | Comportamento |
|---|---|
| `ajustarHora(delta)` | ±1 hora. Cicla: `23 → 0` e `0 → 23` |
| `ajustarMinuto(delta)` | ±15 min. Cicla: `45 → 0` e `0 → 45` |

---

## 9. Modal de Reserva — Todos os Fluxos

### 9.1 Clicar em linha disponível → `abrirNova(horario, posicao, hrBase)`

Exibe seletor de ação:
- **NOVA RESERVA** → formulário completo, campos visíveis
- **BLOQUEAR** → formulário com `checkBloquear` pré-marcado
- **ALTERAR HORÁRIO** → relógio, campos ocultos
- **FECHAR**

### 9.2 Clicar em reserva existente → `abrirEditar(id)`

| Condição | Comportamento |
|---|---|
| `bloqueado` ou `somenteHospedes` | Abre formulário diretamente (sem resumo) |
| `fimMesa` | Mostra "✅ MESA FINALIZADA" + botão FECHAR |
| Reserva normal | Exibe resumo com 4 botões |

**Resumo de reserva normal (ordem dos botões):**
1. EDITAR RESERVA (laranja `#f39c12`)
2. ALTERAR HORÁRIO (azul `#3498db`)
3. CANCELAR RESERVA (vermelho `#e74c3c`)
4. FECHAR (transparente)

### 9.3 Comportamento do `btnSalvar` por contexto

| `innerText` | Condição adicional | Ação |
|---|---|---|
| `SALVAR` | `checkAlterarHorario.checked` | `salvarApenasHorario()` |
| `DESBLOQUEAR` | — | `desbloquearReserva()` |
| `SALVAR` | `dados.id` + `dados.bloqueado` ou `somenteHospedes` | `update({ obs, bloqueado, somenteHospedes })` |
| `ADICIONAR OBS` | — | `adicionarObservacao()` — concatena com ` \| ` |
| `SALVAR` | caso padrão | `salvarReserva()` |

### 9.4 Controle de Visibilidade dos Elementos do Modal

| Elemento | Visível quando |
|---|---|
| `#textoHorarioContainer` | Fora do formulário de reserva (oculto no form) |
| `#modal-header-controls` | Formulário de reserva normal (oculto em bloqueios e resumo) |
| `#containerNovoHorario` | `checkAlterarHorario.checked` |
| `#camposReserva` | Tipo de reserva visível e sem alterar horário |
| `#containerApto` | `tipo === "hospede"` ou `tipo === "roomservice"` |
| `#containerExterno` | `tipo === "externo"` |
| `#resumoReserva` | Criado dinamicamente em `abrirEditar()`, removido em `_fecharResumo()` |

### 9.5 Regras dos Checkboxes de Bloqueio

- `checkBloquear` e `checkHospedes` são **mutuamente exclusivos**
- HTML usa `onclick="return toggleBloqueio('bloq')"` (não `onchange`)
- Em bloqueios **existentes**, tentar desmarcar é revertido (proteção `data-era-*`)
- `data-era-bloqueio` e `data-era-hospedes` setados em `_preencherFormulario()`

### 9.6 Estado da Instância ReservaModal

A classe `ReservaModal` mantém estado interno que deve ser corretamente resetado a cada abertura:

| Propriedade | Tipo | Resetado em |
|---|---|---|
| `this.modoEdicao` | `boolean` | `_abrirFormularioNovo()` |
| `this.isBloqueioExistente` | `boolean` | `_abrirFormularioNovo()` e `_abrirFormularioCompleto()` |
| `this.obsOriginalBloqueio` | `string` | `_abrirFormularioCompleto()` quando bloqueio |
| `this.bloqueadoOriginal` | `boolean` | `_abrirFormularioCompleto()` quando bloqueio |
| `this.hospedesOriginal` | `boolean` | `_abrirFormularioCompleto()` quando bloqueio |

⚠️ **Atenção (manutenção #5 pendente):** `_limparFormulario()` ainda não reseta essas propriedades de instância. Elas são resetadas em pontos diferentes do código por acidente de ordem. Após a manutenção #5, tudo deve ser centralizado em `_limparFormulario()`.

---

## 10. Funções Exportadas por Módulo

### `state.js`
```javascript
getDataAtual()           // string "YYYY-MM-DD"
setDataAtual(str)
getTodasReservas()       // array
setTodasReservas(arr)
getHorariosPadrao()      // ["20:00","20:30","21:00","21:30","22:00","22:30"]
getConfig()              // {capacidade, mesas} do localStorage
getLinhasExtras()        // {hr: delta} — pode ter valores negativos
setLinhasExtras(obj)
adicionarLinhaExtra(hr)
removerLinhaExtra(hr)
getFiltroAtivo()
setFiltroAtivo(tipo)
getUnsubscribe()
setUnsubscribe(fn)
```

### `database.js`
```javascript
export const db = DatabaseService.getInstance();
export { DatabaseService };
// Métodos do singleton: aguardarInicializacao, getFirestore,
// getReservasPorData, getReservasPorPeriodo, getReservaPorId,
// criarReserva, atualizarReserva, excluirReserva, escutarReservasPorData
```

### `service.js`
```javascript
salvarReserva(dados)                    // async — cria ou atualiza reserva completa
excluirReserva(id)                      // async — deleta doc
desbloquearReserva(id)                  // async — update({bloqueado:false, somenteHospedes:false})
salvarApenasHorario(dados)              // async — atualiza horario+originalBase+posicao
atribuirMesa(id, mesa)                  // async
iniciarAtendimento(id)                  // async — seta inicioMesa
finalizarAtendimento(id)                // async — seta fimMesa
cancelarMesa(id)                        // async — limpa mesa
adicionarObservacao(id, novaObs)        // async — concatena obs com " | "
buscarReservasPorData(data)             // async — snapshot
buscarReservasPorPeriodo(ini, fim)      // async — snapshot
```

### `listener.js`
```javascript
escutarReservas(data?)    // async — inicia onSnapshot. Para escuta anterior se existir
pararEscuta()             // cancela unsubscribe atual
recarregarReservas(data?) // async — para e reinicia escuta
```

### `modal.js` (ReservaModal)
```javascript
// Classe instanciada uma vez em init.js
reservaModal.abrirNova(horario, posicao, hrBase)   // linha disponível
reservaModal.abrirEditar(id)                        // reserva existente
reservaModal.fechar()
reservaModal.obterDados()                           // retorna objeto com valores atuais do form
reservaModal.validar()                              // retorna { valido, erros[] }
```

### `render.js`
```javascript
renderizarGrid(reservas)       // renderiza tabela inteira em #gridReservas
atualizarMiniCards(reservas)   // atualiza contadores no topo (PAX, tipos, etc.)
```

### `timers.js`
```javascript
atualizarTimers()              // chamado a cada 1s pelo setInterval em init.js
iniciarTimer(idReserva)        // inicia visualmente
pararTimer(idReserva)          // para visualmente
```

### `controls.js` — Funções globais `window.*`
```javascript
window.ajustarHora(delta)          // ±1h no relógio, cicla 0-23
window.ajustarMinuto(delta)        // ±15min, cicla 0/15/30/45
window.alternarTema()              // dark/light, persiste localStorage
window.toggleBloqueio(origem)      // 'bloq' | 'hosp' — mutuamente exclusivos
window.abrirMenuHorario(hr)        // abre #menuHorario para o slot hr
window.fecharMenuHorario()
window.acaoAdicionar()             // adiciona linha visual ao slot
window.acaoExcluir()               // async — remove linha vazia de baixo para cima
window.alternarTelaCheia()         // toggle fullscreen
window.toggleAlterarHorario()      // exibe/oculta #containerNovoHorario
window.salvarConfiguracoes()       // grava capacidade/mesas em localStorage
```

### `controls.js` — Expostos por `init.js`
```javascript
window.abrirModal(hr, pos, base)   // → reservaModal.abrirNova()
window.abrirEditar(id)             // → reservaModal.abrirEditar()
window.atribuirMesa(id)            // → mesaModal.abrir()
window.toggleCampos()              // atualiza visibilidade dos campos do form
window.fecharModalMesa()           // → mesaModal.fechar()
```

### `filters.js`
```javascript
aplicarFiltro(tipo)    // 'hospede'|'externo'|'passante'|'roomservice'|'criancas'|'todos'
```

### `validators.js`
```javascript
validarNaoVazio(valor)
validarTelefone(telefone)         // "(XX) XXXXX-XXXX"
validarApartamento(apto)
validarPax(pax)
validarCriancas(chd)
validarHorario(horario)
validarReserva(dados)             // valida objeto completo de reserva
formatarTelefone(valor)
formatarValorMonetario(valor)
validarCapacidade(adultos, criancas, capacidadeMaxima?)
```

### `log.js`
```javascript
registrarLog(acao, dadosAntes, dadosDepois)   // 'CRIAR'|'EDITAR'|'EXCLUIR'|'DESBLOQUEAR'
carregarLogs()                                 // carrega e renderiza #listaLogs
```

### `dashboard.js` — Expostos via `window.*`
```javascript
window.carregarDadosDashboard()    // busca dados e renderiza gráficos
window.processarDashboard(reservas, diasNoPeriodo)
window.destruirGraficos()
```

### `roomservice.js`
```javascript
carregarRoomServices()    // async — busca e renderiza #listaRoomServices
// Exposto como window.carregarRoomServices()
```

---

## 11. IDs HTML Importantes

### Modal de Reserva (`#modalReserva`)

| ID | Tipo | Descrição |
|---|---|---|
| `reservaId` | `input[hidden]` | ID Firestore da reserva |
| `horario` | `input[hidden]` | Horário atual. **Em ALTERAR HORÁRIO, sincronizado com o relógio antes de salvar** |
| `originalBase` | `input[hidden]` | Slot da grade |
| `posicaoReserva` | `input[hidden]` | Linha no slot (0, 1, 2…) |
| `tipoCliente` | `select` | `"hospede"` \| `"externo"` \| `"passante"` \| `"roomservice"` |
| `nomes` | `input[text]` | Nome em maiúsculas |
| `apto` | `input[number]` | Apartamento |
| `whatsapp` | `input[text]` | Telefone externo |
| `avulsa` | `input[text]` | Taxa avulsa |
| `paxs` | `input[number]` | Adultos (padrão: 2) |
| `chd` | `input[number]` | Crianças (padrão: 0) |
| `obs` | `textarea` | Observações |
| `checkBloquear` | `checkbox` | `onclick="return toggleBloqueio('bloq')"` |
| `checkHospedes` | `checkbox` | `onclick="return toggleBloqueio('hosp')"` |
| `checkAlterarHorario` | `checkbox` | `onchange="toggleAlterarHorario()"` |
| `displayHoras` | `div.time-value` | Horas do relógio (controlado por `ajustarHora`) |
| `displayMinutos` | `div.time-value` | Minutos do relógio (controlado por `ajustarMinuto`) |
| `containerNovoHorario` | `div` | Wrapper relógio — class `hidden` quando inativo |
| `modal-header-controls` | `div` | Barra dos 3 checkboxes. Oculta em bloqueios e resumo |
| `textoHorarioContainer` | `div` | Container do `"--:--"` |
| `camposReserva` | `div` | Wrapper dos campos principais |
| `containerApto` | `div` | Wrapper apto |
| `containerExterno` | `div` | Wrapper whatsapp + avulsa |
| `btnSalvar` | `button` | Texto muda por contexto |
| `btnExcluir` | `button.hidden` | **Sempre oculto.** Exclusão via CANCELAR RESERVA |
| `formReserva` | `form` | `onsubmit="return false"` |

### Modal de Mesa (`#modalMesa`)

| ID | Descrição |
|---|---|
| `mesaReservaId` | ID da reserva sendo atribuída |
| `containerListaMesas` | Grid com botões de mesa 1–N |
| `btnIniciarAtendimento` | Iniciar (oculto inicialmente) |
| `btnTrocarMesa` | Trocar mesa (oculto para ROOM) |
| `btnCancelarMesa` | Cancelar (oculto para ROOM) |
| `btnLiberarMesa` | Finalizar atendimento |

### Telas

| ID | Tela |
|---|---|
| `tela-reservas` | Grade principal (padrão ao carregar) |
| `tela-dashboard` | Analytics |
| `tela-roomservice` | Room service |
| `tela-logs` | Histórico de alterações |
| `tela-configuracoes` | Configurações |

### Outros elementos importantes

| ID | Descrição |
|---|---|
| `dataFiltro` | Seletor de data da grade. `change` → reinicia listener |
| `gridReservas` | `<table>` onde a grade é renderizada |
| `menuHorario` | Modal de + adicionar / - remover linha |
| `tituloMenuHorario` | Título dinâmico do modal de horário |

---

## 12. Classes CSS Importantes

| Classe | Uso |
|---|---|
| `.reserva-clicavel` | Linha de reserva clicável |
| `.reserva-vazia` | Linha disponível (+ DISPONÍVEL) |
| `.reserva-bloqueada` | Linha bloqueada (vermelho) |
| `.reserva-somente-hospedes` | Apenas hóspedes (azul) |
| `.linha-horario` | Célula da hora (coluna HORA) |
| `.timer-verde` | Timer 0–89 min |
| `.timer-amarelo` | Timer 90–114 min |
| `.timer-vermelho` | Timer 115+ min |
| `.timer-piscante` | Room service 45+ min |
| `.timer-finalizado` | Mesa finalizada |
| `.btn-main` | Botão padrão do modal |
| `.save-btn` | Botão salvar (dourado) |
| `.cancel-btn` | Botão cancelar |
| `.delete-btn` | Botão excluir/cancelar reserva (vermelho) |
| `.hidden` | `display: none` |
| `.view` | Container de tela (todas ocultas exceto a ativa) |
| `.modal` | Overlay do modal |
| `.modal-content` | Conteúdo do modal |
| `.modal-compacto` | Modal menor (mesa, horário) |

---

## 13. Timers de Mesa

| Condição | Classe | Visual |
|---|---|---|
| Normal 0–89 min | `.timer-verde` | Verde |
| Normal 90–114 min | `.timer-amarelo` | Amarelo |
| Normal 115+ min | `.timer-vermelho` | Vermelho |
| Room Service 0–44 min | `.timer-verde` | Verde |
| Room Service 45+ min | `.timer-piscante` | Vermelho piscante |
| Finalizado | `.timer-finalizado` | Cinza |

**`data-tipo` é obrigatório no span `.timer-ativo`:**
```html
<span class="timer-mesa timer-ativo"
  data-timer-id="${res.id}"
  data-inicio="${res.inicioMesa}"
  data-tipo="${res.tipo || ''}">
```
Sem `data-tipo`, a regra dos 45min do room service não funciona.

---

## 14. Autenticação

Login real via **Firebase Authentication** (e-mail/senha). `index.html` mantém um mapeamento de nome curto → e-mail fictício, só para tradução de UI — a senha nunca trafega nem é comparada no código:

```javascript
// index.html — tradução de nome curto para e-mail cadastrado no Firebase Auth
const EMAIL_POR_USUARIO = {
    'recepcao': 'recepcao@osteriadilucca.app',
    'osteria':  'osteria@osteriadilucca.app',
    'gerencia': 'gerencia@osteriadilucca.app'
};

await firebase.auth().signInWithEmailAndPassword(email, senha);
```

- Se `localStorage.getItem('usuario_nome')` vazio → exibe `#telaLogin`
- Nome do usuário (curto) gravado em `localStorage['usuario_nome']` após login bem-sucedido no Firebase
- `log.js` lê este nome para registrar quem fez cada alteração
- `trocarUsuario()` chama `firebase.auth().signOut()` além de limpar o `localStorage`
- Regras do Firestore (`firestore.rules`, versionado na raiz do repo) exigem `request.auth != null` para qualquer leitura/escrita — sem sessão válida, o Firestore recusa com `permission-denied`

---

## 15. Regras Absolutas — Nunca Violar

1. **Nunca usar `window.db` ou `firebase.firestore()` diretamente.** Sempre `db` de `database.js`.

2. **Nunca chamar `renderizarGrid()` após operações Firebase** (exceto `acaoExcluir()` e `acaoAdicionar()`). O listener re-renderiza automaticamente.

3. **`linhasExtras` pode ser negativo.** Representa slots com menos de 3 linhas. `Math.max(0, linhasExtras)` **nunca deve ser aplicado**.

4. **Listener só expande `linhasExtras`, nunca reduz.** Condição obrigatória: `minimoNecessario > 0 && minimoNecessario > linhasExtras[hr]`.

5. **`_fecharResumo()` não toca `#modal-header-controls`.** Cada método de abertura controla individualmente.

6. **`checkBloquear`/`checkHospedes` usam `onclick="return toggleBloqueio()"`.** Não `onchange`.

7. **`data-tipo` obrigatório no span `.timer-ativo`.** Regra dos 45min do room service depende disso.

8. **`originalBase` sempre atualiza junto com `horario` em ALTERAR HORÁRIO.** Para qualquer horário — padrão ou fora do padrão.

9. **Botão `btnExcluir` sempre `hidden`.** Exclusão feita via "CANCELAR RESERVA" no resumo.

10. **`data-era-bloqueio` e `data-era-hospedes` setados em `_preencherFormulario()`.** Sem eles a proteção de desmarcação de bloqueios existentes falha.

11. **`desbloquearReserva()` usa `update()`, não `delete()`.** Documento permanece com `bloqueado: false`.

12. **`salvarApenasHorario()` não exclui o próprio doc da query de posições.** No momento da query, o doc ainda está no bloco antigo.

13. **Mínimo de 1 linha por slot.** `acaoExcluir()` bloqueia quando `totalLinhasReal <= 1`.

14. **`rowspan` inclui linhas migradas + fora do padrão.** `totalLinhas = linhasOrdenadas.length + linhasMigradas.length + linhasForaPadrao.length`.

15. **Blocos editados detectados por `originalBase`, não por `horario`.** Reservas com nome também geram bloco próprio se `originalBase` for fora do padrão.

16. **`init.js` lê o relógio diretamente** antes de `salvarApenasHorario()`. O `input#horario` pode conter o horário original quando o fluxo vem do resumo de reserva existente.

17. **Room Service sem TROCAR e sem CANCELAR mesa.** `mesa === "ROOM"` oculta esses botões no `#modalMesa`.

18. **Botões do `#resumoReserva` usam `{ once: true }` nos `addEventListener`.** Sem isso, listeners se acumulam a cada abertura do modal e causam duplo disparo. *(Regra adicionada após manutenção #1.)*

19. **`rowspan` no modo de filtro ativo usa total real do slot, não total filtrado.** Usar só as reservas filtradas quebra a estrutura visual da tabela. *(Regra adicionada após manutenção #2.)*

20. **`linhasExtras` persiste na coleção `config_dia` do Firestore, não em `sessionStorage`.** `controls.js` (`acaoAdicionar`/`acaoExcluir`) chama `db.salvarConfigDia(data, linhasExtras)` após cada mudança; `listener.js` escuta `config_dia/{data}` em tempo real e aplica via `setLinhasExtras()`. Sobrevive a reload e sincroniza entre todos os tablets conectados. *(Regra corrigida em 2026-07-02 — descrição anterior mencionava `sessionStorage`, que não corresponde à implementação real.)*

---

## 16. Grafo de Importações

```
firebase-config.js     (sem imports locais — usa firebase.* global)
    ↓
database.js            (sem imports locais)
    ↓
state.js               (sem imports locais)
    ↓
log.js                 ← database.js
service.js             ← state.js, log.js, database.js
listener.js            ← state.js, render.js, database.js
modal.js (reservas)    ← state.js, service.js
modal.js (mesas)       ← state.js, database.js
    ↓
render.js              ← state.js
timers.js              ← state.js
filters.js             ← state.js, render.js
controls.js            ← state.js, render.js, database.js
    ↓
init.js                ← state.js, listener.js, modal.js×2,
                          service.js, timers.js, database.js
    ↓
navigation.js          (autônomo — só DOM)
dashboard.js           ← database.js
roomservice.js         ← state.js, database.js
```

---

## 17. Histórico de Bugs Corrigidos

| # | Bug | Arquivo | Correção |
|---|---|---|---|
| 1 | Duplo disparo em `checkBloquear`/`checkHospedes` | `index.html` | Removidos `onchange` inline — usa `onclick="return toggleBloqueio()"` |
| 2 | `mesas/modal.js` usava `window.db` diretamente | `mesas/modal.js` | Migrado para DatabaseService |
| 3 | `data-tipo` ausente no span timer ativo | `render.js` | Adicionado `data-tipo="${res.tipo}"` |
| 4 | Race condition em `aguardarFirebase()` | `init.js` | Substituído por `db.aguardarInicializacao()` |
| 5 | Listener sobrescrevia `linhasExtras` manuais com zero | `listener.js` | Só inicializa ou expande, nunca reduz |
| 6 | `toggleAlterarHorario()` não existia | `controls.js` | Função criada e exposta via `window.*` |
| 7 | Campos do form apareciam junto com o relógio | `modal.js` | Ocultar campos no handler `btnAcaoHorario` |
| 8 | Relógio aparecia sem ter selecionado ALTERAR HORÁRIO | `modal.js` | `_limparFormulario()` desmarca e oculta |
| 9 | Checkbox ALTERAR HORA sumia ao clicar EDITAR RESERVA | `modal.js` | `_fecharResumo()` não toca `#modal-header-controls` |
| 10 | `data-era-*` nunca inicializados | `modal.js` | `_preencherFormulario()` seta atributos obrigatoriamente |
| 11 | `desbloquearReserva()` excluía o documento | `service.js` | Substituído `delete()` por `update({ bloqueado: false })` |
| 12 | `salvarConfiguracoes()` não existia | `controls.js` | Implementada com `localStorage` |
| 13 | Linhas com horário editado acumulavam fantasmas | `service.js` | `salvarApenasHorario()` busca doc existente antes de criar |
| 14 | `acaoExcluir()` não encontrava linha vazia correta | `controls.js` | Limpa duplicatas por posição, varre de baixo para cima |
| 15 | `acaoExcluir()` usava `window.todasReservas` desatualizado | `controls.js` | Busca direta no Firebase a cada execução |
| 16 | `linhasExtras` negativos resetados pelo listener | `listener.js` | Condição `minimoNecessario > 0 &&` adicionada |
| 17 | `Math.max(0, linhasExtras)` impedia negativos intencionais | `controls.js` | Removido |
| 18 | Loop de busca usava `maiorPosicao` em vez de `totalLinhasReal` | `controls.js` | Loop vai de `totalLinhasReal - 1` até 0 |
| 19 | `import()` dinâmico de `render.js` falhava silenciosamente | `controls.js` | Substituído por `window.renderizarGrid()` |
| 20 | `removerLinhaExtra` chamado mesmo sem remoção real | `controls.js` | Chamado apenas após remoção confirmada |
| 21 | Células HORA ausentes quando linhas com horário editado | `render.js` | `rowspan` inclui `linhasMigradas` e `linhasForaPadrao` |
| 22 | Botão ALTERAR HORÁRIO ausente no resumo de reserva existente | `modal.js` | Adicionado `btnResumoHorario` com handler completo |
| 23 | ALTERAR HORÁRIO de reserva existente não salvava o novo horário | `init.js` | `init.js` lê `displayHoras:displayMinutos` e sobrescreve `dados.horario` |
| 24 | Reserva com horário alterado sumia — bloco determinado por `horario` errado | `render.js` | `filtradasBase` usa `originalBase` como determinante do bloco |
| 25 | Reserva some ao mover para slot padrão — `originalBase` não atualizava | `service.js` | `salvarApenasHorario` sempre atualiza `originalBase = novoHorario` |
| 26 | Duas reservas na `posicao:0` após mudar de bloco | `service.js` | Calcula primeira posição livre no novo bloco antes de salvar |
| 27 | Query de posição livre excluía o próprio doc causando conflito | `service.js` | Removido filtro `d.id !== dados.id` — doc ainda está no bloco antigo |
| 28 | Reserva com nome e `originalBase` fora do padrão não gerava bloco próprio | `render.js` | Detecção de blocos editados usa `originalBase` de qualquer reserva |
| 29 | Impossível alterar horas no relógio — só minutos funcionavam | `index.html` + `controls.js` | Adicionadas setas ▲▼ para horas; `ajustarHora()` criada |
| 30 | Login validado só no cliente, senhas hardcoded expostas no fonte | `index.html` | Migrado para Firebase Authentication — servidor valida a senha, código não guarda mais senha nenhuma |
| 31 | Firestore com regras públicas (`allow read, write: if true`) — qualquer um na internet podia ler/apagar reservas sem login | Console Firebase | Regras alteradas para `if request.auth != null`; documentado em `firestore.rules` |
| 32 | XSS armazenado — `nomes`/`obs`/`avulsa` inseridos sem escapar em `innerHTML` (render.js, home.js, roomservice.js, modal.js) | `render.js`, `home.js`, `roomservice.js`, `modal.js` | `escapeHtml()` criada em `validators.js` e aplicada em todos os pontos que inserem texto livre do usuário em HTML |
| 33 | Chart.js carregado via CDN sem versão fixa (`.../npm/chart.js`) e nenhum script CDN tinha Subresource Integrity (SRI) — CDN comprometido poderia injetar código malicioso | `index.html` | Chart.js fixado em v4.5.1 (versão que já estava rodando); `integrity` (SHA-384) + `crossorigin="anonymous"` adicionados nos 4 scripts CDN (Chart.js + 3 do Firebase) |
| 34 | 18 arquivos com `console.log` de banner ("✅ xyz.js vX.X carregado") sem nenhuma utilidade em produção — poluíam o console | 18 arquivos em `js/` | Removidos os banners; mantidos todos os `console.log`/`warn`/`error` de fluxo e diagnóstico (única forma de observabilidade do sistema hoje) |
| 35 | `horariosPadrao` hardcoded em 4 lugares fora de `state.js` (`dashboard.js`, `home.js` ×2, `listener.js`) — divergência descrita na doc como "dois lugares", mas era pior na prática | `dashboard.js`, `home.js`, `listener.js` | Todos passam a usar `getHorariosPadrao()` de `state.js` como fonte única |
| 36 | Em redes com proxy/inspeção de conteúdo (ex: rede do hotel), o `integrity` (SRI) adicionado no bug #34 aos 3 scripts do Firebase (CDN) fazia o navegador bloquear o script silenciosamente quando o proxy alterava minimamente o arquivo baixado (recompressão, cache transparente etc.) — sem erro visível na tela. Sintoma: `firebase.auth is not a function`, e todos os listeners do Firestore falhando com `Missing or insufficient permissions` (o SDK de Auth nunca carregava para completar o login; `firebase.app`/`firestore()` continuavam funcionando normalmente pois seus scripts não eram bloqueados) | `index.html` | `integrity` removido dos 3 scripts do Firebase CDN (mantido em Chart.js, que não expôs o problema); mantido `crossorigin="anonymous"`; adicionado `onerror` em cada script para logar no console se o CDN for bloqueado pela rede, em vez de falhar silenciosamente |
| 37 | Corrigido o bug #36 (SRI), o `Missing or insufficient permissions` persistiu em teste na rede do hotel. Causa: a tela de login era decidida só pelo flag `localStorage.usuario_nome` — não pelo estado real do Firebase Auth (guardado no IndexedDB). Se o IndexedDB do site for limpo/bloqueado (tablet/rede do hotel) mas o `localStorage` sobreviver, a UI achava o usuário logado e escondia a tela, enquanto o Firestore corretamente negava tudo porque `request.auth` era `null` no servidor. Agravante: `init.js` chama `escutarReservas()` no boot **antes** de qualquer autenticação resolver; se essa 1ª tentativa leva um `permission-denied`, o Firestore SDK v8 encerra aquele `onSnapshot` para sempre — um login bem-sucedido *depois* não o reativa sozinho | `index.html` | Login gate reescrito para usar `firebase.auth().onAuthStateChanged()` como fonte única da verdade: sem usuário real → limpa o flag obsoleto e mostra a tela de login; com usuário real → esconde a tela e chama `recarregarReservas()` (listener.js) para garantir um listener nascido sob autenticação confirmada, eliminando a corrida de boot. Mesma classe de bug corrigida depois em `iniciarEscutaNotificacoes()` (sino) — ver bug #40 |
| 38 | Após validar o bug #37, o logoff (`trocarUsuario()` → `signOut()` → reload) mostrava a tela de login corretamente, mas o console poluía com `Uncaught FirebaseError: Missing or insufficient permissions` — as duas versões de listener de reservas (`escutarReservasPorData`, `escutarReservasPorDataComMudancas`) relançavam (`throw error`) dentro do próprio callback de erro do `onSnapshot`, virando exceção não tratada dentro do SDK, sem nenhum listener escutando esse throw. Além disso, o listener da tela Home (`carregarHome()`, via `escutarReservasPorData`) sofre do mesmo problema de corrida do bug #37 — morre com o `permission-denied` do boot e só se recupera se o usuário sair e voltar manualmente para a aba Home | `database.js`, `index.html` | Removido o `throw error` dos dois callbacks de erro em `database.js` (mantém só o `console.error`, igual ao padrão já usado em `escutarConfigDia`); `carregarHome()` importado em `index.html` e chamado junto com `recarregarReservas()` no `onAuthStateChanged`, garantindo que a tela Home também reconecta sob autenticação confirmada |
| 39 | O `firebase.json`/`.firebaserc` (adicionados em 2026-07-03) apontavam o deploy de Hosting pro projeto `osteria-di-lucca-links` — que não é o projeto do restaurante, e sim um produto totalmente diferente do mesmo dono (um encurtador de links, com coleções `links`/`clicks` no Firestore). O site publicado funcionava (porque `database.js` sempre apontou corretamente pro Firestore de `osteriadilucca-afea6`, independente de onde os arquivos estáticos estivessem hospedados), mas misturava dois produtos não relacionados no mesmo projeto Firebase | `firebase.json`, `.firebaserc` | Criado um novo site de Hosting (`osteriadilucca`) dentro do projeto correto (`osteriadilucca-afea6`); `firebase.json`/`.firebaserc` atualizados para apontar pra ele. Novo endereço oficial: **https://osteriadilucca.web.app** |
| 40 | Dívida técnica #2 — `iniciarEscutaNotificacoes()` (sino) sofria da mesma corrida de boot do bug #37: chamada uma única vez em `init.js`, antes de qualquer autenticação resolver. Se a 1ª tentativa caísse em `permission-denied`, o guard `if (_unsubscribeNotificacoes) return` impedia qualquer nova tentativa — sino ficava mudo pelo resto da sessão, mesmo com login bem-sucedido depois, mesmo com a grade e a Home já reconectando normalmente | `listener.js`, `index.html` | Criadas `pararEscutaNotificacoes()` e `recarregarNotificacoes()` (mesmo padrão de `recarregarReservas()`); `index.html` chama `recarregarNotificacoes()` dentro de `onAuthStateChanged`, junto com `recarregarReservas()` e `carregarHome()`. Testado: logs confirmam parar+reiniciar limpo a cada mudança de estado de autenticação |
| 41 | Persistência offline do Firestore (presente na versão de produção antiga, ausente deste repositório) | `database.js` | `_ativarPersistenciaOffline()` chama `enablePersistence()` uma única vez (guard `_persistenciaSolicitada`), com tratamento de `failed-precondition` (múltiplas abas) e `unimplemented` (navegador sem suporte). Testado: log "✅ Persistência offline do Firestore ativada" confirmado em boot real |
| 42 | `manifest.json`/ícones PWA ausentes — app não instalável como aplicativo no celular/tablet | `manifest.json`, `icons/icon-192.png`, `icons/icon-512.png`, `index.html` | Ícones gerados a partir do logo já existente (`images.jpg`, 225×225, redimensionado via Pillow); `manifest.json` criado e linkado (`<link rel="manifest">`) |
| 43 | Service Worker ausente — sem cache de arquivos estáticos, app não funciona offline | `sw.js`, `index.html` | Criado `sw.js` com estratégia network-first (tenta rede, cai pro cache só se offline); nunca intercepta requisições de outra origem (Firebase/Firestore/CDNs) — só arquivos estáticos do próprio site. Registrado via `navigator.serviceWorker.register()`. Testado: SW ativo, controlando a página, cacheando dinamicamente (25 arquivos após 2º reload) |
| 44 | `sw.js` v1.0: o `fetch()` da estratégia network-first (e o pré-cache do `install`) não usavam `{ cache: 'no-store' }` — o SW podia reforçar pra sempre uma resposta já desatualizada vinda do cache HTTP do próprio navegador, mesmo depois de um novo deploy. Descoberto ao testar uma mudança em `dashboard.js` que não aparecia mesmo após editar o arquivo | `sw.js` | Adicionado `{ cache: 'no-store' }` em todos os `fetch()` do Service Worker; `CACHE_NAME` incrementado pra `v2` (força limpeza do cache antigo em `activate`) |
| 45 | Curva de horário do Dashboard mostrava só o total de PAX por horário, sem distinguir tipo de cliente | `dashboard.js` | `ocupacaoHorario` passa a ser `{ horario: { hospede, externo, passante } }`; gráfico `chartHorario` virou barra empilhada com 3 séries (Room Service fica fora dessa quebra específica, por decisão do dono do projeto). Testado com dados reais: totais batem com a versão anterior |
| 46 | Mesma limitação do bug #45, no gráfico "PAX por Horário" da tela Início | `home.js` | Mesma quebra por tipo aplicada em `home-chart-barras`, reaproveitando a paleta de cores por tipo já existente (`PALETA.hospede`/`externo`/`passante`) — mantém consistência visual dentro da própria tela. Testado com dados reais |
| 47 | Solicitação: gráfico "Composição" (adultos×crianças) tinha baixo valor analítico — dono do projeto queria ver movimento por dia da semana, por tipo de cliente | `dashboard.js`, `index.html` | Gráfico substituído por "Movimento por Dia da Semana" — barra empilhada (hóspede/externo/passante) agrupando `reservas` pelo dia da semana de `data` (`new Date(data + 'T12:00:00').getDay()`, mesmo padrão de `home.js`). Canvas renomeado de `chartComposicao` para `chartDiaSemana`. Testado com dados reais e sintéticos (domingo/segunda/sexta caem nas colunas corretas) |
| 48 | Solicitação: eventos fechados na osteria (ex: aniversário particular) distorciam as análises do Dashboard, que só permitia um intervalo De/Até contínuo, sem forma de isolar ou excluir dias | `dashboard.js`, `index.html` | Novo seletor "Modo" (`#dashModo`): **Período contínuo** (comportamento anterior + campo "Excluir data", remove dias específicos do intervalo antes de calcular KPIs/gráficos, com a taxa de ocupação recalculada sobre os dias realmente considerados) ou **Datas específicas** (busca só as datas avulsas escolhidas, via `buscarReservasPorData()` em paralelo — sem limite de 10 itens que uma query `where(...,'in',...)` do Firestore teria). Datas adicionadas viram "chips" removíveis (`_renderizarChipsDatas()`). Testado: exclusão reduz o total corretamente (27→15 pax excluindo hoje), remoção da exclusão restaura o total (15→27), modo "datas específicas" isola corretamente (12 pax só de hoje), validação de lista vazia |
| 49 | Nos 3 gráficos de barra empilhada (bugs #45/#46/#47), `borderRadius` aplicado em cada série individualmente arredondava os cantos de cada segmento — criava um "degrau" visual onde hóspede/externo/passante deveriam se encaixar sem emenda | `home.js`, `dashboard.js` | Removido `borderRadius`/`borderSkipped` das séries empilhadas em `home-chart-barras`, `chartHorario` e `chartDiaSemana` — barras agora ficam sólidas e contínuas |
| 50 | Descoberto durante a migração de dados (Fase 4 do Supabase): `dashboard.js` tem o total de mesas fixo em `18` no gráfico "Uso de Mesas" (`for (let i = 1; i <= 18; i++)`, linhas 45 e 163), mas o total é configurável pelo usuário (tela de Configurações). Existem reservas reais em mesas 19 e 20 — o Dashboard já vem sub-relatando o uso dessas mesas | `js/features/dashboard.js` | **Ainda não corrigido** — registrado como tarefa separada (fora do escopo da migração). Correção sugerida: usar `getConfig().mesas`, mesmo padrão já usado em `mesas/modal.js:58` |

---

## 18. Dívidas Técnicas — Pendentes

| # | Descrição | Risco |
|---|---|---|
| 1 | Firebase SDK v8 "compat" desatualizado — Google não lança novidades, só correções de segurança. Upgrade para v9+ (modular) exige reescrever a sintaxe de todas as chamadas ao Firestore em `database.js`, `service.js`, `listener.js` e módulos que os usam. Adiado por ser um projeto grande e arriscado sem suíte de testes automatizados, com o sistema em uso real no restaurante. | Baixo (v8 continua recebendo patches de segurança; sem prazo de descontinuação anunciado) |

---

## 19. Manutenções Necessárias — Lista Priorizada

Separadas em **obrigatórias** (fazer antes de qualquer feature nova) e **recomendadas** (melhoram estabilidade mas não bloqueiam).

### Ordem de execução obrigatória

```
1 → 2 → 5 → 4 → 3 → 7 → 6 → 8
```

1 e 2 primeiro porque afetam operação real. 5 antes do 4 porque o fix do 4 depende de `_limparFormulario` limpo. 3 pode ser feito independente. 6, 7 e 8 são rápidos e podem ir juntos no final.

---

### 🔴 Obrigatórias

#### Manutenção #1 — Listeners acumulando no modal (duplo disparo)
**Arquivo:** `js/features/reservas/modal.js`  
**Versão atual:** v2.5 → **v2.6**

`abrirNova()` e `abrirEditar()` criam um `div#resumoReserva` com `createElement` e adicionam `addEventListener` a cada chamada. `_fecharResumo()` remove o elemento via `remove()`, mas se o usuário fechar clicando no overlay (sem clicar num botão), o elemento é removido mas os handlers foram registrados. Na próxima abertura, um novo set de handlers é adicionado. Após 50–100 aberturas, o botão CANCELAR RESERVA dispara o `confirm` duas vezes.

**Correção:** adicionar `{ once: true }` em **todos** os `addEventListener` dos botões gerados dinamicamente dentro do `#resumoReserva`:

```javascript
// Em abrirNova():
document.getElementById("btnAcaoNova")?.addEventListener("click", () => { ... }, { once: true });
document.getElementById("btnAcaoBloquear")?.addEventListener("click", () => { ... }, { once: true });
document.getElementById("btnAcaoHorario")?.addEventListener("click", () => { ... }, { once: true });
document.getElementById("btnAcaoFechar")?.addEventListener("click", () => { ... }, { once: true });

// Em abrirEditar():
document.getElementById("btnResumoEditar")?.addEventListener("click", () => { ... }, { once: true });
document.getElementById("btnResumoHorario")?.addEventListener("click", () => { ... }, { once: true });
document.getElementById("btnResumoCancelar")?.addEventListener("click", async () => { ... }, { once: true });
document.getElementById("btnResumoFechar")?.addEventListener("click", () => { ... }, { once: true });
// Também o botão FECHAR da tela "MESA FINALIZADA":
document.getElementById("btnResumoFechar")?.addEventListener("click", () => this.fechar(), { once: true });
```

**Impacto:** sem `{ once: true }`, cada listener dispara uma vez e se auto-remove. Não há mudança de comportamento do ponto de vista do usuário — apenas garante que o handler não acumula entre sessões de abertura.

---

#### Manutenção #2 — `rowspan` incorreto com filtro ativo
**Arquivo:** `js/ui/render.js`  
**Versão atual:** v5.3 → **v5.4**

Quando um filtro está ativo (ex: só hóspedes), o branch das linhas 120–138 de `render.js` calcula o `rowspan` usando `reservasPorHorario[hrBase].length` — que é o número de reservas **filtradas**, não o total de linhas do slot. Se um slot tem 3 reservas e o filtro retorna 2, o `rowspan=2` "engolirá" uma linha de outro slot visualmente, quebrando a tabela.

**Correção:** no modo filtrado, o `rowspan` da célula `tdHora` deve ser calculado com o total de reservas filtradas daquele slot (que é o que vai ser renderizado). O problema real é que o `tdHora` usa `res.horario` como texto em vez de `hrBase`, e não há separador entre slots. Reescrever o branch de filtro ativo para espelhar a lógica do branch sem filtro, usando `hrBase` como âncora e `rowspan` = quantidade filtrada daquele `hrBase`.

```javascript
// Substituir o branch de filtro ativo por lógica consistente:
horariosPadrao.forEach(hrBase => {
    const reservasDoSlot = reservasFiltradas.filter(r =>
        (r.originalBase || r.horario) === hrBase
    );
    if (reservasDoSlot.length === 0) return;

    reservasDoSlot.forEach((res, idx) => {
        const tdHora = idx === 0
            ? `<td class="linha-horario" rowspan="${reservasDoSlot.length}">${hrBase}</td>`
            : '';
        html += renderizarLinha(res, res.horario, res.posicao, tdHora, hrBase);
    });
    html += `<tr class="separador-horario"><td colspan="6"></td></tr>`;
});
```

---

#### Manutenção #3 — `linhasExtras` não persiste entre recarregamentos
**Arquivo:** `js/core/state.js`  
**Versão atual:** v4.22 → **v4.23**

Se o tablet recarregar durante o serviço (acidente, atualização, queda de rede), todas as linhas adicionadas/removidas manualmente somem. A grade fica diferente do estado real do Firebase. Num serviço com 6 slots customizados, isso é disruptivo.

**Correção:** persistir `linhasExtras` em `sessionStorage` com chave por data. `sessionStorage` persiste enquanto a aba está aberta — sobrevive a recarregamentos, mas limpa ao fechar o browser (comportamento correto: a cada novo dia a grade começa zerada).

```javascript
// Em getLinhasExtras() — ao ler, inicializa do sessionStorage se ainda não carregado:
export function getLinhasExtras() {
    if (window.linhasExtras && typeof window.linhasExtras === 'object') {
        linhasExtras = window.linhasExtras;
        return linhasExtras;
    }
    // Tenta recuperar do sessionStorage para a data atual
    const data = getDataAtual();
    const chave = `linhasExtras_${data}`;
    const salvo = sessionStorage.getItem(chave);
    if (salvo) {
        try {
            linhasExtras = JSON.parse(salvo);
            window.linhasExtras = linhasExtras;
        } catch(e) { linhasExtras = {}; }
    }
    return linhasExtras;
}

// Em setLinhasExtras(), adicionarLinhaExtra() e removerLinhaExtra() — persistir após cada mudança:
function _persistirLinhasExtras() {
    const data = getDataAtual();
    sessionStorage.setItem(`linhasExtras_${data}`, JSON.stringify(window.linhasExtras));
}
```

---

### 🟡 Recomendadas

#### Manutenção #4 — Race condition em ALTERAR HORÁRIO (reserva existente)
**Arquivo:** `js/features/reservas/modal.js`  
**Versão atual:** após #1 → **v2.7**

No handler de `btnResumoHorario` (reserva existente), a sequência é:
1. `_abrirFormularioCompleto(id)` — que internamente chama `_toggleCampos()`, que pode reexibir `camposReserva`
2. Logo depois, o código oculta `camposReserva` manualmente

Se `_toggleCampos()` rodar depois que os campos foram ocultados (por qualquer evento assíncrono ou reordenação futura), os campos reaparecem. É frágil e já causou o bug #7.

**Correção:** adicionar flag `this.modoSomenteHorario` que `_toggleCampos()` respeita:

```javascript
// Em _toggleCampos():
_toggleCampos() {
    if (this.modoSomenteHorario) return; // ← respeita o modo relógio
    // ... resto da lógica atual
}

// No handler btnResumoHorario — setar o flag ANTES de chamar _abrirFormularioCompleto:
document.getElementById("btnResumoHorario")?.addEventListener("click", () => {
    this.modoSomenteHorario = true; // ← flag ANTES
    this._fecharResumo();
    this._abrirFormularioCompleto(id);
    // ... inicializa relógio, oculta campos
}, { once: true });

// Em _limparFormulario() — resetar o flag:
_limparFormulario() {
    this.modoSomenteHorario = false;
    // ... resto do clear
}
```

---

#### Manutenção #5 — `_limparFormulario` não reseta estado da instância
**Arquivo:** `js/features/reservas/modal.js`  
**Versão atual:** após #4 → **v2.8** (ou junto com #4 na mesma versão)

As propriedades de instância `this.isBloqueioExistente`, `this.obsOriginalBloqueio`, `this.bloqueadoOriginal` e `this.hospedesOriginal` não são resetadas em `_limparFormulario()`. Elas são resetadas em pontos diferentes do código por acidente de ordem de execução. Isso torna o comportamento dependente da sequência de chamadas — qualquer refatoração pode quebrar o estado.

**Correção:** centralizar todos os resets em `_limparFormulario()`:

```javascript
_limparFormulario() {
    // Reset do estado da instância — centralizado aqui
    this.modoEdicao = false;
    this.modoSomenteHorario = false;
    this.isBloqueioExistente = false;
    this.obsOriginalBloqueio = '';
    this.bloqueadoOriginal = false;
    this.hospedesOriginal = false;

    // Reset dos campos do DOM — igual ao atual
    if (this.elementos.reservaId) this.elementos.reservaId.value = "";
    // ... resto igual
}
```

---

#### Manutenção #6 — `horariosPadrao` hardcoded em dois lugares
**Arquivo:** `js/ui/render.js`  
**Versão atual:** após ajustes → bump de patch

`state.js` define `["20:00","20:30","21:00","21:30","22:00","22:30"]` e `render.js` importa `getHorariosPadrao()` de `state.js` — mas se houver algum uso local do array hardcoded dentro de `render.js`, deve ser removido. Fonte única: `getHorariosPadrao()` de `state.js`.

**Correção:** verificar se `render.js` tem algum array literal de horários inline (além do import) e substituir pela chamada a `getHorariosPadrao()`. Confirmar que `listener.js` também usa `getHorariosPadrao()` e não um array local.

---

#### Manutenção #7 — Sanitização de HTML nos campos livres
**Arquivo:** `js/ui/render.js`  
**Versão atual:** após #6 → bump de patch

`res.nomes` e `res.obs` são inseridos diretamente em template strings de HTML. Um nome com `'` pode quebrar o atributo `onclick="abrirEditar('${res.id}')"` se o ID do Firestore contiver caracteres especiais (improvável mas possível). Mais relevante: `res.obs` pode ter sido digitado com caracteres como `<`, `>` ou `"` que quebram o HTML renderizado.

**Correção:** criar função `esc()` mínima e aplicar nos campos de entrada livre:

```javascript
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Aplicar em renderizarLinha():
// ${label} — ${esc(res.nomes)} ${res.obs ? `<span class="obs-exibicao">${esc(res.obs)}</span>` : ""}
```

---

#### Manutenção #8 — Branch morto em `renderizarLinha`
**Arquivo:** `js/ui/render.js`  
**Versão atual:** após #7 → bump de patch

No bloco `else` de `renderizarLinha` (linha ~335), a primeira condição do ternário:
```javascript
const acaoClique = (res && (res.nomes || res.bloqueado || res.somenteHospedes))
    ? `abrirEditar('${res.id}')`
    : ...
```
nunca é verdadeira porque a função só chega no `else` quando `res` não tem nome/bloqueio. A condição verifica exatamente o que o `if` pai já descartou. Pode ser removida sem efeito colateral.

**Correção:**
```javascript
// Substituir por:
const acaoClique = res
    ? `abrirModal('${res.horario}', ${res.posicao}, '${hrBase}')`
    : `abrirModal('${horarioVisual}', ${posicao}, '${hrBase}')`;
```

---

### Status das manutenções

| # | Descrição | Prioridade | Status |
|---|---|---|---|
| 1 | Listeners acumulando — duplo disparo | 🔴 Obrigatória | ✅ Concluída (verificado em 2026-07-02: `{ once: true }` já aplicado em `modal.js`, e `_fecharResumo()` remove o nó do DOM — não há acúmulo. Testado com 10 ciclos abrir/fechar via JS, sem duplicação. Status estava desatualizado.) |
| 2 | `rowspan` incorreto com filtro ativo | 🔴 Obrigatória | ✅ Concluída (verificado em 2026-07-02: branch de filtro em `render.js` v5.4 já calcula `rowspan` = quantidade de reservas filtradas por slot, que é exatamente o nº de linhas renderizadas. Testado com dataset sintético — slot com 3 reservas reais e filtro retornando 2 gerou `rowspan=2`, sem quebra. Status estava desatualizado.) |
| 3 | `linhasExtras` não persiste entre recarregamentos | 🔴 Obrigatória | ✅ Concluída (verificado em 2026-07-02: implementado de forma diferente da descrita — `controls.js` v8.4 persiste `linhasExtras` na coleção `config_dia` do Firestore, não em `sessionStorage`. Mais robusto: sobrevive a reload E sincroniza entre todos os tablets, não só a mesma aba. Testado: adicionar linha, reload completo, valor restaurado corretamente. Status estava desatualizado.) |
| 4 | Race condition em ALTERAR HORÁRIO | 🟡 Recomendada | ✅ Concluída (verificado em 2026-07-02: `toggleAlterarHorario()` só mexe em `#containerNovoHorario`, nunca em `camposReserva`/`containerApto`/`obs`; e todo o fluxo do handler `btnResumoHorario` roda de forma síncrona, sem `await`/`setTimeout` entre `_abrirFormularioCompleto()` e os ocultamentos manuais — não existe brecha de tempo para a condição de corrida. Testado com reserva real: `camposReserva` fica oculto corretamente, sem reaparecer. Status estava desatualizado.) |
| 5 | `_limparFormulario` não reseta estado da instância | 🟡 Recomendada | ✅ Concluída (2026-07-02: `_limparFormulario()` agora zera `isBloqueioExistente`, `obsOriginalBloqueio`, `bloqueadoOriginal` e `hospedesOriginal` no início. Não havia bug ativo hoje — `_abrirFormularioCompleto()` já sobrescrevia esses valores logo em seguida em todo fluxo existente — mas a correção remove a fragilidade para fluxos futuros que possam chamar `_limparFormulario()` sem o override explícito.) |
| 6 | `horariosPadrao` hardcoded em dois lugares | 🟡 Recomendada | ✅ Concluída (2026-07-02: era pior que "dois lugares" — encontrados 4 arrays hardcoded em `dashboard.js`, `home.js` ×2 e `listener.js`. Todos substituídos por `getHorariosPadrao()`. Testado: dashboard carrega sem erro, grade renderiza normalmente após reload.) |
| 7 | Sanitização de HTML nos campos livres | 🟡 Recomendada | ✅ Concluída |
| 8 | Branch morto em `renderizarLinha` | 🟡 Recomendada | ✅ Concluída (verificado em 2026-07-02: o ternário morto descrito não existe mais — removido junto com a refatoração v5.5–v5.7 que eliminou todos os `onclick` inline em favor de `data-*` + event delegation. Status estava desatualizado.) |

**Ao concluir cada manutenção:** atualizar a coluna Status para ✅ Concluída, incrementar a versão do arquivo afetado na tabela da §4, e adicionar entrada no histórico de bugs (§17) se aplicável.

---

## 20. Instrução para IA — Início de Sessão

Ao receber este README no início de um chat, a IA deve:

1. **Confirmar leitura** das seções §15 (Regras Absolutas) e §19 (Manutenções) antes de qualquer intervenção no código.

2. **Verificar** qual manutenção está sendo executada e seguir a ordem `1 → 2 → 5 → 4 → 3 → 7 → 6 → 8` salvo instrução explícita em contrário.

3. **Ao entregar um arquivo modificado:**
   - Incrementar versão no cabeçalho do arquivo (`// v2.5 → v2.6`)
   - Adicionar linha no histórico de bugs (§17) se o fix resolver um bug
   - Atualizar a tabela de versões (§4)
   - Atualizar status da manutenção na tabela de §19

4. **Nunca** aplicar `Math.max(0, linhasExtras)` — valores negativos são intencionais.

5. **Nunca** chamar `renderizarGrid()` após operações Firebase (exceto `acaoExcluir` e `acaoAdicionar`).

6. **Sempre** usar `{ once: true }` nos `addEventListener` de botões criados dinamicamente no `#resumoReserva`.

7. **Ao criar novos listeners** em `abrirNova()` ou `abrirEditar()`, garantir que usam `{ once: true }`.

8. **Ao modificar `_limparFormulario()`**, garantir que reseta todos os campos de instância listados em §9.6.

9. **Prioridade máxima:** se o usuário pedir uma feature nova antes de concluir as manutenções obrigatórias (#1, #2, #3), alertar e sugerir concluir as manutenções primeiro.

10. **A manutenção atual em andamento é a #1.** Ao iniciar, entregar apenas `modal.js` com as alterações de `{ once: true }`, sem modificar outros arquivos.
