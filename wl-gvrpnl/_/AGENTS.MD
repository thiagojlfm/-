

# Sistema de Registro Automatizado

## Objetivo

Desenvolver um sistema completo de registro de cidadãos utilizando **discord.js**, baseado em componentes (Buttons e Modals), seguindo a arquitetura atual do projeto.

O sistema deverá ser modular, organizado e facilmente expansível.

---

# Estrutura do Projeto

Todo o desenvolvimento deverá respeitar a seguinte arquitetura:

```text
meu-bot/
├── src/
│   ├── commands/
│   │   ├── admin/
│   │          
│   ├── events/
│   │   ├── client/
│   │   └── interaction/
│   │
│   ├── components/
│   │   ├── buttons/
│   │   ├── modals/
│   │   ├── selectMenus/
│   │   └── embeds/
│   │
│   ├── database/
│   │
│   ├── services/
│   │
│   ├── utils/
│   │
│   ├── structures/
│   │
│   └── index.js
│
├── .env
├── package.json
└── README.md
```

Caso algum diretório ainda não exista, ele deverá ser criado.

---

# Tecnologias

- discord.js (última versão estável)
- Node.js
- Components API
- Modals
- Buttons
- Embeds

---

# Objetivo do Sistema

Automatizar completamente o registro de novos jogadores.

Todo o fluxo deverá ocorrer dentro do Discord.

---

# Fluxo do Sistema

## <:rpc2:1500318320853782669> Solicitação de Registro

Existe um canal:

> #registro-cidadao

Neste canal haverá apenas um Embed contendo um botão.

Botão:

```
Registrar Personagem
```

Ao clicar:

- verificar se o usuário já possui um registro pendente;
- verificar se já foi aprovado anteriormente.

---

## <:lock_gvrpnl:1466937465674792990> Bloqueio de Registros

O usuário **NÃO** poderá criar outro registro quando:

- possuir um registro pendente;
- possuir um registro aprovado.

Caso tente novamente, deverá receber uma resposta **ephemeral** informando que já possui um registro em andamento.

Somente usuários reprovados poderão enviar uma nova solicitação.

---

## <:rpc2:1500318320853782669> Formulário

Ao clicar no botão deverá abrir um Modal.

Os campos serão definidos posteriormente.

Após o envio:

- salvar o registro no log;
- definir o status como:

```
PENDENTE
```

---

## <:tempo_gvrpnl:1466937443545780437> Confirmação

Após enviar:

Responder ao jogador utilizando uma mensagem **ephemeral**.

Exemplo:

> Seu registro foi enviado com sucesso.
>
> Aguarde a análise da equipe.

---

# Painel da Staff

O bot deverá enviar automaticamente uma Embed para um canal específico.

Exemplo:

> #avaliacao-registros

Cada registro será uma mensagem independente.

A Embed deverá conter todas as informações do personagem.

Também deverá conter:

- ID do registro
- ID do Discord
- Data
- Horário

---

# Botões da Staff

Cada registro deverá possuir:

🟢 Aprovar

🔴 Reprovar

---

# Aprovação

Quando clicar em Aprovar:

O sistema deverá:

- alterar o nickname do usuário;
- adicionar os cargos configurados;
- remover cargos temporários;
- remover acesso ao canal de registro;
- alterar o status para:

```
APROVADO
```

Responder ao jogador via DM informando que seu registro foi aprovado.

Depois disso:

Excluir automaticamente a mensagem do painel de análise.

---

# Reprovação

Ao clicar em Reprovar:

Deverá abrir um Modal solicitando:

```
Motivo da reprovação
```

Esse campo será obrigatório.

Após confirmar:

- alterar status para:

```
REPROVADO
```

- enviar uma DM ao jogador contendo o motivo;
- excluir o painel da staff;
- permitir que o jogador envie um novo registro.

---

# Logs

## <:rpc2:1500318320853782669> Obrigatório

Todas as ações do sistema deverão ser registradas em um canal exclusivo de logs do Discord.

Exemplo:

```
#logs-registros
```

Os logs deverão conter, no mínimo:

### Registro criado

- ID do registro
- Usuário
- ID do Discord
- Data
- Hora

---

### Registro aprovado

- Staff responsável
- Usuário
- Personagem
- ID do registro
- Data
- Hora

---

### Registro reprovado

- Staff responsável
- Usuário
- Personagem
- Motivo informado
- ID do registro
- Data
- Hora

---

Todos os logs deverão ser enviados através de Embeds.

---

# Segurança

O sistema deverá impedir:

- dois staffs aprovarem simultaneamente;
- dois staffs reprovarem simultaneamente;
- aprovação dupla;
- reprovação dupla;
- registros duplicados.

Após qualquer decisão:

Os botões deverão ser imediatamente desabilitados.

Em seguida a mensagem deverá ser removida.

---

# Banco de Dados (containers no discord )

Cada registro deverá possuir pelo menos:

```
id

discordId

nicknameOriginal

nomePersonagem

status

motivoReprovacao

staffResponsavel

createdAt

updatedAt


```
Os registros serão feitos através de containers no discord. serao enviados em um canal de logs


---

# Organização

Todo o código deverá seguir responsabilidade única.

Não concentrar toda a lógica dentro do InteractionCreate.

A lógica deverá ser distribuída entre:

- Components
- Services
- Database
- Utils

---

# Embeds

Todas as Embeds deverão seguir uma identidade visual consistente.

## Cores

Utilizar preferencialmente:

| Cor | Utilização |
|------|------------|
| `#3C166C` | Containers principais do sistema |
| `#75F5E9` | Aprovações e operações concluídas |
| `#3120F2` | Informações gerais |
| `#6E4D5F` | Registros pendentes |
| `#F07671` | Avisos |
| `#FF59A2` | Reprovações e erros |

---

# Emojis

Utilizar os seguintes emojis personalizados sempre que fizer sentido:


---

# Código

O código deverá seguir boas práticas:

- Modular
- Legível
- Reutilizável
- Comentado apenas quando necessário
- Sem duplicação de lógica
- Separação entre interface e regras de negócio

---

# Escalabilidade

O sistema deverá ser desenvolvido pensando em futuras funcionalidades, como:

- Solicitação de correção
- Histórico de registros
- Consulta de registros
- Estatísticas
- Dashboard administrativo
- Integração com whitelist
- Integração com sistemas econômicos
- Integração com sistemas judiciais

Toda a arquitetura deverá facilitar a implementação dessas funcionalidades sem necessidade de reestruturar o projeto.