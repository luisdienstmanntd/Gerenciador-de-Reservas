# Revisão Técnica — Análise de Dados, Power BI e Preparação para Crescimento

> Revisão realizada em 2026-07-12, cobrindo: verificação do README, alinhamento do código
> com o objetivo de análise de dados (Power BI), e busca de bugs latentes que só vão doer
> quando o sistema crescer. Achados ordenados por prioridade dentro de cada seção.
> Referências de código no formato `arquivo:linha` (linhas da data da revisão).

---

## 1. Verificação do README

| Item | Situação |
|---|---|
| Deploy (Firebase Hosting) | ✅ Correto — confirmado com o dono do projeto em 2026-07-12 |
| Site em produção (osteriadilucca.web.app) | ✅ Correto |
| Stack (Supabase/Postgres, Realtime, Auth) | ✅ Correto |
| Contagem de testes | ⚠️ Desatualizado — README diz **162 testes**, a suíte atual tem **172** |
| Funcionalidades | ⚠️ Não menciona cancelamento com histórico (soft-delete), desfazer cancelamento, nem a distinção CANCELAR × EXCLUIR — features novas de julho/2026 |
| Log de auditoria | ⚠️ Diz "criação, edição e exclusão" — hoje também registra DESBLOQUEAR, CANCELAR e RESTAURAR |

**Ação sugerida:** atualização pontual do README (5 minutos), junto com o `prompt.md`.

---

## 2. Achados críticos para Análise de Dados / Power BI

Esta é a seção mais importante da revisão, porque toca diretamente o objetivo declarado
do projeto (análises ricas + conexão nativa com Power BI, ver `plano_de_ação.md` Fase 7).

### A1. 🔴 As views do Power BI não conhecem o cancelamento — números inflados

`supabase/migrations/20260710130000_views_powerbi.sql` foi criada **um dia antes** da
feature de cancelamento (`20260711120000_cancelamento_reserva.sql`). Consequências:

1. **`eh_reserva_real` conta reservas canceladas como reservas de verdade** (linha 53 da
   migration: `h.id is not null and not r.bloqueado and not r.somente_hospedes` — sem
   `and r.cancelado_em is null`). Todos os agregados derivados (`vw_reservas_por_dia`,
   `vw_reservas_por_dia_semana`) **inflam total de reservas e de pax** com reservas que
   não aconteceram.
2. As colunas `cancelado_em` e `deposito_retido` **nem aparecem** em `vw_reservas_detalhado`
   — é impossível analisar taxa de cancelamento, antecedência média do cancelamento ou
   receita de adiantamentos retidos no Power BI, que era justamente o valor de negócio
   do soft-delete.

O Dashboard interno já trata isso corretamente (`js/features/dashboard.js:56`), ou seja,
**Dashboard e Power BI hoje dariam números diferentes para o mesmo período** — o pior tipo
de bug para quem está estudando análise de dados, porque mina a confiança nos relatórios.

**Correção sugerida** (nova migration):

```sql
create or replace view vw_reservas_detalhado as
select
  ..., -- colunas atuais
  r.cancelado_em,
  r.deposito_retido,
  (r.cancelado_em is not null) as eh_cancelada,
  (h.id is not null and not r.bloqueado and not r.somente_hospedes
     and r.cancelado_em is null) as eh_reserva_real,
  ...
```

E, nos agregados, adicionar `count(*) filter (where eh_cancelada) as total_cancelamentos`.

### A2. 🔴 O log de auditoria não guarda a DATA da reserva

`_resumir()` em `js/features/reservas/log.js:64-81` define o snapshot salvo em
`reservas_log.dados_antes/dados_depois`. Ele guarda `horario`, mas **não guarda `data`**
(nem `posicao`, nem `originalBase`).

Por que isso é grave para análise: o log é a **única fonte histórica** nos dois casos em
que a linha da reserva não conta mais a história — EXCLUIR (linha apagada; a FK foi
removida de propósito na migration `20260709161500`) e RESTAURAR (cancelamento apagado da
linha, por decisão de produto). Um log de EXCLUIR ou CANCELAR→RESTAURAR hoje responde
"quem, quando e o quê", mas **não responde "para qual noite era a reserva"** — a pergunta
mais básica de qualquer análise de cancelamentos ("qual dia da semana mais cancela?").

