const WhitelistService = require('../../services/WhitelistService');

module.exports = {
    customId: 'modal_wl_juramento',
    async execute(interaction, client) {
        const sessao = WhitelistService.obterSessao(interaction.user.id);
        if (!sessao) {
            return interaction.reply({
                content: 'Sessão expirada. Clique em **Iniciar Whitelist** novamente.',
                ephemeral: true
            });
        }

        // Impede double-submit
        if (WhitelistService.buscarPendentePorDiscordId(interaction.user.id)) {
            return interaction.reply({
                content: 'Você já possui uma Whitelist pendente de análise.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        WhitelistService.mesclarRespostas(interaction.user.id, {
            assinatura: interaction.fields.getTextInputValue('input_assinatura').trim()
        });

        const sessaoAtual = WhitelistService.obterSessao(interaction.user.id);
        const solicitacao = await WhitelistService.criarSolicitacao(client, sessaoAtual);

        await WhitelistService.enviarPainelStaff(client, solicitacao);
        await WhitelistService.registrarLog(client, 'CRIADO', solicitacao);

        await interaction.editReply({
            content:
                '<:SimGVRPNL:1228154618048155701> **Whitelist enviada com sucesso!**\n\n' +
                'Aguarde a análise da staff. Você será notificado por DM quando houver decisão.\n' +
                '(Se suas DMs estiverem fechadas, a staff avisará por outro meio / fallback no bot.)'
        });
    }
};
