const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    customId: 'btn_reprovar_',
    async execute(interaction, client, extractedId) {
        const registroId = extractedId;

        const modal = new ModalBuilder()
            .setCustomId(`modal_motivo_reprovar_${registroId}`)
            .setTitle('Motivo da Reprovação');

        const inputMotivo = new TextInputBuilder()
            .setCustomId('input_motivo')
            .setLabel('Qual o motivo da reprovação?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(inputMotivo);
        modal.addComponents(row);

        await interaction.showModal(modal).catch(err => {
            console.error(`[ERRO] Falha ao abrir modal de reprovação:`, err);
        });
    }
};