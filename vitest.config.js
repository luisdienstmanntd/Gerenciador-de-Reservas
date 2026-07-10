import { defineConfig } from 'vitest/config';

// O projeto não tem bundler — no navegador, js/core/supabaseClient.js importa o SDK
// direto de uma URL do CDN (https://esm.sh/...), sem passar por node_modules.
// O Node (usado pelo Vitest) não sabe buscar um módulo via HTTPS — só entende
// especificadores de pacote (node_modules) ou caminhos de arquivo. Este alias
// redireciona essa URL exata para o pacote @supabase/supabase-js já instalado via
// npm (usado só nos testes/scripts Node), sem exigir nenhuma mudança no código do
// navegador.
export default defineConfig({
    resolve: {
        alias: {
            'https://esm.sh/@supabase/supabase-js@2.110.2': '@supabase/supabase-js',
        },
    },
});
