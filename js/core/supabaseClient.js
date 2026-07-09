/* =========================================================================================
   OSTERIA DI LUCCA - SUPABASE CLIENT.JS v1.0
   RESPONSABILIDADE: Conexão com o Supabase (PostgreSQL) — Fase 1 da migração Firestore→Supabase
   ✅ v1.0: Cliente inicial. Projeto ainda não tem bundler, então o SDK é importado via CDN
            ESM (esm.sh), na mesma versão instalada via npm (usada pelos testes em Node).
            SUPABASE_URL e SUPABASE_ANON_KEY não são segredos — equivalentes à apiKey do
            Firebase. A proteção real vem das políticas de RLS (ver Fase 3 do plano de ação).
   ========================================================================================= */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

const SUPABASE_URL = 'https://fiamtckdglzdrynmrlpj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_y1q0B_PIHkTz_Zk_HQhOHQ_3wPRRiS1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