**Correção sugerida:** adicionar `data` (e idealmente `originalBase`/`posicao`) ao
`_resumir()`. Custo: uma linha. Vale fazer o quanto antes, porque log não tem retrofit —
tudo que for registrado até lá fica sem a data para sempre.

### A3. 🟡 EXCLUIR (hard delete) destrói dado analítico — e o botão fica ao lado de CANCELAR

Por design, EXCLUIR é para erro de digitação e CANCELAR é para desistência do cliente.
O risco operacional: os dois botões ficam lado a lado no mesmo modal
(`js/features/reservas/modal.js:344-347`), e cada EXCLUIR usado no lugar errado é uma
reserva que **some das análises silenciosamente** (a linha é apagada; sobra só o log, sem
a data — ver A2). Mitigações possíveis, em ordem de esforço:

1. Treinamento da equipe + o texto de confirmação já explica a diferença (feito).
2. Criar uma view analítica sobre o log (`vw_exclusoes`) para dar visibilidade a exclusões
   — hoje `reservas_log` não tem nenhuma view e o JSONB é hostil ao Power BI.
3. Restringir EXCLUIR a uma janela de tempo (ex: só nos primeiros X minutos após CRIAR)
   ou a um perfil de usuário.

### A4. 🟡 Cancelamentos desfeitos somem das estatísticas de cancelamento

Decisão de produto (2026-07-12): RESTAURAR limpa `cancelado_em` da linha; o histórico fica
só no log. Consequência analítica a ter em mente: o card/KPI "Cancelamentos" e a futura
análise no Power BI medem **cancelamentos vigentes**, não **eventos de cancelamento**.
Se um dia a pergunta for "quantas vezes clientes tentaram cancelar?", a resposta está em
`reservas_log` (`acao = 'CANCELAR'`), e exige a correção A2 para ser agrupável por noite.

### A5. 🟡 Cadastro de hóspede é mutável e deduplica por heurística — histórico pode mudar retroativamente

`_resolverHospedeId()` (`js/core/database.js:134-180`):

- Ao **editar** uma reserva, o cadastro do hóspede vinculado é **sobrescrito** (nome,
  telefone, apto). Se o mesmo `hospede_id` estiver vinculado a reservas antigas (dedup por
  apto+nome), **as reservas históricas passam a exibir os dados novos** — no Power BI,
  uma análise de "clientes recorrentes" ou por DDD (`ddd_telefone` na view) pode mudar de
  resultado retroativamente.
- A dedup por `apto + nome` tem um risco de longo prazo: **apartamentos são reciclados**.
  Daqui a um ano, um hóspede diferente com o mesmo nome no mesmo apto (improvável, mas
  possível com nomes comuns tipo "MARIA") seria fundido no mesmo cadastro.

Para o porte atual está adequado. Quando a análise de recorrência de clientes virar
prioridade, considerar: tornar `hospedes` imutável por reserva (snapshot) ou versionar.

### A6. 🟡 Dashboard (JS) e views (SQL) implementam as mesmas regras duas vezes — e já divergiram

A regra "o que é uma reserva de verdade" existe em pelo menos 3 lugares: `dashboard.js:56-58`,
`home.js`, e `eh_reserva_real` na view SQL. A divergência do A1 (cancelamento) prova que
elas **vão** descolar de novo a cada feature. Direção recomendada quando o Power BI entrar
em uso: a view SQL vira a fonte única da definição, e o Dashboard interno passa a consumir
as views (ou pelo menos ganha um teste que compara os dois resultados).

### A7. 🟡 Constantes desatualizáveis hardcoded no Dashboard

- `CAPACIDADE_NOITE = 30` (`dashboard.js:29`) — a capacidade é configurável na tela de
  Configurações (sincronizada via `config_sistema`), mas o KPI de ocupação usa a constante.
  Se a capacidade real mudar, a taxa de ocupação fica errada sem ninguém perceber.
- `usoMesas` itera mesas `1..18` fixo (`dashboard.js:48` e `171`) — mas o próprio código
  reconhece que o número de mesas é configurável (comentário em `database.js:184-186`:
  "mesas 19/20 não existiam"). **Reservas nas mesas 19+ já são silenciosamente excluídas**
  do gráfico de uso de mesas e do KPI "Mesa Top".

