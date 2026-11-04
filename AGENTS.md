# Sincronização obrigatória entre computadores, GitHub e produção

- Esta regra vale para todo o projeto, em qualquer computador e com qualquer agente.
- Antes de alterar código, leia productlog.md por completo, consulte origin/main e confira branch, commit e alterações locais. Faça fetch e atualize a base sem descartar trabalho local. Nunca use uma cópia antiga de work/, backup ou release como base presumida.
- GitHub é a fonte oficial do código compartilhado. Todo trabalho deve ser commitado e enviado ao GitHub antes de encerrar a sessão ou trocar de computador. Trabalho incompleto deve ir para uma branch identificada, com estado e pendências registrados; não publicar trabalho incompleto em produção.
- Antes de integrar, atualize a branch com main, resolva conflitos preservando funcionalidades e execute as verificações pertinentes. Se main avançar durante o trabalho, revise a integração antes de publicar. Não usar force push em main nem sobrescrever alterações de outro computador.
- Produção deve corresponder aos artefatos de um commit identificado de main no GitHub. Registre commit, release, validação e pendências no histórico de publicação. Diferenças de arquivos gerados precisam ser reproduzíveis a partir desse commit.
- Deploy deve partir de checkout limpo desse commit, após push, validação e conferência das migrations necessárias. Confira novamente origin/main imediatamente antes de publicar; se avançou, interrompa a publicação antiga e reconcilie. Não fazer deploy de pasta antiga ou código exclusivo de um computador.
- Após deploy, confira a versão servida, os arquivos publicados e a atualização do service worker/cache; teste os fluxos afetados. Só declarar sincronizado após verificar. Em falha, registrar explicitamente a divergência e o próximo passo.
- Se produção e GitHub divergirem, preserve ambas as versões, compare e reconcilie funcionalidades antes de qualquer deploy. Não presumir que publicar main resolve: produção pode conter melhorias ainda não versionadas.
- Rollback deve ser explícito, justificado e registrado no GitHub, reconciliando main e produção; nunca restaurar silenciosamente uma versão antiga.
- Ao encerrar, informar branch/commit enviado, commit publicado (ou deploy pendente), verificações e pendências. A regra exige esse processo; não significa que já exista sincronização automática ou CI/CD configurado.
