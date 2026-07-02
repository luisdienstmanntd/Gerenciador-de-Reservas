# Plano de Testes — Osteria Di Lucca

**Status:** implementação em andamento — 81 testes passando (3 arquivos)
**Última atualização:** 2026-07-02

---

## 1. Por que este projeto não tem testes ainda

O sistema foi construído sem build step, com ES6 modules nativos carregados direto pelo navegador. Isso é ótimo pra simplicidade de deploy, mas significa que, até aqui, toda a validação de mudanças era manual — abrir o app, clicar, conferir visualmente.

Isso já causou problemas reais: o histórico de bugs documentado em [`prompt.md`](prompt.md) (seção 17) lista **29 bugs corrigidos**, boa parte deles em lógica de posicionamento de reservas (`service.js`) — código que já quebrou de formas sutis várias vezes. Testes automatizados existem exatamente para impedir que um bug corrigido volte a acontecer sem ninguém perceber.

## 2. Ferramenta escolhida: Vitest

| Alternativa | Por que não |
|---|---|
| Jest | É o padrão de mercado mais conhecido, mas tem fricção real com ES6 modules nativos sem bundler — exigiria configuração extra de transformação (Babel) só pra rodar. |
| **Vitest** ✅ | Suporta ESM nativamente (mesmo formato de módulo que o projeto já usa), roda rápido, e a sintaxe (`describe`, `it`, `expect`) é praticamente idêntica ao Jest — conhecimento transferível pra qualquer emprego que use Jest. |

Importante: adicionar o Vitest **não** transforma o projeto num projeto com bundler. O `index.html` continua carregando os scripts exatamente como carrega hoje, direto no navegador. O Vitest roda só durante o desenvolvimento, via terminal (`npx vitest`), fora do fluxo do app em produção.

## 3. O que instalar

Vai ser necessário criar um `package.json` (hoje o projeto não tem nenhum) só para gerenciar essa dependência de desenvolvimento:

```bash
npm init -y
npm install -D vitest
```

Isso cria/atualiza:
- `package.json` — lista o Vitest como dependência de desenvolvimento (`devDependencies`), não afeta o app em produção.
- `node_modules/` — pasta de dependências baixadas (deve entrar no `.gitignore`, nunca ser commitada).
- `package-lock.json` — trava as versões exatas instaladas (esse sim é commitado, garante que todo mundo instala as mesmas versões).

Depois disso, rodar os testes é `npx vitest` (modo watch, roda de novo a cada mudança salva) ou `npx vitest run` (roda uma vez só e sai).

## 4. Onde os testes ficam

Cada teste vive **ao lado do arquivo que testa**, com o sufixo `.test.js` — não numa pasta `tests/` separada. Isso deixa óbvio, só olhando a pasta, quais arquivos já têm cobertura e quais não têm:

```
js/
└── features/
    └── reservas/
        ├── validators.js
        ├── validators.test.js   ← testa validators.js
        ├── service.js
        ├── service.test.js      ← testa service.js
        ├── ...
```

## 5. Como escrever um teste (convenção)

Estrutura básica de um arquivo `*.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { validarPax } from './validators.js';

describe('validarPax', () => {
    it('rejeita zero adultos', () => {
        expect(validarPax(0)).toBe(false);
    });

    it('aceita 1 adulto (mínimo)', () => {
        expect(validarPax(1)).toBe(true);
    });

    it('aceita até 20 adultos (máximo)', () => {
        expect(validarPax(20)).toBe(true);
    });

    it('rejeita acima de 20', () => {
        expect(validarPax(21)).toBe(false);
    });
});
```

Regra prática: **um `it()` por comportamento esperado**, com nome descrevendo o cenário em português claro (isso é o que aparece no relatório quando o teste falha — precisa ser autoexplicativo).

## 6. Roadmap — o que testar, em ordem de prioridade

| # | Módulo | Por quê essa prioridade | Status |
|---|---|---|---|
| 1 | `validators.js` | Funções puras (mesma entrada → mesma saída, sem tocar DOM/Firebase). Mais fácil de começar, bom pra pegar o jeito. | ✅ Concluído — 54 testes (`validators.test.js`), incluindo `destacarCamposInvalidos`/`limparHighlightCampos` com DOM simulado (jsdom) |
| 2 | `service.js` | Concentra a maioria dos 29 bugs históricos (cálculo de posição livre, `salvarApenasHorario`, prevenção de fantasmas). Maior valor de proteção contra regressão. | 🟡 Parcial — `_calcularPosicaoLivre()` exportada e testada (9 testes, cobre os bugs #25/#26/#27). As funções `async` que gravam no Firestore (`salvarReserva`, `salvarApenasHorario`, `removerLinhaDoBloco`, etc.) ainda não têm teste — exigem simular (`vi.mock`) o objeto `db` inteiro, incluindo `.collection().where().get()` e `.batch()`. Fica como próximo passo. |
| 3 | `escapeHtml()` (`validators.js`) | Trava a correção de XSS feita em 2026-07-02 — garante que texto malicioso nunca mais seja inserido sem escapar. | ✅ Concluído — incluído em `validators.test.js` |
| 4 | `state.js` | Funções simples de get/set, mas concentram regras importantes (`linhasExtras` pode ser negativo, nunca aplicar `Math.max(0, ...)`). | ✅ Concluído — 18 testes (`state.test.js`), incluindo o caso de valores negativos em `linhasExtras` |
| 5 | `render.js` | Lógica de `rowspan` e montagem de blocos — mais difícil de testar (precisa de DOM simulado), mas é onde já houve bugs visuais recorrentes. | ⏳ Pendente |

Módulos que dependem diretamente do Firebase (`database.js`, `listener.js`) ficam de fora do escopo inicial — testar isso exigiria simular (mock) o Firestore inteiro, o que é um projeto à parte. Prioridade é cobrir a lógica de negócio pura primeiro.

**Resultado atual:** `npx vitest run` → **81 testes passando** em 3 arquivos (`validators.test.js`, `state.test.js`, `service.test.js`).

## 7. Definição de "pronto" para cada módulo

Um módulo é considerado testado quando:
- Os principais caminhos de sucesso têm teste (entrada válida → resultado esperado).
- Os principais casos de erro/borda têm teste (entrada inválida, valores limite como 0, negativo, string vazia).
- Todos os testes passam rodando `npx vitest run`.

Ao concluir um módulo, atualizar a coluna Status desta tabela para ✅ Concluído.
