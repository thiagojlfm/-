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
        .setName('devolver_registro')
        .setDescription('Devolve cadastro arquivado: saída do servidor ou delete/CK da staff.')
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
                .setDescription('SSN do personagem arquivado/deletado.')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const usuario = interaction.options.getUser('usuario');
        const ssn = interaction.options.getString('ssn')?.trim() || null;

        if (!usuario && !ssn) {
            return interaction.editReply({
                content: 'Informe **usuario** (menção) ou **ssn**.'
            }).catch(() => null);
        }

        const alvoResolvido = usuario?.id || ssn;

        try {
            const arquivado = RegistroService.buscarArquivado(alvoResolvido);
            if (!arquivado) {
                const jaAtivo = RegistroService.buscarAtivo(alvoResolvido);
                if (jaAtivo) {
                    return interaction.editReply({
                        content:
                            `O personagem **${jaAtivo.nomePersonagem}** (SSN \`${jaAtivo.ssn}\`) já está ativo no sistema. Não há nada para devolver.`
                    }).catch(() => null);
                }

                return interaction.editReply({
                    content:
                        'Nenhum registro arquivado/deletado foi encontrado com esse usuário/SSN.\n' +
                        'Cadastros apagados **antes** deste sistema de arquivo só voltam via backup + `/criar_registro`.'
                }).catch(() => null);
            }

            const registro = await RegistroService.restaurarRegistro(
                arquivado.ssn || arquivado.discordId || alvoResolvido
            );
            if (!registro) {
                return interaction.editReply({
                    content: 'Não foi possível restaurar o registro (já existe um ativo ou o arquivo mudou).'
                }).catch(() => null);
            }

            const membro = await interaction.guild.members.fetch(registro.discordId).catch(() => null);
            if (membro) {
                await RegistroService.aplicarRegistroAoMembro(membro, registro);

                const containerDM = new ContainerBuilder()
                    .setAccentColor(0x05eb18)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# Registro Restaurado\n\n' +
                                `Seu personagem **${registro.nomePersonagem}** foi devolvido pela staff.\n` +
                                `**SSN:** \`${registro.ssn}\``
                        )
                    );

                await membro
                    .send({
                        components: [containerDM],
                        flags: MessageFlags.IsComponentsV2
                    })
                    .catch(() => null);
            }

            const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
            if (canalLogs) {
                const logContainer = new ContainerBuilder()
                    .setAccentColor(0x05eb18)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# [LOG] Registro Devolvido pela Staff\n\n' +
                                `**Jogador:** <@${registro.discordId}>\n` +
                                `**Roblox:** \`${registro.nickRoblox}\` (\`@${registro.userRoblox}\`)\n` +
                                `**Personagem:** \`${registro.nomePersonagem}\`\n` +
                                `**SSN:** \`${registro.ssn}\`\n` +
                                `**Restaurado por:** <@${interaction.user.id}>` +
                                (membro ? '' : '\n**Obs.:** jogador fora do servidor (só JSON restaurado)')
                        )
                    );

                await canalLogs
                    .send({
                        components: [logContainer],
                        flags: [MessageFlags.IsComponentsV2]
                    })
                    .catch(() => null);
            }

            await RegistroService._enviarBackupJson(client, `restauração de \`${registro.nomePersonagem}\``, registro).catch(
                () => null
            );

            const containerOk = new ContainerBuilder()
                .setAccentColor(0x05eb18)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:SimGVRPNL:1228154618048155701> **Registro devolvido**\n' +
                            '-# <:GVNL:1391202082920595556> WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:rpc2:1500318320853782669> **Personagem:** \`${registro.nomePersonagem}\`\n` +
                            `<:lock_gvrpnl:1466937465674792990> **SSN:** \`${registro.ssn}\`\n` +
                            `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registro.discordId}>` +
                            (membro
                                ? ''
                                : '\n\nO jogador **não está no servidor**. Cadastro restaurado no sistema; cargos/nick quando ele entrar ou rode o comando de novo com ele online.')
                    )
                );

            await interaction.editReply({
                components: [containerOk],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
        } catch (error) {
            console.error('[ERRO] Falha ao executar /devolver_registro:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro interno ao devolver este registro.'
            }).catch(() => null);
        }
    }
};
