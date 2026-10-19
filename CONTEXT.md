# SIM — Sistema de Ideias e Melhorias

Espaço onde os colaboradores de uma organização propõem, discutem e acompanham sugestões para melhorar a empresa (processos, sistemas, ambiente etc.).

## Language

**Ideia**:
Uma sugestão registrada por um colaborador para criar algo novo ou melhorar algo existente na organização. É o conceito central do sistema; "melhoria" não é um conceito separado.
_Avoid_: Melhoria (como entidade), sugestão, ticket, post, tópico

**Categoria**:
Área temática da organização à qual uma Ideia pertence (ex.: TI, RH, Facilities). Toda Ideia tem exatamente uma Categoria, que define quem a avalia. Não há subcategorias; Categorias com Ideias são desativadas, nunca excluídas.
_Avoid_: Departamento, setor, área, tag

**Campo Personalizado**:
Campo do formulário da Ideia definido pelo Administrador (ex.: Situação atual, Proposta, Benefício esperado), válido para todas as Categorias ou só para algumas. Uma vez preenchido em alguma Ideia, só pode ser desativado, nunca excluído.
_Avoid_: Campo customizado, campo extra, atributo

**Ideia Semelhante**:
Ideia já existente que o SIM sugere ao Colaborador, enquanto ele escreve uma nova, por tratar do mesmo assunto. O aviso não impede a publicação.
_Avoid_: Ideia parecida, sugestão, match, possível duplicata

**Curtida**:
Manifestação de um Colaborador de que também quer que uma Ideia aconteça. Uma por Colaborador por Ideia, nunca do próprio Autor, e sempre identificada.
_Avoid_: Like, voto, apoio, upvote

**Ideia Original**:
A Ideia para a qual uma Ideia Duplicada aponta, e para onde migram as Curtidas da Duplicada.
_Avoid_: Ideia principal, ideia mãe

## Discussão

**Comentário**:
Mensagem de um Colaborador publicada numa Ideia. Pode receber Respostas, mas não é uma Resposta.
_Avoid_: Post, mensagem, interação

**Resposta**:
Comentário feito em reação a outro Comentário; não pode ser respondida (um único nível).
_Avoid_: Sub-comentário, thread, réplica

**Menção**:
Referência a um Colaborador dentro de um Comentário (`@nome`), que o notifica.
_Avoid_: Marcação, tag

**Comentário Oculto**:
Comentário retirado de exibição por um Avaliador ou Administrador por violar regras de convivência, com motivo registrado. Difere do comentário removido pelo próprio autor.
_Avoid_: Comentário moderado, censurado, deletado

**Anexo**:
Arquivo (imagem ou documento) enviado junto com uma Ideia ou um Comentário.
_Avoid_: Arquivo, upload, attachment

## Acompanhamento

**Seguir**:
Ato de um Colaborador passar a acompanhar uma Ideia e receber Notificações sobre ela. Acontece automaticamente ao criar, comentar ou curtir, e pode ser desfeito.
_Avoid_: Acompanhar, assinar, inscrever-se, watch

**Seguidor**:
Colaborador que segue uma determinada Ideia.
_Avoid_: Inscrito, assinante, interessado

**Notificação**:
Aviso enviado a um Colaborador sobre um acontecimento relevante para ele (mudança de Status, Comentário, Resposta, Menção, nova Ideia na Categoria que avalia).
_Avoid_: Alerta, aviso, mensagem

## Pessoas e papéis

**Colaborador**:
Qualquer pessoa da organização com acesso ao SIM. Pode criar Ideias, curtir, comentar e acompanhar.
_Avoid_: Usuário, funcionário, membro

**Autor**:
O Colaborador que criou uma determinada Ideia.
_Avoid_: Dono, criador, proponente

**Colaborador Inativo**:
Colaborador que não pode mais entrar no SIM (ex.: desligado da empresa). Suas Ideias, Comentários e Curtidas permanecem visíveis com seu nome; perde designações de Avaliador.
_Avoid_: Usuário bloqueado, desativado, ex-funcionário

**Anonimização**:
Remoção irreversível dos dados pessoais de um Colaborador a pedido (LGPD); o nome passa a "Ex-colaborador" e o conteúdo que ele produziu permanece.
_Avoid_: Exclusão de conta, apagar usuário

**Autoria Oculta**:
Opção pela qual o Autor esconde seu nome numa Ideia: Colaboradores e Avaliadores veem "Colaborador anônimo", e só Administradores podem identificá-lo, com acesso auditado. Só existe se habilitada na instalação. Cobre a Ideia e os Comentários do Autor nela; Curtidas e Comentários em outras Ideias seguem identificados.
_Avoid_: Ideia anônima, anonimato

**Avaliador**:
Colaborador designado, dentro do SIM, para triar e decidir o andamento das Ideias de uma ou mais Categorias. Não avalia Ideias das quais é o Autor.
_Avoid_: Gestor, moderador, responsável, aprovador

**Administrador**:
Colaborador com poder sobre todo o SIM: configura Categorias e Avaliadores e pode agir sobre qualquer Ideia, inclusive as sem Avaliador ou paradas.
_Avoid_: Admin, superusuário, comitê

## Ciclo de vida da Ideia

**Status**:
A etapa em que uma Ideia está no seu ciclo de vida. O conjunto de Status é fixo; o Administrador só altera rótulo, cor e descrição, e pode desligar Rascunho, Aprovada e Em execução. Toda mudança de Status feita por Avaliador ou Administrador exige uma justificativa, que fica registrada no Histórico da Ideia.
_Avoid_: Estado, fase, situação

**Rascunho**:
Ideia salva pelo Autor mas ainda não publicada; visível apenas para ele.

**Aberta**:
Ideia publicada, visível a todos os Colaboradores, aguardando triagem.
_Avoid_: Nova, pendente

**Em análise**:
Ideia que um Avaliador está avaliando.
_Avoid_: Em triagem, em avaliação

**Aprovada**:
Ideia que será realizada, mas cuja execução ainda não começou.

**Em execução**:
Ideia cuja implementação está em andamento.
_Avoid_: Em andamento, em desenvolvimento

**Concluída**:
Ideia implementada e entregue.
_Avoid_: Implementada, finalizada, fechada

**Recusada**:
Ideia que não será realizada, com justificativa obrigatória. Pode ser reaberta para Em análise.
_Avoid_: Rejeitada, negada, cancelada

**Duplicada**:
Ideia que repete outra já existente e aponta para essa Ideia original.
_Avoid_: Mesclada, repetida

**Arquivada**:
Ideia Aberta ou Em análise retirada de circulação por inatividade ou perda de relevância, sem julgamento de mérito. Pode ser desarquivada, voltando para Aberta.
_Avoid_: Inativa, pausada, congelada

**Ideia Parada**:
Ideia que excedeu o prazo configurado para seu Status atual (Aberta ou Em análise) sem ação de um Avaliador. Gera Notificação aos Avaliadores e depois escala para os Administradores; não é sinalizada aos demais Colaboradores.
_Avoid_: Ideia atrasada, esquecida, vencida

**Histórico**:
O registro cronológico das mudanças de Status e de Categoria de uma Ideia, com quem mudou e a justificativa.
_Avoid_: Log, timeline

## Governança

**Auditoria**:
Registro imutável de ações sensíveis de Administradores (ex.: revelar uma Autoria Oculta, executar uma Anonimização).
_Avoid_: Log, trilha
