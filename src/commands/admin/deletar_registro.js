const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletar_registro')
        .setDescription('Remove o registro ativo (CK/reset). Fica arquivado e pode ser devolvido com /devolver_registro.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption(option =>
            option
                .setName('motivo')
                .setDescription('O motivo da exclusão do registro (ex: CK, banimento, reset).')
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Mencione o usuário do Discord.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('ssn')
                .setDescription('SSN do personagem que deseja deletar.')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const usuario = interaction.options.getUser('usuario');
        const ssn = interaction.options.getString('ssn')?.trim() || null;
        const motivo = interaction.options.getString('motivo');

        if (!usuario && !ssn) {
            return interaction.editReply({
                content: 'Informe **usuario** (menção) ou **ssn**, além do **motivo**.'
            }).catch(() => null);
        }

        const alvoResolvido = usuario?.id || ssn;

        try {
            const registroDeletado = await RegistroService.deletarRegistro(alvoResolvido, {
                motivo,
                staffId: interaction.user.id
            });

            if (!registroDeletado) {
                return interaction.editReply({
                    content: 'Nenhum registro foi encontrado com as informações fornecidas (usuário ou SSN).'
                }).catch(() => null);
            }

            const membro = await interaction.guild.members.fetch(registroDeletado.discordId).catch(() => null);
            if (membro) {
                await membro.roles.remove(process.env.ROLE_APROVADO_ID).catch(err => console.log(`[AVISO] Não foi possível remover cargo de aprovado:`, err.message));
                await membro.roles.add(process.env.ROLE_REGISTRO_ID).catch(err => console.log(`[AVISO] Não foi possível adicionar cargo de registro:`, err.message));
                await membro.setNickname(null).catch(err => console.log(`[AVISO] Não foi possível resetar o apelido:`, err.message));

                const containerDM = new ContainerBuilder()
                    .setAccentColor(0xFF59A2)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# Registro Resetado\n\n' +
                            `Seu personagem **${registroDeletado.nomePersonagem}** foi removido do sistema ativo.\n` +
                            `**Motivo:** ${motivo}\n\n` +
                            'O cadastro ficou **arquivado**. Para criar outro personagem, a staff precisa **devolver** este registro ou liberar o slot. ' +
                            'Não é possível enviar um novo formulário enquanto este personagem estiver deletado.'
                        )
                    );

                await membro.send({
                    components: [containerDM],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => null);
            }

            const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
            if (canalLogs) {
                const logContainer = new ContainerBuilder()
                    .setAccentColor(0xFF0000)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                           '# [LOG] Registro Deletado / Resetado\n\n' +
                            `**Jogador:** <@${registroDeletado.discordId}>\n` +
                            `**Roblox:** \`${registroDeletado.nickRoblox}\` (\`@${registroDeletado.userRoblox}\`)\n` +
                            `**Personagem:** \`${registroDeletado.nomePersonagem}\`\n` +
                            `**SSN:** \`${registroDeletado.ssn}\`\n` +
                            `**Removido por:** <@${interaction.user.id}>\n` +
                            `**Motivo:** \`${motivo}\`\n\n` +
                            '*Registro com status DELETADO (não apagado de vez). Staff pode devolver com `/devolver_registro`.*'
                        )
                    );

                await canalLogs.send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            await RegistroService._enviarBackupJson(
                client,
                `delete/CK \`${registroDeletado.nomePersonagem}\``,
                registroDeletado
            ).catch(() => null);

            await interaction.editReply({
                content:
                    `O registro de **${registroDeletado.nomePersonagem}** foi removido e os cargos atualizados.\n` +
                    `Ele ficou **arquivado** (SSN \`${registroDeletado.ssn}\`, status DELETADO) e pode ser devolvido com \`/devolver_registro\`.\n` +
                    `O jogador **não** pode abrir formulário novo até a staff devolver este cadastro.`
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha ao executar comando /deletar_registro:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro interno ao tentar deletar este registro.'
            }).catch(() => null);
        }
    }
};
