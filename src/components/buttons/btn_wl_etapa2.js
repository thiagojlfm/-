const WhitelistService = require('../../services/WhitelistService');
const { montarModalEtapa2 } = require('../../utils/wlModals');

module.exports = {
    customId: 'btn_wl_etapa2',
    async execute(interaction) {
        const sessao = WhitelistService.obterSessao(interaction.user.id);
        if (!sessao) {
            return interaction.reply({
                content: 'Sessão expirada. Clique em **Iniciar Whitelist** novamente.',
                ephemeral: true
            });
        }

        await interaction.showModal(montarModalEtapa2());
    }
};
