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
3. Aplicar a migration antes do frontend. Ela cria RPCs, triggers e índices de que o código novo depende. Seu preflight interrompe a transação se encontrar posições ou notificações duplicadas; não apaga nem escolhe registros para resolver conflitos. Esses conflitos exigem revisão dos dados antes de repetir a aplicação.
4. Publicar o frontend e atualizar os tablets. Durante a transição, clientes antigos ainda podem tentar gerar notificações redundantes; o índice evita a duplicação, mas esses clientes podem registrar erro até serem atualizados.
5. Conferir login, criação/edição/cancelamento/restauração e dois tablets simultâneos em homologação antes da liberação operacional.

Nenhum banco remoto, dado de hóspede ou deploy foi alterado na implementação. Testes locais não substituem a validação autenticada do ambiente publicado. Operações que envolvem várias escritas ainda podem ter sucesso parcial; o código sinaliza falhas, e a reconciliação de bloqueios deve ser conferida caso apareça um aviso de gravação parcial.
