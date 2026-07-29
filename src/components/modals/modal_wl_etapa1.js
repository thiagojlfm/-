const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const WhitelistService = require('../../services/WhitelistService');

module.exports = {
    customId: 'modal_wl_etapa1',
    async execute(interaction) {
        const sessao = WhitelistService.obterSessao(interaction.user.id);
        if (!sessao) {
            return interaction.reply({
                content: 'Sua sessão de Whitelist expirou ou não foi encontrada. Clique em **Iniciar Whitelist** novamente.',
                ephemeral: true
            });
        }

        WhitelistService.mesclarRespostas(interaction.user.id, {
            userRoblox: interaction.fields.getTextInputValue('input_user_roblox').trim(),
            failRp: interaction.fields.getTextInputValue('input_fail_rp').trim(),
            rulebreak: interaction.fields.getTextInputValue('input_rulebreak').trim(),
            void: interaction.fields.getTextInputValue('input_void').trim(),
            peaceTimes: interaction.fields.getTextInputValue('input_peace_times').trim()
        });
        WhitelistService.atualizarSessao(interaction.user.id, { step: 'etapa2' });

        await interaction.reply({
            content:
                '<:SimGVRPNL:1228154618048155701> **Etapa 1/3 salva.**\n\n' +
                'Clique abaixo para continuar.',
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_wl_etapa2')
                        .setLabel('Continuar: Etapa 2')
                        .setStyle(ButtonStyle.Primary)
                )
            ],
            ephemeral: true
        });
    }
};
