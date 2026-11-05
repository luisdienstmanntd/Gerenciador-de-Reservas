-- Compatível com instalações antigas e com produção, que já aceita direto.
alter table public.reservas drop constraint if exists reservas_pagamento_check;
alter table public.reservas add constraint reservas_pagamento_check
  check (pagamento in ('pago', 'pendente', 'direto') or pagamento is null);
