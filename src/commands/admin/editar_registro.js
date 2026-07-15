const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editar_registro')
        .setDescription('Edita campos do registro aprovado de um jogador.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption(option =>
            option
                .setName('alvo')
                .setDescription('Mencione o usuário ou digite o SSN do personagem.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('nome_personagem')
                .setDescription('Novo nome do personagem.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('idade')
                .setDescription('Nova idade do personagem (número inteiro, mínimo 18).')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('local_nascimento')
                .setDescription('Novo local de nascimento do personagem.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('nick_roblox')
                .setDescription('Novo nickname do Roblox (nome de exibição).')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('user_roblox')
                .setDescription('Novo username do Roblox (nome principal).')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const alvoInput = interaction.options.getString('alvo');
        const mencaoMatch = alvoInput.match(/^<@!?(\d+)>$/);
        const alvoResolvido = mencaoMatch ? mencaoMatch[1] : alvoInput.trim();

        const nomePersonagem = interaction.options.getString('nome_personagem');
        const idadeRaw = interaction.options.getString('idade');
        const localNascimento = interaction.options.getString('local_nascimento');
        const nickRoblox = interaction.options.getString('nick_roblox');
        const userRoblox = interaction.options.getString('user_roblox');

        // Garante que ao menos um campo foi fornecido
        if (!nomePersonagem && !idadeRaw && !localNascimento && !nickRoblox && !userRoblox) {
            return interaction.editReply({
                content: 'Informe ao menos um campo para editar.'
            }).catch(() => null);
        }

        // Valida idade se fornecida
        let idade = null;
        if (idadeRaw !== null) {
            idade = parseInt(idadeRaw, 10);
            if (isNaN(idade) || !/^\d+$/.test(idadeRaw)) {
                return interaction.editReply({ content: 'A idade precisa ser um número inteiro válido (ex: 25).' }).catch(() => null);
            }
            if (idade < 18) {
                return interaction.editReply({ content: 'A idade mínima permitida é 18 anos.' }).catch(() => null);
            }
        }

        try {
            const campos = {};
            if (nomePersonagem) campos.nomePersonagem = nomePersonagem;
            if (idade !== null) campos.idade = idade.toString();
            if (localNascimento) campos.localNascimento = localNascimento;
            if (nickRoblox) campos.nickRoblox = nickRoblox;
            if (userRoblox) campos.userRoblox = userRoblox;

            const registroAtualizado = RegistroService.editarRegistro(alvoResolvido, campos);

            if (!registroAtualizado) {
                return interaction.editReply({
                    content: 'Nenhum registro aprovado encontrado com as informações fornecidas.'
                }).catch(() => null);
            }

            // Se o nome do personagem mudou, atualiza o apelido no Discord
            if (nomePersonagem) {
                const membro = await interaction.guild.members.fetch(registroAtualizado.discordId).catch(() => null);
                if (membro) {
                    await membro.setNickname(nomePersonagem).catch(err =>
                        console.log('[AVISO] Não foi possível atualizar o apelido:', err.message)
                    );
                }
            }

            // Monta lista de alterações feitas para exibição
            const alteracoes = [];
            if (nomePersonagem) alteracoes.push(`<:rpc2:1500318320853782669> **Nome do personagem:** \`${nomePersonagem}\``);
            if (idade !== null) alteracoes.push(`<:info:1373983629746638938> **Idade:** \`${idade} anos\``);
            if (localNascimento) alteracoes.push(`<:info:1373983629746638938> **Local de nascimento:** \`${localNascimento}\``);
            if (nickRoblox) alteracoes.push(`<:valdotsmall:1392947288879665244> **Nick Roblox:** \`${nickRoblox}\``);
            if (userRoblox) alteracoes.push(`<:valdotsmall:1392947288879665244> **Username Roblox:** \`@${userRoblox}\``);

            // Log
            const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
            if (canalLogs) {
                const logContainer = new ContainerBuilder()
                    .setAccentColor(0x3120F2)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '<:info:1373983629746638938> **Registro Editado**\n' +
                            '-# <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registroAtualizado.discordId}>\n` +
                            `<:lock_gvrpnl:1466937465674792990> **Editado por:** <@${interaction.user.id}>`
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**Campos alterados:**\n${alteracoes.join('\n')}\n\n` +
                            `-# <:lock_gvrpnl:1466937465674792990> SSN: \`${registroAtualizado.ssn}\` <:white_dot:1373337479721123870> ID: \`${registroAtualizado.id}\``
                        )
                    );

                await canalLogs.send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            // Resposta para o staff
            const containerResposta = new ContainerBuilder()
                .setAccentColor(0x3C166C)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:SimGVRPNL:1228154618048155701> **Registro atualizado com sucesso**\n' +
                        '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registroAtualizado.discordId}>\n\n` +
                        `**Alterações aplicadas:**\n${alteracoes.join('\n')}`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# <:lock_gvrpnl:1466937465674792990> SSN: \`${registroAtualizado.ssn}\` <:white_dot:1373337479721123870> ID: \`${registroAtualizado.id}\``
                    )
                );

            await interaction.editReply({
                components: [containerResposta],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha ao executar /editar_registro:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro interno ao tentar editar o registro.'
            }).catch(() => null);
        }
    }
};
