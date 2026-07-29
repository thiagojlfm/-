const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    customId: 'btn_reprovar_wl_',
    async execute(interaction, client, extractedId) {
        const wlId = extractedId;

        const modal = new ModalBuilder()
            .setCustomId(`modal_motivo_reprovar_wl_${wlId}`)
            .setTitle('Motivo da Reprovação (WL)');

        const inputMotivo = new TextInputBuilder()
            .setCustomId('input_motivo')
            .setLabel('Qual o motivo da reprovação?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(inputMotivo));

        await interaction.showModal(modal).catch(err => {
            console.error('[WL] Falha ao abrir modal de reprovação:', err);
        });
    }
};
