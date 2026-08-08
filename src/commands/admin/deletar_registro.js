const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletar_registro')
        .setDescription('Apaga o registro ativo pra sempre (CK/reset) e libera o usuário pra registrar de novo.')
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
            const registroPreDelete = RegistroService.consultarRegistro(
                usuario ? { discordId: usuario.id } : { ssn }
            )?.registro;

            // Manda o backup ANTES de apagar de vez, pra manter histórico recuperável manualmente.
            if (registroPreDelete) {
                await RegistroService._enviarBackupJson(
                    client,
                    `delete/CK \`${registroPreDelete.nomePersonagem}\` (motivo: ${motivo})`,
                    registroPreDelete
                ).catch(() => null);
            }

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
                            `Seu personagem **${registroDeletado.nomePersonagem}** foi removido do sistema.\n` +
                            `**Motivo:** ${motivo}\n\n` +
                            'Você já pode enviar um novo formulário de registro quando quiser.'
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
                            '*Apagado de vez do sistema — slot liberado. Backup enviado acima; pra restaurar, use `/criar_registro` com os dados do backup.*'
                        )
                    );

                await canalLogs.send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            await interaction.editReply({
                content:
                    `O registro de **${registroDeletado.nomePersonagem}** foi apagado de vez e os cargos atualizados.\n` +
                    `Backup salvo no canal de logs (SSN \`${registroDeletado.ssn}\`). O jogador já pode fazer um novo registro.`
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha ao executar comando /deletar_registro:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro interno ao tentar deletar este registro.'
            }).catch(() => null);
        }
    }
};
