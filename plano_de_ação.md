# Plano de Ação — Migração Osteria di Lucca: Firestore → Supabase (PostgreSQL)

## Contexto e Objetivo

O projeto **Osteria di Lucca** (repo `luisdienstmanntd/Gerenciador-de-Reservas`) atualmente usa **Firebase Firestore (NoSQL)**. O objetivo é migrar a camada de dados para **Supabase (PostgreSQL)**, mantendo o sistema em produção, para permitir:

1. Aprendizado prático de **SQL** (projeto de faculdade — Análise de Dados)
2. Estruturação de dados para futura **análise de dados** (agregações, séries temporais, ocupação)
3. Conexão nativa futura com **Power BI**
4. Hospedagem **100% gratuita**, sem pausar por inatividade (heartbeat via GitHub Actions)

Este documento deve ser usado como prompt/roteiro para o Claude Code executar as mudanças de forma incremental, com testes a cada etapa.

---

## Restrições Importantes

- **Não quebrar o sistema em produção** durante a migração (hotel usa o sistema diariamente)
- Manter Firebase Auth OU migrar para Supabase Auth (avaliar na Fase 2 — decisão a ser tomada com o usuário antes de implementar)
- Hospedagem deve continuar gratuita
- Cada fase deve ser um commit separado, testável isoladamente
- Rodar os 81 testes Vitest existentes após cada fase e não deixar quebrar

---

## Fase 1 — Setup do Supabase ✅ Concluída (2026-07-09)

- [x] Criar projeto novo no Supabase (free tier) — projeto `Luisdienstmanntd`, região us-west-2 (Oregon; São Paulo não disponível no free tier), RLS automático ativado, API pública não exposta automaticamente
- [x] ~~Guardar `SUPABASE_URL` e `SUPABASE_ANON_KEY` em variáveis de ambiente~~ — **decisão revista**: o projeto não tem bundler/servidor Node, então `.env` não é lido pelo navegador. `SUPABASE_URL` e a `publishable key` (novo nome do Supabase pra "anon key") são hardcoded em `supabaseClient.js`, mesma lógica seguida com a `apiKey` do Firebase — não são segredos, a proteção real é RLS (Fase 3). `.env` só fará sentido nas Fases 4/6 (scripts Node/CI)
- [x] Instalar `@supabase/supabase-js` no projeto (`^2.110.2`, via npm — usado pelos testes/scripts Node; no navegador é importado via CDN ESM na mesma versão, já que não há bundler)
- [x] Criar arquivo `js/core/supabaseClient.js` centralizando a conexão (equivalente ao `database.js` do Firebase). Testado: consulta real contra o projeto retornou erro esperado de "tabela não existe" (PGRST205), confirmando URL/chave corretas

---

## Fase 2 — Modelagem do Banco (Schema SQL) ✅ Concluída (2026-07-09)

**O schema abaixo (sugestão inicial) era especulativo — não batia com os campos reais.** Corrigido: schema real extraído de `service.js`/`database.js`, aplicado como migration em `supabase/migrations/20260709133321_initial_schema.sql` (versionado, não só criado direto no SQL Editor).

Mudanças em relação à sugestão original:
- **Não existiam** coleções `hospedes` nem `mesas` no Firestore — hoje tudo é achatado num único documento de `reservas`. Criamos as duas tabelas mesmo assim (decisão de normalizar agora, ver abaixo), mas com dados reais, não inventados.
- **Regra de deduplicação de hóspede** (não existe ID de pessoa no sistema atual, precisou ser definida): hóspede/roomservice → `apto`+`nome`, ou `codigo_reserva`+`nome` (pré-checkin), ou `telefone`+`nome`; externo/passante → `telefone`+`nome`. Essa busca em cascata fica na aplicação (Fase 5), não é uma constraint do banco.
- **Campo novo: `codigo_reserva`.** Descoberta importante: hoje, quando um hóspede reserva por telefone/WhatsApp antes de saber o apto, a recepção guarda o número da reserva **no próprio campo `apto`** (sobrecarga de campo). O schema novo separa isso em duas colunas. A limpeza dos dados históricos (separar o que é código vs. apto de verdade nas reservas antigas) fica pendente pra Fase 4.
- `status` (confirmada/cancelada/concluida/no_show) não existe no modelo atual — os campos reais são `bloqueado`, `somenteHospedes`, `inicioMesa`/`fimMesa`. Mantido assim por enquanto (mais fiel à realidade); pode virar um `status` computado depois, se fizer sentido.
- Adicionadas as tabelas `config_dia` e `notificacoes` (coleções reais do Firestore que a sugestão original não previa).

Schema completo: ver `supabase/migrations/20260709133321_initial_schema.sql`.

**Ponto crítico de design (mantido do plano original):** nunca fazer `DELETE` de reservas — no momento estamos mantendo `bloqueado`/exclusão como no Firestore, mas vale reavaliar na Fase 5 se deve virar soft-delete com log, preservando histórico para análise de ocupação/cancelamentos.

