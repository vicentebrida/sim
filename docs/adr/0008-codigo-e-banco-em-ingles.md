# Código, banco e API em inglês; domínio documentado em português

O código (identificadores, comentários e testes), o banco de dados (tabelas e colunas) e a API REST (rotas, campos e códigos de erro) ficam em inglês. A linguagem do domínio continua em português no `CONTEXT.md`, no PRD e nas ADRs, e cada termo do glossário indica o nome usado no código (`_Code_`). A interface é traduzida por i18n (pt-BR e en).

Escolhemos inglês por ser um projeto open source: facilita contribuições de fora do Brasil e evita misturar idiomas com bibliotecas e frameworks, que já são em inglês.

## Considered Options

- Tudo em português: fiel à linguagem do domínio, mas afasta contribuidores e mistura idiomas no código.
- Só o banco em inglês: muda pouco, mas exige um mapeamento nome a nome entre o schema e o código.

## Consequences

- Mensagens de erro da API são para quem desenvolve. A interface mostra textos traduzidos a partir do `code` de cada erro (ex.: `LIKE_UNAVAILABLE`).
- Os valores de Status trafegam em inglês (`under_review`), e a interface exibe o rótulo traduzido.
- Dados criados para o usuário, como os Campos Personalizados iniciais, continuam em português.