### A8. 🔵 Fuso horário: `cancelado_em` é timestamptz (UTC)

`reservas.data` é `date` (sem fuso — seguro para agrupar). Já `cancelado_em`,
`inicio_mesa`, `fim_mesa`, `criado_em` são `timestamptz` armazenados em UTC. Gramado é
UTC-3: um cancelamento às 22h de sexta é gravado como 01h de **sábado** em UTC. Ao agrupar
por dia no Power BI, converter explicitamente
(`cancelado_em at time zone 'America/Sao_Paulo'`) ou expor a conversão já na view —
senão ~12,5% dos eventos noturnos caem no dia errado.

---

## 3. Bugs prováveis no aplicativo (encontrados por leitura de código)

### B1. 🔴 Editar uma reserva apaga a mesa atribuída (e o pagamento) — confirmar em teste manual

Cadeia do problema:

1. `obterDados()` do modal (`modal.js:751-778`) **não inclui** `mesa` nem `pagamento`.
2. `salvarReserva()` (`service.js:240-258`) monta `reservaData` sem esses campos.
3. `_paraColunasReserva()` (`database.js:206-228`) converte ausência em `null` e o
   `update()` de `atualizarReserva()` **sobrescreve as colunas com null**.

Resultado esperado: **editar qualquer reserva que já tem mesa atribuída desvincula a mesa**
(`mesa_identificador = null`). Pior cenário: reserva **em atendimento** (o modal v3.6
permite EDITAR durante o atendimento) — o timer some da grade (a exibição exige
`res.mesa`), a mesa "libera" indevidamente, e `pagamento` legado (era do Firestore) é
zerado. O mesmo update também zera `bloqueio_origem_id`, quebrando o vínculo de bloqueio
automático se um dia um bloqueio for editado por esse fluxo.

Provavelmente passa despercebido porque edições costumam acontecer antes da atribuição de
mesa. **Correção sugerida:** `_paraColunasReserva` só incluir no objeto de update as
colunas presentes em `dados` (ou `salvarReserva` preservar mesa/pagamento de `dadosAntes`).

### B2. 🟡 Cancelar uma reserva grande NÃO remove os bloqueios automáticos dela

`cancelarReserva()` (`service.js:355-375`) marca `cancelado_em` mas não chama
`_removerBloqueioAutomatico()`. Uma reserva de 6 pessoas que bloqueou 2 linhas extras, ao
ser cancelada, libera a própria linha — mas **as 2 linhas seguem bloqueadas** com
"BLOQUEIO AUTOMÁTICO — RESERVA GRANDE NA LINHA ANTERIOR", apontando para uma reserva que
não existe mais como ativa. A recepção precisa perceber e desbloquear na mão, em plena
operação. (O EXCLUIR não sofre disso: o `ON DELETE CASCADE` limpa os bloqueios vinculados.)

Nota do outro lado da moeda: se a correção for feita, `restaurarReserva()` deve re-criar
os bloqueios (chamar `_reconciliarBloqueioAutomatico`) para manter a simetria.

### B3. ✅ CORRIGIDO NESTA REVISÃO — Desfazer cancelamento sem checar colisão de posição

Enquanto cancelada, a posição da reserva fica livre (`_calcularPosicaoLivre` ignora
canceladas — `service.js:60`) e uma reserva nova pode ocupá-la. `restaurarReserva()`
restaurava na posição original sem verificar, sobrepondo duas reservas ativas na mesma
célula — o inverso exato do bug corrigido no commit `f686423`. Corrigido: agora recalcula
a posição no bloco antes de restaurar, seguindo o padrão de `alterarData()`.

### B4. 🟡 Usuário do log é lido uma única vez no carregamento do módulo

`const USUARIO_ATUAL = localStorage.getItem('usuario_nome') || 'sistema'` é avaliado no
load do módulo (`log.js:19` e `listener.js:31`). Se a troca de usuário no tablet não
recarregar a página por completo, **os logs seguem atribuídos ao usuário anterior** — e
auditoria com autor errado é pior que sem autor. Correção barata: ler o localStorage
dentro de `registrarLog()` a cada chamada.

