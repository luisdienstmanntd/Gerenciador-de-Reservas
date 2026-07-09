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

## Fase 2 — Modelagem do Banco (Schema SQL)

Desenhar as tabelas relacionais substituindo as coleções do Firestore. Sugestão de estrutura inicial (ajustar conforme os campos reais usados hoje no Firestore):

```sql
-- Hóspedes / clientes
create table hospedes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  criado_em timestamptz default now()
);

-- Mesas ou espaços reserváveis
create table mesas (
  id uuid primary key default gen_random_uuid(),
  identificador text not null,
  capacidade int not null
);

-- Reservas (tabela central)
create table reservas (
  id uuid primary key default gen_random_uuid(),
  hospede_id uuid references hospedes(id),
  mesa_id uuid references mesas(id),
  data_reserva date not null,
  horario time not null,
  numero_pessoas int not null,
  status text not null default 'confirmada', -- confirmada | cancelada | concluida | no_show
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Log de eventos de reserva (histórico imutável — essencial p/ análise de dados)
create table reservas_log (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid references reservas(id),
  status_anterior text,
  status_novo text not null,
  alterado_em timestamptz default now(),
  alterado_por text
);
```

**Ponto crítico de design:** nunca fazer `DELETE` de reservas — apenas mudar `status` e gravar em `reservas_log`. Isso preserva histórico para análise de ocupação, cancelamentos, no-shows, etc.

- [ ] Validar esse schema contra os campos reais do Firestore atual (extrair schema real das collections antes de finalizar)
- [ ] Criar as tabelas no Supabase via SQL Editor ou migration
- [ ] Criar índices em `reservas(data_reserva)` e `reservas(status)` para performance de queries analíticas

---

## Fase 3 — Row Level Security (RLS)

Substituir as regras do Firestore por políticas RLS do Postgres:

- [ ] Habilitar RLS em todas as tabelas (`alter table reservas enable row level security;`)
- [ ] Criar políticas equivalentes às regras atuais do Firestore (leitura/escrita autenticada apenas)
- [ ] Testar que usuários não autenticados não conseguem ler/escrever
- [ ] Revisar se algum endpoint precisa de acesso público (ex: formulário de reserva do hóspede) e criar política específica e restrita para esse caso

---

## Fase 4 — Migração de Dados Existentes

- [ ] Escrever script único de migração (Node.js) que lê todas as reservas do Firestore e insere no Supabase
- [ ] Rodar em ambiente de teste primeiro (projeto Supabase separado ou schema de staging)
- [ ] Validar contagem de registros migrados (Firestore vs Supabase) bate 100%
- [ ] Só migrar produção depois de validado

---

## Fase 5 — Refatoração do Código da Aplicação

- [ ] Substituir todas as chamadas `collection()/doc()/getDocs()` do Firestore por queries do Supabase client (`.from('reservas').select()`, `.insert()`, `.update()`)
- [ ] Manter a mesma interface/funções públicas do módulo de dados (para não precisar reescrever a UI) — criar uma camada de abstração se ainda não existir
- [ ] Ajustar tratamento de erros para o formato de resposta do Supabase
- [ ] Rodar os 81 testes Vitest existentes e corrigir os que dependem de mocks do Firestore

---

## Fase 6 — Heartbeat via GitHub Actions (evitar pausa por inatividade)

Supabase free tier pausa projetos após 7 dias sem atividade de banco de dados. Solução: workflow agendado que faz uma query simples periodicamente.

- [ ] Criar tabela de heartbeat:
```sql
create table heartbeat (
  id serial primary key,
  checado_em timestamptz default now()
);
```

- [ ] Criar arquivo `.github/workflows/supabase-heartbeat.yml`:
```yaml
name: Supabase Heartbeat

on:
  schedule:
    - cron: '0 12 * * 1,4' # roda toda segunda e quinta às 12h UTC
  workflow_dispatch: # permite rodar manualmente também

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -X POST "${{ secrets.SUPABASE_URL }}/rest/v1/heartbeat" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

- [ ] Adicionar `SUPABASE_URL` e `SUPABASE_ANON_KEY` como **GitHub Secrets** no repositório (nunca no código)
- [ ] Criar rotina de limpeza (opcional): deletar registros de heartbeat com mais de 30 dias, para não acumular lixo na tabela
- [ ] Rodar o workflow manualmente uma vez (`workflow_dispatch`) para validar que funciona antes de confiar no cron

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