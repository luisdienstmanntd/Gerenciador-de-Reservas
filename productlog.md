# Product Log — Osteria Di Lucca

## Objetivo

Este arquivo é a fonte histórica central das decisões, solicitações, mudanças, erros e aprendizados do produto.

Ele existe para que qualquer pessoa ou IA que trabalhe no projeto consiga entender:

- o que foi pedido;
- por que foi pedido;
- qual problema originou a solicitação;
- o que foi decidido e implementado;
- quais erros aconteceram durante o trabalho;
- como a solução foi validada;
- quais riscos, limitações e pendências permanecem;
- quais decisões anteriores não devem ser desfeitas acidentalmente.

O objetivo principal é evitar regressões, repetição de erros e mudanças que contrariem decisões já tomadas sem que o conflito seja percebido.

---

## Regra de leitura obrigatória

Antes de analisar, planejar ou implementar qualquer alteração no projeto, o responsável deve:

1. Ler este arquivo por completo.
2. Procurar decisões e ocorrências relacionadas aos arquivos, funcionalidades e regras que serão alterados.
3. Conferir também `prompt.md`, migrations e testes quando forem citados por uma entrada.
4. Identificar possíveis conflitos entre o novo pedido e decisões anteriores.
5. Informar o conflito antes de substituir uma decisão vigente.

Uma solicitação nova pode substituir uma decisão antiga, mas isso deve ser explícito e registrado. Nunca se deve presumir que a decisão anterior deixou de valer.

---

## Regra de atualização obrigatória

Toda intervenção material no projeto deve adicionar uma entrada neste arquivo, incluindo:

- implementação de funcionalidade;
- correção de bug;
- mudança visual ou comportamental;
- alteração de banco, migration, RLS ou integração;
- refatoração relevante;
- criação ou alteração de testes;
- mudança de configuração ou deploy;
- investigação que descubra uma causa importante, mesmo sem correção;
- tentativa que falhou e trouxe aprendizado relevante;
- decisão de produto, inclusive quando a decisão for não fazer uma mudança;
- reversão de uma implementação anterior.

Não é necessário registrar simples leituras, comandos exploratórios sem descoberta relevante ou formatação sem impacto funcional.

O registro deve ser feito na mesma alteração que modifica o produto. Não deixar para uma solicitação futura.

---

## Como tratar conflitos

Se um pedido novo conflitar com este histórico:

1. Não implementar silenciosamente.
2. Apontar a decisão anterior, sua motivação e as consequências da substituição.
3. Confirmar se a intenção é realmente substituir a decisão vigente quando a mudança tiver impacto relevante.
4. Se confirmada, criar uma nova entrada com `Substitui` apontando para a entrada anterior.
5. Manter a entrada antiga no histórico. Nunca apagar ou reescrever o passado para parecer que o conflito não existiu.

Em caso de divergência entre documentação e código, registrar o que foi verificado no código e atualizar a documentação apropriada. Este arquivo não substitui testes, migrations, comentários técnicos ou documentação detalhada; ele conecta essas fontes e explica o contexto das decisões.

---

## Estados das decisões

- **Vigente:** deve continuar sendo respeitada.
- **Substituída:** uma decisão posterior tomou seu lugar.
- **Revertida:** a implementação foi desfeita.
- **Parcial:** apenas parte da decisão foi implementada.
- **Pendente:** aceita ou solicitada, mas ainda não implementada.
- **Investigação:** descoberta registrada, ainda sem decisão definitiva.

---

## Modelo obrigatório de entrada

Copie este bloco para cada novo registro:

