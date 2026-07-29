const WhitelistService = require('../../services/WhitelistService');
const { montarModalEtapa1 } = require('../../utils/wlModals');

module.exports = {
    customId: 'btn_iniciar_wl',
    async execute(interaction) {
        // Fallback se a DM de resultado anterior falhou
        const fallback = WhitelistService.consumirFallback(interaction.user.id);
        if (fallback) {
            return interaction.reply({ content: fallback, ephemeral: true });
        }

        const tempoRestante = WhitelistService.obterTempoRestanteCooldown(interaction.user.id);
        if (tempoRestante > 0) {
            const minutos = Math.ceil(tempoRestante / 60000);
            return interaction.reply({
                content: `Você foi reprovado recentemente na Whitelist. Aguarde mais **${minutos} minuto(s)** antes de tentar novamente.`,
                ephemeral: true
            });
        }

        const elegibilidade = await WhitelistService.verificarElegibilidade(interaction.user.id);

        if (!elegibilidade.ok) {
            if (elegibilidade.motivo === 'pendente') {
                return interaction.reply({
                    content: 'Você já possui uma Whitelist **pendente** de análise pela staff.',
                    ephemeral: true
                });
            }
            if (elegibilidade.motivo === 'aprovado') {
                return interaction.reply({
                    content:
                        'Você já possui Whitelist **aprovada**. Siga para o canal de registro de personagem.',
                    ephemeral: true
                });
            }
        }

        // Reinicia sessão (mesmo se havia uma incompleta)
        WhitelistService.iniciarSessao(
            interaction.user.id,
            interaction.user.tag || interaction.user.username
        );

        const modal = montarModalEtapa1();
        await interaction.showModal(modal);
    }
};
