# Correções de paleta e contraste

As alterações atendem aos 14 grupos da auditoria e aos quatro da revisão independente, mantendo a identidade marrom/bege. Cores semânticas de sucesso, aviso, erro e categorias continuam presentes, com variantes adequadas a cada tema.

- **A01–A03 / A09:** ações primárias usam marrom e branco; cancelar/voltar usam superfície neutra; exclusão usa fundo e texto de erro. Pesquisas de Room Service e Log seguem o mesmo contrato.
- **A04:** tokens claro/escuro centralizados em `base.css`, sem os antigos tokens de tema com `!important`. Aliases legados são resolvidos novamente no `body.dark-theme`; títulos e fundos de ação usam tokens distintos.
- **A05 / R02:** navegação móvel ativa, identificação, Logout e controle de tema usam cores legíveis sobre a sidebar.
- **A06–A07:** mensagens de recuperação e textos de chegada/pagamento usam tokens de texto semântico; os tons claros de mensagens do painel de login ficam restritos à superfície escura.
- **A08 / A10–A12:** Room Service, Log, toasts, confirmações, seleção de mesa, ações de reserva e timers usam a paleta compartilhada. Seletores de tema do Log corrigidos para `dark-theme`. Timers preservam seus limites e deixam de perder contraste durante a pulsação.
- **A13:** foco opaco de 3px, também em links e elementos com `tabindex`; limites dos campos e placeholders diferenciados das bordas decorativas. Campos desabilitados continuam visualmente distintos.
- **A14:** gráficos da Home e Dashboard recriam suas instâncias ao receber `osteria:themechange`, reutilizando os dados já carregados e lendo as cores atuais do CSS. Ambas as legendas do gauge são atualizadas.
- **R01 / R03–R04:** observações e nomes deixam de acumular opacidades; linhas canceladas continuam clicáveis e legíveis; rótulos de degustação/cancelamento e instrução do sinal usam tokens existentes.
- **Ajustes complementares:** filtros anunciam seleção com `aria-pressed` e contorno sem esmaecer os outros cartões. Estados vazios, previsão de liberação e cabeçalho do sino usam texto secundário opaco. A remoção de uma data do Dashboard recebe botão com rótulo acessível.

## Validação

`npm test` inclui testes de contraste dos pares de tokens (4,5:1 para texto normal, 3:1 para foco/limites relevantes), troca claro → escuro → claro dos gráficos e seleção dos filtros. A suíte anterior continua cobrindo regras de negócio.

Também foram conferidas as cores calculadas pela cascata do navegador, com dados fictícios e os CSS/elementos reais, nos temas claro/escuro e em larguras de desktop, tablet e celular. Entre os componentes medidos: ações, sidebar, navegação móvel, status, badges, timers, observações, sinal e mensagens de recuperação. Contraste do botão Salvar: **6,94:1**. Foco por teclado conferido no modal em 390px, sem rolagem horizontal.

Isso não é uma certificação integral WCAG: a validação visual usa componentes isolados, sem login nem dados de produção, e não simula todos os conteúdos, tecnologias assistivas ou estados operacionais possíveis. Esta rodada não exige migration de banco e não publica automaticamente o frontend.