```markdown
## PL-AAAA-MM-DD-NNN — Título curto

- **Data:** AAAA-MM-DD
- **Status:** Vigente | Substituída | Revertida | Parcial | Pendente | Investigação
- **Tipo:** Pedido | Decisão | Funcionalidade | Correção | Refatoração | Banco de dados | Segurança | Teste | Documentação | Erro | Reversão
- **Solicitado por:** pessoa, equipe ou contexto
- **Responsável:** pessoa, IA ou ferramenta que executou
- **Arquivos afetados:** caminhos dos arquivos, ou `nenhum`
- **Relacionados:** IDs de outras entradas, issues, commits ou documentos
- **Substitui:** ID anterior ou `não se aplica`

### Pedido

O que foi solicitado, em linguagem objetiva.

### Por que foi pedido

Motivação de produto, operação ou manutenção.

### Problema observado

Sintoma, risco ou limitação que originou o trabalho. Informar como reproduzir quando aplicável.

### Causa

Causa técnica ou de produto confirmada. Se não estiver confirmada, escrever `não confirmada` e separar fatos de hipóteses.

### Decisão

Comportamento esperado e regras que devem permanecer válidas no futuro.

### O que foi feito

Resumo concreto da implementação ou investigação.

### Erros e tentativas que não funcionaram

Registrar falhas relevantes e por que não devem ser repetidas. Usar `nenhum` quando não houver.

### Validação

Testes automatizados, verificações manuais, consultas ou evidências utilizadas. Não afirmar que algo foi validado sem registrar como.

### Resultado

O que o trabalho resolveu ou alterou para o usuário e para o sistema.

### Riscos, limitações e pendências

O que ainda pode dar errado, ficou fora do escopo ou precisa de acompanhamento.
```

---

## Índice de decisões vigentes

Esta seção deve permanecer curta. Adicione apenas decisões com grande chance de afetar trabalhos futuros.

| Tema | Decisão vigente | Entrada |
|---|---|---|
| Histórico do produto | Toda mudança material deve ser registrada neste arquivo e conflitos devem ser explicitados antes de substituir decisões anteriores. | PL-2026-08-06-001 |
| Log de auditoria | `reservas_log` é imutável para o app (só SELECT/INSERT), retenção mínima de 24 meses, todo texto exibido é escapado e a aba usa só tokens da paleta. | PL-2026-11-03-001 |

---

## Histórico

## PL-2026-08-06-001 — Criação do Product Log central

- **Data:** 2026-08-06
- **Status:** Vigente
- **Tipo:** Pedido, Decisão, Documentação
- **Solicitado por:** proprietário/desenvolvedor do projeto
- **Responsável:** Codex
- **Arquivos afetados:** `productlog.md`
- **Relacionados:** `prompt.md`, `README.md`, `REVISAO_TECNICA.md`, `TESTES.md`, `plano_de_ação.md`
- **Substitui:** não se aplica

### Pedido

Criar um arquivo chamado Product Log no qual seja registrado tudo que for feito no projeto: pedidos, motivos, problemas causados ou resolvidos, erros e implementação realizada.

### Por que foi pedido

O projeto possui regras de negócio complexas e um histórico distribuído entre código, testes, migrations e vários documentos. Sem uma fonte cronológica central, uma IA ou pessoa pode repetir um erro, desfazer uma correção ou atender a um pedido novo que contradiz uma decisão anterior sem perceber o conflito.

### Problema observado

O conhecimento histórico estava fragmentado. `prompt.md` concentra arquitetura e histórico técnico, enquanto outros documentos registram migração, testes, LGPD e revisão técnica. Não existia um protocolo único exigindo que futuras mudanças registrassem pedido, motivação, causa, solução e validação.

### Causa

O projeto evoluiu incrementalmente e cada tipo de informação foi documentado no arquivo mais próximo do trabalho realizado. Isso preservou bastante contexto, mas não criou uma trilha cronológica única de decisões do produto.

### Decisão

`productlog.md` passa a ser a fonte histórica central e deve ser lido antes de qualquer alteração. Toda intervenção material deve acrescentar uma entrada no mesmo trabalho. Uma decisão anterior só pode ser substituída de forma explícita, mantendo o registro antigo e criando uma nova entrada que indique o conflito e a substituição.

### O que foi feito

Foi criado este arquivo com:

- objetivo e escopo;
- protocolo de leitura e atualização;
- procedimento para conflitos;
- estados possíveis das decisões;
- modelo obrigatório de entrada;
- índice resumido de decisões vigentes;
- histórico cronológico identificado por IDs estáveis.

### Erros e tentativas que não funcionaram

Nenhum.

### Validação

Foi verificado que o arquivo contém todas as categorias solicitadas: pedido, motivação, problema, causa, decisão, trabalho realizado, erros, validação, resultado e pendências.

