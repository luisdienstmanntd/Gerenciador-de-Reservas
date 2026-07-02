# Osteria Di Lucca — Sistema de Gestão de Reservas

Sistema web de gestão de reservas para o restaurante **Osteria Di Lucca**, dentro de um hotel boutique, em Gramado-RS. Usado em tablets pela recepção, pela osteria (restaurante) e pela gerência durante o serviço do jantar, com atualização em tempo real entre os três pontos de acesso.

## O problema que motivou o projeto

Trabalho num hotel boutique onde o restaurante Osteria Di Lucca fica dentro do próprio hotel. A recepção é responsável por registrar as reservas dos hóspedes, e essas reservas precisam ser vistas e organizadas também pela osteria (para preparar a cozinha e as mesas) e pela gerência (para acompanhar a operação).

Antes deste sistema, isso era feito numa planilha do Google Sheets compartilhada entre os três setores. Na prática, isso gerava alguns problemas recorrentes:

- **A planilha era confusa demais para uso em tablet pequeno.** Ela reunia pagamentos, valores, telefones e observações na mesma visão — muita informação para uma tela pequena, no meio do serviço do jantar.
- **Não havia controle de overbooking.** A recepção adicionava reservas na planilha sem necessariamente consultar a osteria antes, e a cozinha é pequena — passar da capacidade real vira problema na hora do serviço.
- **Não havia rastreabilidade.** Não dava para saber com facilidade quem tinha criado ou alterado uma reserva.
- **Não havia controle de tempo de mesa** nem visão consolidada de quanto tempo cada mesa estava ocupada.

Este sistema nasceu para resolver esses pontos: uma grade de reservas em tempo real, pensada para tablet, com bloqueio de horários, atribuição e cronômetro de mesas, log de quem alterou o quê, e um dashboard com estatísticas do movimento — tudo sincronizado instantaneamente entre recepção, osteria e gerência.

## Funcionalidades principais

- **Grade de reservas em tempo real**, organizada por horário e mesa, sincronizada via Firebase Firestore entre todos os dispositivos conectados.
- **Bloqueio de horários** (ex: mesa reservada só para hóspedes, ou bloqueada para manutenção).
- **Atribuição e cronômetro de mesas**, com aviso visual de tempo de ocupação.
- **Log de auditoria** — cada criação, edição e exclusão de reserva registra quem fez e quando.
- **Dashboard analítico** com estatísticas de ocupação, tipos de cliente e movimento por período (Chart.js).
- **Room service** com sua própria fila e controle de tempo.
- **Login por usuário** (recepção / osteria / gerência), cada um com sua sessão.

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES6 modules nativos — sem bundler, sem framework) |
| Banco de dados | Firebase Firestore (tempo real via `onSnapshot`) |
| Autenticação | Firebase Authentication (e-mail/senha) |
| Gráficos | Chart.js |
| Deploy | Arquivos estáticos, sem servidor backend próprio |

## Segurança — auditoria e correções aplicadas

Depois da versão inicial (feita com apoio de IA), conduzi uma auditoria de segurança e qualidade de código no projeto e corrigi, entre outros pontos:

- **Login real via Firebase Authentication**, substituindo uma verificação de senha feita inteiramente no navegador (senhas expostas em texto puro no código-fonte).
- **Regras de segurança do Firestore** (`firestore.rules`) travadas para exigir autenticação — antes, o banco aceitava leitura e escrita de qualquer pessoa na internet, sem login.
- **Correção de XSS armazenado**: campos de texto livre (nomes, observações) eram inseridos sem sanitização no HTML da grade, permitindo injeção de código malicioso através de uma reserva. Corrigido com escaping de saída em todos os pontos de renderização.

O histórico completo de decisões técnicas, bugs corrigidos e arquitetura do sistema está documentado em [`prompt.md`](prompt.md).

## Como rodar localmente

Não há build step — é só servir os arquivos estáticos:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`. É necessário um projeto Firebase próprio (Firestore + Authentication) configurado em `js/core/database.js`.

## Documentação técnica

Para detalhes de arquitetura, modelo de dados, regras internas do código e histórico de manutenções, veja [`prompt.md`](prompt.md).

## Testes

O projeto tem testes automatizados com [Vitest](https://vitest.dev/) cobrindo as regras de validação, o gerenciamento de estado e a lógica de cálculo de posição de reservas (81 testes). Rode com:

```bash
npm install
npx vitest run
```

O plano completo (ferramenta escolhida, prioridades, convenções, o que ainda falta) está documentado em [`TESTES.md`](TESTES.md).