- [x] Validar esse schema contra os campos reais do Firestore atual — feito, ver mudanças acima
- [x] Criar as tabelas no Supabase via migration versionada — aplicada com sucesso, testada via `supabase-js` (erro `permission denied` esperado, confirma que RLS automático está bloqueando acesso até a Fase 3 criar as políticas)
- [x] Criar índices em `reservas(data)`, `reservas(hospede_id)`, `reservas(mesa_identificador)` e `reservas_log(reserva_id)` para performance de queries analíticas

---

## Fase 3 — Row Level Security (RLS) ✅ Concluída (2026-07-09)

Substituídas as regras do Firestore por políticas RLS do Postgres.

**Decisão de autenticação (confirmada com o dono do projeto):** migrar pro **Supabase Auth** em vez de manter Firebase Auth com ponte (Third-Party Auth). RLS fica no padrão oficial (`auth.uid()`), mais simples de manter. **Importante:** o login de produção (`index.html`) continua no Firebase Auth por enquanto — a troca de verdade só acontece na Fase 5, junto com a migração do restante do código, pra evitar um estado intermediário quebrado (login validando o backend errado).

- [x] 3 usuários criados no Supabase Auth (mesmos e-mails do Firebase: recepcao/osteria/gerencia@osteriadilucca.app)
- [x] Habilitado RLS em todas as tabelas (`supabase/migrations/20260709135200_rls_policies.sql`)
- [x] Políticas equivalentes ao Firestore — qualquer usuário autenticado pode tudo (`auth.uid() is not null`), sem diferenciação de papel, igual ao `firestore.rules` atual
- [x] **Descoberta importante:** RLS sozinho não bastou. Como o projeto foi criado com "Expor automaticamente novas tabelas" desmarcado (decisão da Fase 1), nenhum papel tinha privilégio de base nas tabelas — Postgres bloqueava antes mesmo de avaliar as políticas RLS. Precisou de uma migration extra de `GRANT` (`20260709140241_grants_authenticated.sql`) concedendo `select/insert/update/delete` ao papel `authenticated` (nada concedido a `anon`)
- [x] Testado: login autenticado → consulta funciona (19 linhas em `mesas`); sem login → `permission denied` (RLS + falta de GRANT pro `anon`, nunca liberado)
- [ ] Revisar se algum endpoint precisa de acesso público — não identificado nenhum caso até agora (app é só de uso interno da equipe)

---

## Fase 4 — Migração de Dados Existentes ✅ Concluída (2026-07-09)

- [x] Escrito `scripts/migrar-dados.mjs` — login como usuário real dos dois lados (Firebase Auth + Supabase Auth), sem usar `service_role` key. Lê `reservas`/`logs`/`config_dia`/`notificacoes` do Firestore, resolve/cria `hospedes` com dedup, insere no Supabase na ordem certa de dependências
- [x] **Decisão:** rodar direto no projeto atual em vez de criar um projeto de teste separado — script só lê do Firestore (nunca escreve/apaga lá) e o Supabase ainda não tinha dado real (só as mesas fixas). Risco baixo, evitou gastar um segundo projeto gratuito
- [x] Validar contagem — **bateu 100%** em `reservas` (477/477), `logs` (225/225), `config_dia` (12/12), `notificacoes` (250/250); 464 `hospedes` criados via dedup
- [x] **Bug real encontrado durante a migração:** 7 reservas falharam por causa de mesas 19 e 20 (o restaurante pode reconfigurar o salão com mais mesas que o padrão 18 — dado real, não erro de digitação). Corrigido: `mesas` deixou de ser uma lista fixa — o script agora cria a mesa sob demanda (`garantirMesaExiste()`) na primeira vez que aparece um número novo. Reprocessadas as 7 com `--retry-ids=...` sem duplicar as 470 que já tinham migrado
- [x] **Achado colateral (fora do escopo desta migração, registrado como tarefa separada):** o `dashboard.js` do app atual (Firebase) tem o total de mesas fixo em `18` no gráfico "Uso de Mesas", em vez de ler a configuração — o Dashboard já vem sub-relatando as mesas 19/20 há um tempo

---

## Fase 5 — Refatoração do Código da Aplicação ✅ Concluída (2026-07-10)