### Resultado

Futuras pessoas e IAs passam a ter um local único para consultar o motivo das decisões e registrar novas mudanças, reduzindo o risco de regressões e repetição de erros conhecidos.

### Riscos, limitações e pendências

- O processo depende de cada responsável ler e atualizar o arquivo.
- O histórico técnico anterior continua distribuído nos documentos existentes; ele não foi duplicado integralmente aqui para evitar inconsistências.
- Decisões históricas relevantes devem ser incorporadas ao índice ou registradas retroativamente quando forem encontradas durante trabalhos futuros.

## PL-2026-11-03-001 — Aba Log completa (auditoria, busca, histórico e recriação)

- **Data:** 2026-11-03
- **Status:** Parcial (código e migration prontos; migration ainda não aplicada no Supabase remoto)
- **Tipo:** Pedido, Funcionalidade, Segurança, Banco de dados
- **Solicitado por:** proprietário/desenvolvedor do projeto
- **Responsável:** Claude (agente principal) + dois subagentes (banco; registro de eventos/recriação)
- **Arquivos afetados:** `js/features/reservas/log.js`, `js/features/reservas/log.test.js`, `css/log.css`, `index.html`, `supabase/migrations/20261103120000_log_auditoria.sql`, `scripts/test-integridade-sql.mjs`, `js/features/reservas/service.js`, `js/core/database.js`, `js/core/init.js`, `js/ui/controls.js`, `js/features/reservas/no-show.js` (ver relatórios dos subagentes na seção "O que foi feito")
- **Relacionados:** `REVISAO_TECNICA.md` (A2, A3, B4, B6, escalabilidade), `prompt.md` #57 e #73, `LGPD.md`
- **Substitui:** parcialmente `prompt.md` #73 (ver Decisão)

### Pedido

Tornar a aba Log mais completa: verificar edições e exclusões, ver o histórico, ver o que foi alterado, procurar reservas, saber quem alterou e recriar reservas excluídas. Visual profissional, pouco colorido, respeitando a paleta. Respostas do proprietário: acesso para todos os usuários; registrar todos os eventos (inclui observação, no-show, configurações, login/logout); recriar a partir do log; exportação resolvida pelo Power BI; retenção de 2 anos; alterações de banco autorizadas.

### Por que foi pedido

O log era a única fonte histórica após EXCLUIR, mas só permitia filtrar um dia ou buscar por nome, não mostrava a noite da reserva e não permitia recuperar nada.

### Problema observado

- `nome`, `obs` e `usuario` eram interpolados sem escape no `innerHTML` (XSS armazenado).
- A policy de `reservas_log` era `for all`: qualquer usuário autenticado podia editar ou apagar o histórico.
- Falha ao gravar o log só ia para o `console.error` (REVISAO_TECNICA B6).
- Observação, atualização de bloqueio, no-show automático, configurações e login/logout não eram registrados.
- Sem filtro por período, ação ou usuário; busca só por nome; limite silencioso de 200 resultados; sem índice em `criado_em`.

### Causa

Evolução incremental: o log nasceu como timeline de um dia e a segurança/retenção do banco nunca foi revisada.

### Decisão

- `reservas_log` é imutável para o app (SELECT e INSERT apenas). A única remoção é `limpar_logs_antigos`, com piso de 24 meses imposto no banco.
- O autor confiável é `usuario_id` (preenchido pelo banco com `auth.uid()`); o campo texto `usuario` segue só para exibição.
- Decidido NÃO criar trigger de log no banco nesta rodada: o log continua sendo gravado pelo app, para não duplicar registros nem mudar o significado das ações. Fica como evolução possível.
- Todos os usuários veem a aba inteira (sem perfis).
- Exportação própria não será construída: o Power BI usa `vw_log_auditoria`.
- **Conflito com `prompt.md` #73:** lá ficou decidido que só EDITAR expande o cartão. Agora EXCLUIR e CANCELAR também expandem (dados registrados), porque é a base da recuperação. CRIAR, DESBLOQUEAR e RESTAURAR continuam sem expandir. Esta decisão substitui #73 apenas nesse ponto.
- Visual: cartões neutros; a cor semântica só no ponto do selo e no ícone, via tokens de `base.css`. O CSS saiu do JS para `css/log.css`.
- Recriar reserva mantém o mesmo `id` (cadeia de histórico preservada), recalcula a posição livre e NÃO restaura a mesa.

