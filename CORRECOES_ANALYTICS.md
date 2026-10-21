# Correções de coleta e análise de reservas

- A grade de reservas não chama mais o processamento do Dashboard com os dados de um único dia. A análise tem seu próprio contexto de datas, exclusões e denominador.
- Cada consulta captura parâmetros e recebe uma geração. Respostas antigas, alterações de filtros e saída da página invalidam requisições pendentes.
- Carregamento, filtros pendentes, período inválido, seleção sem dias e falhas têm estado explícito. Números anteriores são retirados; falha não vira zero. A grade também limpa dados antigos ao mudar de data e sinaliza indisponibilidade.
- Leituras por dia/período usam páginas ordenadas de 500 registros com contagem exata. Limites menores do servidor são acomodados; erro, repetição de IDs ou mudança de quantidade impedem a devolução de um resultado parcial.
- A Home consulta hoje e os seis dias seguintes em uma assinatura de período, atualizando cards e gráficos com o mesmo conjunto. Gerações e encerramento de assinaturas evitam callbacks órfãos.
- Mudanças de reserva, inclusive transferências para fora do período, invalidam as análises. A grade também acompanha transferências feitas por outro dispositivo. Reconexão e retorno à aba refazem as consultas. Uma revisão a cada 60 segundos cobre eventos perdidos e alterações externas de hóspedes, cuja tabela não está publicada no Realtime deste projeto.
- O gráfico de perfil usa PAX em todos os tipos, inclusive Room Service. O card Room continua contando atendimentos/apartamentos. A ocupação usa apenas PAX do restaurante; o total geral continua incluindo Room Service e no-show como reservas, sem confundir esse total com comparecimento.
- Horários personalizados presentes nas reservas são incluídos nas curvas da Home e Dashboard.
- Giro de mesas descarta canceladas, bloqueios, restrições, Room Service, no-show e durações inválidas. Mesas simultâneas são agrupadas por identificador. Tempo médio nos cards e Dashboard não mistura entrega de Room Service com permanência em mesa.
- O período aplicado e a hora de atualização ficam visíveis; a Home tem ação ATUALIZAR e troca seu escopo ao passar a meia-noite em São Paulo.

## Validação

Os cenários reproduzidos na auditoria foram transformados em testes do comportamento corrigido. A suíte cobre paginação acima de mil registros e com limites menores, erros intermediários, concorrência, alterações de filtros, retorno de página, eventos de transferência, desconexão, reconexão, indicadores e unidades. A verificação visual usa Chart.js ativo, HTML/CSS/JS reais e dados fictícios locais nos temas claro/escuro, de 320 a 1366 px.

Sem migration ou escrita em dados reais. A paginação confere contagem/IDs, mas não é um snapshot transacional de todas as páginas: mudanças concorrentes que preservem quantidade e IDs podem refletir instantes ligeiramente distintos. As atualizações seguintes reconciliam os dados. As regras de PAX continuam representando reservas previstas, não consumo ou presença efetiva. Aparelhos físicos e sessão autenticada de produção não foram usados para testes de gravação.
