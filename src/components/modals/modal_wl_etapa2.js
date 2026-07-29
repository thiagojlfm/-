const WhitelistService = require('../../services/WhitelistService');

function lerCampo(interaction, customId) {
    try {
        return interaction.fields.getTextInputValue(customId).trim();
    } catch {
        return null;
    }
}

module.exports = {
    customId: 'modal_wl_etapa2',
    async execute(interaction) {
        const sessao = WhitelistService.obterSessao(interaction.user.id);
        if (!sessao) {
            return interaction.reply({
                content: 'Sessão expirada. Clique em **Iniciar Whitelist** novamente.',
                ephemeral: true
            });
        }

        const prioridade = lerCampo(interaction, 'input_prioridade');
        const registrarVeiculo = lerCampo(interaction, 'input_registrar_veiculo');
        const tiers = lerCampo(interaction, 'input_tiers');

        const faltando = [
            ['prioridade', prioridade],
            ['registrar veículo', registrarVeiculo],
            ['tiers', tiers]
        ].filter(([, v]) => !v);

        if (faltando.length > 0) {
            console.error(
                '[WL] modal_wl_etapa2 campos ausentes:',
                faltando.map(([n]) => n).join(', '),
                '| ids recebidos:',
                [...interaction.fields.fields.keys()].join(', ')
            );
            return interaction.reply({
                content:
                    'Não foi possível ler todos os campos do formulário.\n' +
                    'Clique em **Continuar: Etapa 2** de novo e preencha todos os campos.',
                ephemeral: true
            });
        }

        WhitelistService.aplicarProgresso(interaction.user.id, {
            answers: {
                prioridade,
                registrarVeiculo,
                tiers
            },
            step: 'mc',
            mcIndex: 0
        });

        const payload = WhitelistService.montarPayloadMc(0);
        await interaction.reply({
            content:
                '<:SimGVRPNL:1228154618048155701> **Etapa 2 salva.** Agora as situações (múltipla escolha).\n\n' +
                payload.content,
            components: payload.components,
            ephemeral: true
        });
    }
};
