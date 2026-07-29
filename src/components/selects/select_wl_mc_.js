const WhitelistService = require('../../services/WhitelistService');

/** Evita double-click processando o mesmo select duas vezes em paralelo. */
const processando = new Set();

module.exports = {
    customId: 'select_wl_mc_',
    async execute(interaction, client, extractedId) {
        const perguntaId = extractedId;
        const userId = interaction.user.id;
        const lockKey = `${userId}:${perguntaId}`;

        // 1) Confirma a interaction imediatamente (evita Unknown interaction / 10062)
        try {
            await interaction.deferUpdate();
        } catch (err) {
            console.log(`[WL] deferUpdate falhou (${perguntaId}): ${err.message}`);
            return;
        }

        if (processando.has(lockKey)) {
            return;
        }
        processando.add(lockKey);

        try {
            const sessao = WhitelistService.obterSessao(userId);

            if (!sessao || (sessao.step !== 'mc' && sessao.step !== 'juramento')) {
                await interaction.editReply({
                    content:
                        'Sessão de Whitelist inválida ou expirada. Clique em **Iniciar Whitelist** novamente.',
                    components: []
                }).catch(() => null);
                return;
            }

            // Já terminou as MC (ex.: update anterior falhou depois de avançar)
            if (sessao.step === 'juramento') {
                const payload = WhitelistService.montarPayloadJuramento();
                await interaction.editReply(payload).catch(() => null);
                return;
            }

            const perguntas = WhitelistService.getPerguntasMc();
            let mcIndex = sessao.mcIndex ?? 0;
            let perguntaAtual = perguntas[mcIndex];

            // Menu antigo / dessincronizado: reexibe a pergunta atual em vez de erro seco
            if (!perguntaAtual || perguntaAtual.id !== perguntaId) {
                // Se a pergunta clicada já foi respondida e estamos à frente, só sincroniza a UI
                const idxClicada = perguntas.findIndex(p => p.id === perguntaId);
                if (idxClicada !== -1 && idxClicada < mcIndex) {
                    const payload =
                        mcIndex >= perguntas.length
                            ? WhitelistService.montarPayloadJuramento()
                            : (() => {
                                  const p = WhitelistService.montarPayloadMc(mcIndex);
                                  return {
                                      content:
                                          `<:tempo_gvrpnl:1466937443545780437> **Continuando de onde parou.**\n\n` +
                                          p.content,
                                      components: p.components
                                  };
                              })();
                    await interaction.editReply(payload).catch(() => null);
                    return;
                }

                if (mcIndex >= perguntas.length) {
                    WhitelistService.aplicarProgresso(userId, { step: 'juramento', mcIndex });
                    await interaction.editReply(WhitelistService.montarPayloadJuramento()).catch(() => null);
                    return;
                }

                const payload = WhitelistService.montarPayloadMc(mcIndex);
                await interaction
                    .editReply({
                        content:
                            `<:tempo_gvrpnl:1466937443545780437> **Essa mensagem estava desatualizada.**\n` +
                            `Respondendo a pergunta atual:\n\n${payload.content}`,
                        components: payload.components
                    })
                    .catch(() => null);
                return;
            }

            const value = interaction.values[0];
            const texto = WhitelistService.resolverTextoMc(perguntaId, value);
            const proximoIndex = mcIndex + 1;

            if (proximoIndex < perguntas.length) {
                WhitelistService.aplicarProgresso(userId, {
                    answers: { [`mc_${perguntaId}`]: texto },
                    mcIndex: proximoIndex,
                    step: 'mc'
                });

                const payload = WhitelistService.montarPayloadMc(proximoIndex);
                await interaction
                    .editReply({
                        content: `<:SimGVRPNL:1228154618048155701> Resposta registrada.\n\n${payload.content}`,
                        components: payload.components
                    })
                    .catch(err => {
                        console.error(`[WL] editReply MC falhou (${perguntaId}):`, err.message);
                    });
                return;
            }

            // Última MC → juramento
            WhitelistService.aplicarProgresso(userId, {
                answers: { [`mc_${perguntaId}`]: texto },
                mcIndex: proximoIndex,
                step: 'juramento'
            });

            await interaction.editReply(WhitelistService.montarPayloadJuramento()).catch(err => {
                console.error(`[WL] editReply juramento falhou:`, err.message);
            });
        } finally {
            processando.delete(lockKey);
        }
    }
};
