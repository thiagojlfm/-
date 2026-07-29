const WhitelistService = require('../../services/WhitelistService');
const { montarModalJuramento } = require('../../utils/wlModals');

module.exports = {
    customId: 'btn_wl_juramento',
    async execute(interaction) {
        const sessao = WhitelistService.obterSessao(interaction.user.id);
        if (!sessao || (sessao.step !== 'juramento' && sessao.step !== 'mc')) {
            return interaction.reply({
                content: 'Sessão inválida. Clique em **Iniciar Whitelist** novamente.',
                ephemeral: true
            });
        }

        await interaction.showModal(montarModalJuramento());
    }
};
