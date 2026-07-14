const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pesquisar_registro')
        .setDescription('Consulta o registro ativo de um jogador no sistema.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption(option =>
            option
                .setName('alvo')
                .setDescription('Mencione o usuário ou digite o SSN do personagem.')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const alvoInput = interaction.options.getString('alvo');
        const mencaoMatch = alvoInput.match(/^<@!?(\d+)>$/);
        const alvoResolvido = mencaoMatch ? mencaoMatch[1] : alvoInput.trim();

        try {
            const registro = RegistroService._lerAprovados().find(
                r => r.discordId === alvoResolvido || r.ssn === alvoResolvido
            );

            if (!registro) {
                const containerVazio = new ContainerBuilder()
                    .setAccentColor(0x6E4D5F)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '<:NoGVRPNL:1223380966924484650> **Nenhum registro encontrado**\n' +
                            '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> WL · GVRPNL'
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `Não foi encontrado nenhum registro ativo para \`${alvoInput}\`.\n\n` +
                            'O jogador pode ainda não ter sido aprovado, ou o SSN informado não existe no sistema.'
                        )
                    );

                return interaction.editReply({
                    components: [containerVazio],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            const membro = await interaction.guild.members.fetch(registro.discordId).catch(() => null);
            const nomeExibicao = membro ? membro.displayName : `ID ${registro.discordId}`;
            const dataRegistro = new Date(registro.createdAt).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            const containerResultado = new ContainerBuilder()
                .setAccentColor(0x3C166C)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:lock_gvrpnl:1466937465674792990> **Consulta de Registro**\n' +
                        '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registro.discordId}> — \`${nomeExibicao}\`\n` +
                        `<:valdotsmall:1392947288879665244> **Roblox:** \`${registro.nickRoblox}\` (\`@${registro.userRoblox}\`)`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:rpc2:> **Personagem:** \`${registro.nomePersonagem}\`\n` +
                        `<:info:1373983629746638938> **Idade:** \`${registro.idade} anos\` <:white_dot:1373337479721123870> **Origem:** \`${registro.localNascimento}\`\n` +
                        `<:lock_gvrpnl:1466937465674792990> **SSN:** \`${registro.ssn}\``
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# <:tempo_gvrpnl:1466937443545780437> Registrado em ${dataRegistro} <:white_dot:1373337479721123870> ID: \`${registro.id}\``
                    )
                );

            await interaction.editReply({
                components: [containerResultado],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha ao executar /pesquisar_registro:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro interno ao consultar o registro.'
            }).catch(() => null);
        }
    }
};
