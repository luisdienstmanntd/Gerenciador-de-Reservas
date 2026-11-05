alter table public.hospedes drop constraint if exists hospedes_tipo_check;
alter table public.hospedes add constraint hospedes_tipo_check check (tipo in ('hospede', 'externo', 'passante', 'cortesia', 'roomservice'));