### O que foi feito

Ver relatórios resumidos abaixo e o diff. Front-end do Log: filtros (de/até, dia da alteração × noite da reserva, usuário, chips de ação, busca por nome/apto/código/mesa), resumo, paginação de 100 com contagem real, histórico completo por reserva (também usado pelo sino), botão "Recriar reserva", escape de todo texto, acessibilidade por teclado.

### Erros e tentativas que não funcionaram

- Primeira versão de `log.js` usava `const _svg` antes de definido (TDZ nos ícones criados no carregamento do módulo); trocada por declaração de função.
- `npm install` falhou na máquina de desenvolvimento (erro interno do npm); o teste SQL foi validado com cópia temporária do script apontando para um pglite instalado à parte. `npm run test:sql` precisa ser rodado após um `npm install` saudável.

### Validação

`npx vitest run`: suíte completa verde após as correções da revisão (inclui filtros PostgREST, resumo, escape de XSS, regras dos botões, recriação, OBSERVAR, NOSHOW). Teste SQL (RLS imutável, `usuario_id` não forjável, `criado_em` forçado, ações, retenção com piso de 24 meses, view): passou numa cópia temporária do script com pglite instalado fora do projeto, porque `npm install` falhou na máquina. Verificação visual no navegador e teste contra o Supabase real NÃO foram feitos (a tela exige login).

### Resultado

A aba Log passa a responder "quem mexeu, quando, em qual noite e o que mudou", permite buscar por nome/apto/código/mesa, ver a vida inteira de uma reserva e recriar uma exclusão. O histórico deixa de ser editável pelo app e o autor passa a ser gravado pelo banco.

**Revisão independente (subagente somente leitura) e correções feitas:** botão "Recriar" não some mais após EXCLUIR→RECRIAR→EXCLUIR; reserva cancelada e depois excluída não é recriada como ativa; consultas sobrepostas são descartadas (geração) e a paginação deduplica por id e desempata por `id`; noite + busca viraram um único `.or(and(or(..),or(..)))` (não depende de como o PostgREST combina parâmetros `or` repetidos); `*` e `\` saem do termo de busca; hora e usuário não somem mais no celular; foco volta ao cartão ao fechar o detalhe; `atualizarBloqueio` não falha se a leitura prévia falhar; policy de INSERT exige `usuario_id = auth.uid()` e trigger força `criado_em = now()` para `authenticated`/`anon` (importações com data antiga devem rodar como `postgres`/`service_role`).

### Riscos, limitações e pendências

- Aplicar `20261103120000_log_auditoria.sql` no Supabase antes de publicar o front-end: sem `usuario_id`/novas ações no check, os INSERTs de RECRIAR, OBSERVAR, CONFIG, NOSHOW, LOGIN e LOGOUT falham (o app avisa a recepção, no máximo uma vez por minuto).
- Depois da migration nem a gerência corrige log pelo app.
- Os `.or()` repetidos do PostgREST (noite + busca) devem ser conferidos no banco real.
- Logs antigos não têm `originalBase`/`posicao`/`pagamento`: a recriação usa o horário e a primeira posição livre.
- `usuario_id` é NULL nos logs anteriores à migration. As 3 contas (recepção, osteria, gerência) são compartilhadas: `usuario_id` identifica a conta, não a pessoa.
- Recriar uma reserva grava `criado_em` novo (distorce métricas de antecedência) e pode gerar notificação no sino.
- `LOGIN`/`NOSHOW` usam o `usuario_nome` do `localStorage`, que pode ainda não estar gravado no instante do login.
- `destacarLogPorReservaId` (sino) continua sem chamador no repositório (código morto já existente).
- Em 2026-11-03 o `git status` já mostrava `.gitignore` sem as linhas `.env`, `.env.local`, `node_modules/`, `.firebase/` e `.env.example` com texto solto: alterações do proprietário anteriores a este trabalho, NÃO tocadas aqui. Não commitar sem revisá-las.