- [x] Substituídas todas as chamadas `collection()/doc()/getDocs()` do Firestore por queries do Supabase client (`.from('reservas').select()`, `.insert()`, `.update()`) em `database.js`, `service.js` e `log.js`
- [x] Mantida a mesma interface/funções públicas do módulo de dados — `listener.js`, `home.js`, `dashboard.js`, `render.js` e `controls.js` não precisaram mudar uma linha. A tradução entre o formato normalizado do Postgres (`reservas` + `hospedes`) e o formato achatado que a UI sempre conheceu (camelCase, um objeto por reserva) vive em `database.js` (`_paraReservaApp`/`_paraColunasReserva`)
- [x] Login trocado de Firebase Auth para Supabase Auth em `index.html` (`onAuthStateChange`, `signInWithPassword`, `signOut`) — SDK clássico do Firebase removido do HTML
- [x] Tempo real: `onSnapshot` do Firestore substituído por `supabase.channel(...).on('postgres_changes', ...)`. Precisou de uma migration extra habilitando Realtime nas tabelas `reservas`, `config_dia`, `notificacoes` (`20260709160000_habilitar_realtime.sql`) — sem isso os eventos nunca disparam
- [x] **Bug de schema encontrado durante a portagem:** `reservas_log.reserva_id` e `notificacoes.reserva_id` tinham FK para `reservas(id)`. O fluxo de `excluirReserva()` sempre foi "lê a reserva → apaga → registra o log apontando pra ela" — com a FK original isso quebraria a exclusão (violação de chave estrangeira, já que a reserva referenciada não existe mais no momento do log). Corrigido removendo as duas FKs (`20260709161500_remover_fk_logs_notificacoes.sql`) — um log de auditoria precisa sobreviver à exclusão que documenta
- [x] **Tradeoff aceito, documentado:** `firestore.batch()` (atômico) não tem equivalente client-side no Supabase — pares insert+delete/update (em `salvarReserva`, `salvarApenasHorario`, `removerLinhaDoBloco`, `limparFantasmasDoDia`) viram chamadas sequenciais. Risco: falha no meio pode deixar um doc "fantasma" temporário, mas `limparFantasmasDoDia()` (já existe, roda no boot) varre e limpa isso sozinho
- [x] **Tradeoff aceito, documentado:** persistência offline (cache do Firestore, recriada como dívida técnica #2 nesta mesma sessão) **não foi recriada** — o Supabase não tem equivalente pronto; ver dívida técnica nova no prompt.md
- [x] Testes ajustados: `_calcularPosicaoLivre()` mudou de assinatura (recebe array simples em vez de `QuerySnapshot` do Firestore) — `service.test.js` simplificado. Suíte completa passando (162 testes)
- [x] QA manual completo na branch `fase5-supabase`: login, criar/editar/excluir reserva, tela de LOG, Dashboard — tudo validado antes do merge

---

## Fase 6 — Heartbeat via GitHub Actions (evitar pausa por inatividade) ✅ Concluída (2026-07-10)

Supabase free tier pausa projetos após 7 dias sem atividade de banco de dados. Solução: workflow agendado que faz uma query simples periodicamente.

- [x] Tabela `heartbeat` criada (`supabase/migrations/20260710120000_heartbeat.sql`) — RLS habilitado, mas liberada pro papel `anon` (diferente de todas as outras tabelas): sem dado sensível, e o workflow roda fora de qualquer sessão de usuário logado, não faz sentido exigir login só pra isso
- [x] `.github/workflows/supabase-heartbeat.yml` criado — ping (`POST /heartbeat`) toda segunda e quinta às 12h UTC, mais `workflow_dispatch` pra rodar manualmente
- [x] **Decisão que diverge do plano original:** `SUPABASE_URL` e a publishable key ficam direto no workflow (`env:`), não como GitHub Secrets. Mesma lógica já validada na Fase 1 — essa chave não é segredo (a proteção é RLS), então guardá-la como Secret só adicionaria um passo manual sem ganho real de segurança
- [x] Rotina de limpeza incluída (não opcional) — segundo step do workflow apaga heartbeats com mais de 30 dias, evita acumular lixo na tabela
- [x] Workflow rodado manualmente (`workflow_dispatch`) e validado com sucesso antes de confiar no cron

---

## Fase 7 — Preparação para Power BI

- [ ] Criar **views SQL** que já agregam métricas úteis, para facilitar a conexão direta do Power BI sem lógica extra:
```sql
create view vw_reservas_por_dia as
select data_reserva, count(*) as total_reservas,
       sum(case when status = 'cancelada' then 1 else 0 end) as canceladas,
       sum(case when status = 'no_show' then 1 else 0 end) as no_shows
from reservas
group by data_reserva;
```
- [ ] Documentar a connection string do Postgres (Supabase → Settings → Database) para uso no conector nativo do Power BI
- [ ] Validar que RLS não bloqueia a conexão do Power BI (avaliar uso de uma role/service key específica só para leitura analítica)

---

## Fase 8 — Validação Final

- [ ] Sistema funcionando 100% em produção usando Supabase
- [ ] Firestore mantido como backup por um período de segurança (não deletar imediatamente)
- [ ] Heartbeat confirmado funcionando por pelo menos 2 ciclos (2+ semanas)
- [ ] Testes Vitest 100% passando
- [ ] README atualizado refletindo a nova stack (Postgres/Supabase em vez de Firestore)

---

## Ordem de Execução Recomendada

1. Fase 1 → 2 → 3 (setup + schema + segurança) — sem afetar produção ainda
2. Fase 4 (migração de dados) em ambiente de teste
3. Fase 5 (refatoração do código) em branch separada
4. Fase 6 (heartbeat) pode ser feito em paralelo, a qualquer momento
5. Deploy em produção só depois de Fases 1-5 validadas
6. Fase 7 (Power BI) depois que a produção estiver estável no Supabase