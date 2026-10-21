# Correções da auditoria da Osteria

Base: `42638d06eef9f694df4742aa29ce8c3f71d6a6e8`. Alterações preparadas a partir dos dois relatórios de testes de 20/10/2026.

## Comportamento corrigido

- Escritas negadas ou sem registro afetado deixam de ser tratadas como sucesso.
- Posições ativas do salão têm proteção de exclusividade no banco; Room Service e reservas canceladas ficam fora dessa restrição.
- Trocar nome ou tipo do cliente de uma reserva resolve outro vínculo, preservando as demais reservas. Completar apartamento do mesmo nome/tipo continua atualizando seu cadastro compartilhado.
- Cancelamento, redução de grupos, restauração e conversão de Room Service reconciliam bloqueios e mesa.
- Bloqueios semanais são aplicados por transação no servidor.
- Notificações são criadas no banco uma vez por reserva; leituras usam atualização atômica.
- Autor da auditoria e usuário do sino são consultados após o login.
- Room Service exclui cancelados, usa a data de São Paulo e permite abrir pedidos de outra data sem trocar o cache da grade.
- Respostas antigas não substituem dados da data atual. Edições fora da data da grade usam a configuração do dia do pedido.
- Dashboard respeita a configuração de capacidade e mesas; mesas de reservas canceladas ficam disponíveis.

## Validação local

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:sql
```

Os arquivos `qa-*.test.js` agora verificam comportamentos corrigidos, em vez de afirmar os defeitos dos relatórios originais. O teste SQL usa PostgreSQL embarcado em memória, dados artificiais e as migrations versionadas. Não usa credenciais de produção.

## Ordem de publicação

1. Conferir a versão publicada, pois o login observado no site divergia do `main` auditado. Preservar mudanças que existam somente no deploy.
2. Fazer backup e validar a migration `20261021005822_corrigir_integridade_reservas_notificacoes.sql` em homologação com o schema real e usuários de teste.
3. Aplicar a migration antes do frontend. Ela cria RPCs, triggers e índices de que o código novo depende. Colisões de posição **hoje ou no futuro** interrompem e revertem toda a transação. Excedentes de colisões **estritamente passadas** recebem somente `conflito_posicao_legado=true`: datas, horários, posições, hóspedes, PAX, status de recepção e timestamps históricos permanecem iguais. Esses conflitos continuam históricos; a migration não tenta reconstruir a ordem real do atendimento. Os marcadores não são aceitos em novas gravações, nem acompanham mudanças de data/bloco/posição/vínculo ou cancelamento/restauração. A posição canônica mais antiga permanece protegida pelo índice.
4. Notificações duplicadas históricas e seus arrays `lido_por` são preservados integralmente. A nova chave `evento_reserva_id` é atribuída a uma canônica por reserva e aos novos inserts pelo servidor. O índice impede novos avisos duplicados, sem apagar/mesclar os antigos; as leituras posteriores podem continuar marcando cada aviso legado. Atualizações normais não podem apagar a chave para burlar a restrição.
5. Publicar o frontend e atualizar os tablets. Durante a transição, clientes antigos ainda podem tentar gerar notificações redundantes; o índice evita a duplicação, mas esses clientes podem registrar erro até serem atualizados.
6. Conferir login, criação/edição/cancelamento/restauração e dois tablets simultâneos em homologação antes da liberação operacional. Conferir contagens de reservas/hóspedes/notificações e os grupos históricos antes/depois; a aplicação da migration não deve reduzir nenhuma contagem.

O backfill roda sob lock de escrita das tabelas. O trigger de `atualizado_em` é suspenso somente durante os dois backfills internos da tabela de reservas e reativado antes de terminar; tudo integra a mesma transação, portanto falha também reverte a suspensão. Isso preserva os timestamps históricos. A coluna `status_recepcao`, já existente em produção, não é recriada nem alterada; seus fluxos de chegada/no-show foram preservados no código.

Nenhum banco remoto, dado de hóspede ou deploy foi alterado na implementação. Testes locais não substituem a validação autenticada do ambiente publicado. Operações que envolvem várias escritas ainda podem ter sucesso parcial; o código sinaliza falhas, e a reconciliação de bloqueios deve ser conferida caso apareça um aviso de gravação parcial.
