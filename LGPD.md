# LGPD — Plano de Anonimização de Dados

**Status:** planejado — implementação ainda não iniciada
**Última atualização:** 2026-07-03

---

## 1. Contexto

O sistema armazena dados pessoais de hóspedes/clientes na coleção `reservas`: **nome** e **telefone** (além de apartamento, tipo de cliente, datas). A LGPD (Lei 13.709/2018) exige que dados pessoais não sejam retidos indefinidamente sem finalidade (Art. 15/16).

**Restrição do negócio:** o dono do projeto usa o Dashboard para análises históricas (comparação mês a mês e ano a ano, DDD de origem dos telefones, dias mais movimentados, proporção hóspede×externo, apartamentos que mais usam o restaurante) — **os dados não podem ser excluídos**, só deixar de ser "pessoais".

## 2. Solução decidida: anonimização, não exclusão

A LGPD considera dado anonimizado como **deixando de ser dado pessoal** (Art. 12), desde que a reversão não seja razoavelmente possível. Nenhuma das análises do Dashboard precisa do nome ou do telefone completo — precisam de data, tipo, apartamento, quantidade de pessoas e o **DDD** (não o número inteiro).

**Plano:** depois de um prazo de retenção (a definir — 12 ou 24 meses eram as opções em discussão), uma rotina automática:
- Remove `nomes` por completo.
- Extrai o DDD de `whatsapp` (ex: `(54) 99999-8888` → `54`) e descarta o resto do número.
- **Mantém intactos**: `data`, `horario`, `originalBase`, `tipo`, `apto`, `paxs`, `chd`, `mesa`, `pagamento`, `bloqueado`, `somenteHospedes`, `menuDegustacao`.

## 3. Onde implementar (quando for feito)

Seguir o mesmo padrão já usado em `limparConfigDiasAntigos()` (`database.js`) e `limparFantasmasDoDia()` (`service.js`):

1. Novo método em `database.js` ou função em `service.js`: `anonimizarReservasAntigas(mesesRetencao)`.
2. Query `reservas` com `data < corte`, filtra docs com `nomes` ainda preenchido (pula os já anonimizados).
3. Batch update: `nomes: ''`, `whatsapp: ''` (ou só DDD, ver decisão de formato), mantém o resto.
4. Chamada em background no boot (`init.js`), uma vez por sessão — mesmo padrão das limpezas existentes.

## 4. Pendências antes de codificar

- [ ] Definir prazo de retenção (12 ou 24 meses, ou outro)
- [ ] Decidir formato: guardar só o DDD (`"54"`) ou remover `whatsapp` por completo
- [ ] Confirmar se `apto` deve ser mantido (é identificador do hotel, não da pessoa — mas vale revisão)

## 5. Fora do escopo deste documento (jurídico, não código)

- Base legal do tratamento (provavelmente execução de contrato/legítimo interesse)
- Aviso de privacidade aos hóspedes
- Necessidade de encarregado de dados (DPO)
- Verificar região de armazenamento do Firestore (transferência internacional, Art. 33)

## 6. O que já está em conformidade (não precisa de ação)

- Controle de acesso (Firebase Authentication + regras do Firestore) — Art. 46
- Log de auditoria (`log.js`, quem criou/editou/excluiu cada reserva) — Art. 6º, X
