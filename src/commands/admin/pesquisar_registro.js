const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pesquisar_registro')
        .setDescription('Consulta o registro de um jogador no sistema.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Mencione o usuário do Discord.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('ssn')
                .setDescription('SSN do personagem.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('roblox')
                .setDescription('Username ou nickname do Roblox.')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const usuario = interaction.options.getUser('usuario');
        const ssnInput = interaction.options.getString('ssn')?.trim() || null;
        const robloxInput = interaction.options.getString('roblox')?.trim() || null;

        if (!usuario && !ssnInput && !robloxInput) {
            return interaction.editReply({
                content: 'Informe **usuario** (menção), **ssn** ou **roblox** (username/nickname).'
            }).catch(() => null);
        }

        const alvoLabel = usuario
            ? `${usuario.tag} (<@${usuario.id}>)`
            : ssnInput
                ? `SSN \`${ssnInput}\``
                : `Roblox \`${robloxInput}\``;

        try {
            const encontrado = RegistroService.consultarRegistro({
                discordId: usuario?.id || null,
                ssn: ssnInput,
                roblox: robloxInput
            });

            if (!encontrado) {
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
                            `Não foi encontrado nenhum registro para ${alvoLabel}.\n\n` +
                            'Tente menção do Discord, SSN ou username/nickname do Roblox.'
                        )
                    );

                return interaction.editReply({
                    components: [containerVazio],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            const { registro, isPendente, isArquivado } = encontrado;

            const membro = await interaction.guild.members.fetch(registro.discordId).catch(() => null);
            const nomeExibicao = membro
                ? membro.displayName
                : (usuario ? usuario.username : `ID ${registro.discordId}`);
            const dataRegistro = registro.createdAt
                ? new Date(registro.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                })
                : '—';

            let statusLabel;
            if (isPendente) {
                statusLabel = '<:tempo_gvrpnl:1466937443545780437> **Status:** `PENDENTE: aguardando avaliação da staff`';
            } else if (isArquivado && registro.motivoArquivo === 'DELETADO_STAFF') {
                const det = registro.motivoDetalhe ? ` · motivo: \`${registro.motivoDetalhe}\`` : '';
                statusLabel =
                    '<:NoGVRPNL:1223380966924484650> **Status:** `DELETADO` (arquivado — use `/devolver_registro`)' +
                    det;
            } else if (isArquivado) {
                statusLabel =
                    '<:tempo_gvrpnl:1466937443545780437> **Status:** `ARQUIVADO` (saiu do servidor — use `/devolver_registro` ou aguarde o retorno)';
            } else {
                statusLabel = '<:SimGVRPNL:1228154618048155701> **Status:** `APROVADO`';
            }

            const containerResultado = new ContainerBuilder()
                .setAccentColor(isPendente || isArquivado ? 0x6E4D5F : 0x3C166C)
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
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registro.discordId}> · \`${nomeExibicao}\`\n` +
                        `<:valdotsmall:1392947288879665244> **Roblox:** \`${registro.nickRoblox}\` (\`@${registro.userRoblox}\`)\n` +
                        statusLabel
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:rpc2:1500318320853782669> **Personagem:** \`${registro.nomePersonagem}\`\n` +
                        `<:info:1373983629746638938> **Idade:** \`${registro.idade} anos\` <:white_dot:1373337479721123870> **Origem:** \`${registro.localNascimento}\`` +
                        (registro.ssn ? `\n<:lock_gvrpnl:1466937465674792990> **SSN:** \`${registro.ssn}\`` : '')
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# <:tempo_gvrpnl:1466937443545780437> Enviado em ${dataRegistro} <:white_dot:1373337479721123870> ID: \`${registro.id}\``
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