### B5. 🟡 Concorrência entre tablets pode duplicar posição no mesmo bloco

`_calcularPosicaoLivre` é read-then-write sem transação: dois tablets criando reserva no
mesmo bloco ao mesmo tempo leem o mesmo estado e escolhem a **mesma posição**. Não há
constraint no banco impedindo (`(data, original_base, posicao)` não é único — e não pode
ser único ingenuamente por causa de vazias/canceladas). Com 3 pontos de acesso o risco é
baixo; se crescer o número de operadores, considerar índice único parcial:

```sql
create unique index uq_reserva_ativa_posicao
  on reservas(data, original_base, posicao)
  where cancelado_em is null and (bloqueado or somente_hospedes or hospede_id is not null);
```

(exige tratar o erro de conflito no app com retry de posição).

### B6. 🔵 Falha de log é engolida silenciosamente

`registrarLog()` faz `catch` + `console.error` por design (auditoria não pode travar a
operação — decisão correta). O efeito colateral: se o INSERT falhar sistematicamente
(ex: constraint nova sem migration aplicada, RLS), **o log para de registrar e ninguém
fica sabendo**. Mitigação simples: além do console, disparar `notificarAviso()` — a
recepção vê e reporta.

---

## 4. Escalabilidade — pontos a observar conforme o volume cresce

| Ponto | Situação hoje | Quando vira problema |
|---|---|---|
| **Realtime = refetch total** — cada evento em `reservas` refaz a busca do dia inteiro, em cada tablet (`database.js`, listener) | OK para ~30-60 reservas/dia e 3 tablets | Muitos tablets × noites cheias × eventos frequentes (timers não contam — são locais). Alternativa futura: reconciliar o diff do evento em vez de refazer a busca |
| **Consultas com `select('*, hospedes(*)')`** em tudo | OK | Períodos longos no Dashboard (ex: 1 ano) trarão colunas desnecessárias; especificar colunas reduz payload |
| **`reservas_log` cresce sem política de retenção** e sem índice por `criado_em` | OK | Timeline do Log filtra por dia — quando a tabela tiver dezenas de milhares de linhas, criar `index on reservas_log(criado_em)` e definir retenção (LGPD.md já prevê anonimização) |
| **Sem transações atômicas** (insert+delete sequenciais) | Mitigado por `limparFantasmasDoDia()` no boot | Tradeoff aceito e documentado; se virar dor, mover pares críticos para uma função RPC (Postgres function) que roda em transação |
| **Free tier do Supabase** | Heartbeat via GitHub Actions mantém acordado | Limites de linhas/armazenamento do free tier — monitorar tamanho de `reservas_log` (é a que mais cresce) |
| **Dashboard processa tudo no navegador** | OK | Períodos de 1+ ano em tablet modesto; as views SQL (A6) já são o caminho para empurrar agregação pro banco |

---

## 5. Recomendações priorizadas

**Agora (protege dados que não têm retrofit):**
1. A2 — adicionar `data` ao `_resumir()` do log (1 linha; cada dia sem isso é histórico perdido).
2. A1 — migration corrigindo `eh_reserva_real` + expondo `cancelado_em`/`deposito_retido` nas views.
3. B1 — confirmar e corrigir a perda de mesa/pagamento na edição.

**Curto prazo:**
4. B2 — cancelamento remover bloqueios automáticos (e restaurar re-criá-los).
5. B4 — ler usuário do log a cada chamada.
6. A7 — Dashboard usar capacidade/mesas de `config_sistema` em vez de constantes.
7. README/prompt.md — atualizar contagem de testes e features novas.

**Médio prazo (quando o Power BI entrar em uso de verdade):**
8. A6 — views SQL como fonte única das definições de negócio.
9. A3 — view analítica sobre `reservas_log` (cancelamentos, exclusões, restaurações).
10. A8 — colunas com fuso convertido nas views.
11. B5/B6 — constraint de posição + alerta visível de falha de log.

---

*Documento gerado durante revisão assistida por IA em 2026-07-12. Achados de leitura
estática de código: os marcados como "confirmar" merecem reprodução manual antes da correção.*
