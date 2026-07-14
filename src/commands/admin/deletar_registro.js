const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletar_registro')
        .setDescription('Deleta o registro ativo de um jogador do banco de dados (CK ou reset).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption(option =>
            option
                .setName('alvo')
                .setDescription('Mencione o usuário ou digite o SSN do personagem que deseja deletar.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('motivo')
                .setDescription('O motivo da exclusão do registro (ex: CK, banimento, reset).')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const alvoInput = interaction.options.getString('alvo');
        const motivo = interaction.options.getString('motivo');

        if (!alvoInput) {
            return interaction.editReply({
                content: 'Por favor, forneça um alvo válido (ID, menção ou SSN).'
            }).catch(() => null);
        }

        // Extrai o ID apenas se o input for uma menção (<@123> ou <@!123>).
        // Caso contrário (ID puro ou SSN no formato 123-45-6789), mantém o valor original,
        // já que RegistroService.deletarRegistro busca por discordId OU ssn.
        const mencaoMatch = alvoInput.match(/^<@!?(\d+)>$/);
        const alvoResolvido = mencaoMatch ? mencaoMatch[1] : alvoInput.trim();

        try {
            const registroDeletado = await RegistroService.deletarRegistro(alvoResolvido);

            if (!registroDeletado) {
                return interaction.editReply({
                    content: 'Nenhum registro ativo foi encontrado com as informações fornecidas (ID ou SSN).'
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
                            'Se desejar criar um novo personagem, você já pode enviar um novo formulário no canal de registro.'
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
                            `**Motivo:** \`${motivo}\``
                        )
                    );

                await canalLogs.send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            await interaction.editReply({
                content: `O registro de **${registroDeletado.nomePersonagem}** foi deletado do sistema com sucesso e os cargos foram atualizados.`
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha ao executar comando /deletar_registro:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro interno ao tentar deletar este registro.'
            }).catch(() => null);
        }
    }
};