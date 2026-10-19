# Detecção de Ideias Semelhantes: busca textual sempre ativa + semântica opcional, sobre PostgreSQL

A detecção de Ideias Semelhantes precisa funcionar em instalações self-hosted que podem não aceitar enviar dados para fora. Decidimos usar PostgreSQL como banco, com busca textual (full-text em português + pg_trgm) sempre ativa, e busca semântica via embeddings armazenados em pgvector como recurso opcional, habilitado quando o Administrador configura um provedor (API compatível com OpenAI ou Ollama local). Quando ambos estão ativos, os resultados são combinados.

## Considered Options

- Só textual: zero dependência, mas não pega paráfrases ("exportar planilha do RH" vs "gerar Excel na folha").
- Só semântica: melhor qualidade, mas o sistema fica sem detecção se nenhum provedor de IA for configurado.

## Consequences

O banco fica acoplado ao PostgreSQL (full-text em português, pg_trgm, pgvector); suportar outro SGBD exigiria reimplementar a busca. Trocar o modelo de embeddings exige reprocessar os vetores de todas as Ideias.
