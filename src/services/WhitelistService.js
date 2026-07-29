const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const perguntasMc = require('../config/perguntas_wl');
const { PERGUNTAS_ABERTAS } = require('../utils/wlModals');
const { STAFF_WL_PANEL_CHANNEL_ID } = require('../config/channels');

const LOGO_URL =
    'https://media.discordapp.net/attachments/1194703945336111114/1442177700281188493/gv_nl_logo_geral.png?ex=6a5e4126&is=6a5cefa6&hm=1efb10f354fcddbe99ee260b27e4616d34a50b04fc24555159c0c17ff46db257&=&format=webp&quality=lossless';
const COR_WL_APROVADA = 0x75f5e9;

const dataDir = path.join(__dirname, '..', 'data');
const aprovadosPath = path.join(dataDir, 'whitelists.json');
const pendentesPath = path.join(dataDir, 'pendentes_wl.json');
const sessoesPath = path.join(dataDir, 'sessoes_wl.json');

const COOLDOWN_MS = 10 * 60 * 1000;
const SESSAO_TIMEOUT_MS = 45 * 60 * 1000;

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
for (const filePath of [aprovadosPath, pendentesPath, sessoesPath]) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 4), 'utf-8');
    }
}

const processingInteractions = new Set();
const cooldownsReprovacao = new Map();
const sessoes = new Map();
const solicitacoesPendentes = new Map();
/** Notificações que falharam por DM: entregues no próximo clique do jogador (ephemeral). */
const notificacoesPendentes = new Map();

try {
    const pendentesRaw = JSON.parse(fs.readFileSync(pendentesPath, 'utf-8'));
    for (const item of pendentesRaw) {
        solicitacoesPendentes.set(item.id, item);
    }
    if (pendentesRaw.length > 0) {
        console.log(`[WL] ${pendentesRaw.length} whitelist(s) pendente(s) recarregada(s).`);
    }
} catch {
    console.log('[WL] Nenhum pendente de whitelist anterior.');
}

try {
    const sessoesRaw = JSON.parse(fs.readFileSync(sessoesPath, 'utf-8'));
    const agora = Date.now();
    for (const s of sessoesRaw) {
        if (agora - (s.startedAt || 0) < SESSAO_TIMEOUT_MS) {
            sessoes.set(s.discordId, s);
        }
    }
    if (sessoes.size > 0) {
        console.log(`[WL] ${sessoes.size} sessão(ões) de whitelist recarregada(s).`);
    }
} catch {
    // ignore
}

/** Ordem das respostas abertas no painel da staff (pergunta completa). */
const ORDEM_RESPOSTAS_ABERTAS = [
    'userRoblox',
    'failRp',
    'rulebreak',
    'void',
    'peaceTimes',
    'prioridade',
    'registrarVeiculo',
    'tiers',
    'assinatura'
];

class WhitelistService {
    static getPerguntasMc() {
        return perguntasMc;
    }

    /** Texto completo da pergunta aberta (para a staff). */
    static getLabelAberta(chave) {
        return PERGUNTAS_ABERTAS[chave] || chave;
    }

    // --- Persistência ---

    static _salvarPendentes() {
        try {
            const lista = Array.from(solicitacoesPendentes.values());
            fs.writeFileSync(pendentesPath, JSON.stringify(lista, null, 4), 'utf-8');
        } catch (error) {
            console.error('[WL] Falha ao salvar pendentes_wl.json:', error);
        }
    }

    static _salvarSessoes() {
        try {
            const lista = Array.from(sessoes.values());
            fs.writeFileSync(sessoesPath, JSON.stringify(lista, null, 4), 'utf-8');
        } catch (error) {
            console.error('[WL] Falha ao salvar sessoes_wl.json:', error);
        }
    }

    static _lerAprovados() {
        try {
            return JSON.parse(fs.readFileSync(aprovadosPath, 'utf-8'));
        } catch {
            return [];
        }
    }

    static _salvarAprovado(registro) {
        try {
            const lista = this._lerAprovados();
            lista.push(registro);
            fs.writeFileSync(aprovadosPath, JSON.stringify(lista, null, 4), 'utf-8');
        } catch (error) {
            console.error('[WL] Falha ao salvar whitelists.json:', error);
        }
    }

    // --- Locks / cooldown ---

    static isProcessing(id) {
        return processingInteractions.has(id.toString());
    }

    static lockInteraction(id) {
        processingInteractions.add(id.toString());
    }

    static unlockInteraction(id) {
        processingInteractions.delete(id.toString());
    }

    static obterTempoRestanteCooldown(discordId) {
        const ts = cooldownsReprovacao.get(discordId);
        if (!ts) return 0;
        const restante = COOLDOWN_MS - (Date.now() - ts);
        if (restante <= 0) {
            cooldownsReprovacao.delete(discordId);
            return 0;
        }
        return restante;
    }

    // --- Elegibilidade ---

    static estaAprovado(discordId) {
        return this._lerAprovados().some(r => r.discordId === discordId && r.status === 'APROVADO');
    }

    static buscarPendentePorDiscordId(discordId) {
        for (const item of solicitacoesPendentes.values()) {
            if (item.discordId === discordId && item.status === 'PENDENTE') return item;
        }
        return null;
    }

    static async verificarElegibilidade(discordId) {
        if (this.buscarPendentePorDiscordId(discordId)) return { ok: false, motivo: 'pendente' };
        if (this.estaAprovado(discordId)) return { ok: false, motivo: 'aprovado' };

        const sessao = sessoes.get(discordId);
        if (sessao && Date.now() - sessao.startedAt < SESSAO_TIMEOUT_MS) {
            return { ok: true, sessaoExistente: sessao };
        }
        if (sessao) {
            sessoes.delete(discordId);
            this._salvarSessoes();
        }

        return { ok: true };
    }

    // --- Sessão do wizard ---

    static obterSessao(discordId) {
        const sessao = sessoes.get(discordId);
        if (!sessao) return null;
        if (Date.now() - sessao.startedAt >= SESSAO_TIMEOUT_MS) {
            sessoes.delete(discordId);
            this._salvarSessoes();
            return null;
        }
        return sessao;
    }

    static iniciarSessao(discordId, discordTag) {
        const sessao = {
            discordId,
            discordTag,
            answers: {},
            step: 'etapa1',
            mcIndex: 0,
            startedAt: Date.now()
        };
        sessoes.set(discordId, sessao);
        this._salvarSessoes();
        return sessao;
    }

    static atualizarSessao(discordId, patch) {
        const sessao = this.obterSessao(discordId);
        if (!sessao) return null;
        const { answers, ...rest } = patch;
        Object.assign(sessao, rest);
        if (answers) {
            sessao.answers = { ...sessao.answers, ...answers };
        }
        sessoes.set(discordId, sessao);
        this._salvarSessoes();
        return sessao;
    }

    static mesclarRespostas(discordId, respostas) {
        const sessao = this.obterSessao(discordId);
        if (!sessao) return null;
        sessao.answers = { ...sessao.answers, ...respostas };
        sessoes.set(discordId, sessao);
        this._salvarSessoes();
        return sessao;
    }

    /**
     * Atualiza respostas + step/mcIndex numa única gravação em disco
     * (evita 2 writes síncronos no meio do interaction callback).
     */
    static aplicarProgresso(discordId, { answers, step, mcIndex } = {}) {
        const sessao = this.obterSessao(discordId);
        if (!sessao) return null;
        if (answers) sessao.answers = { ...sessao.answers, ...answers };
        if (step !== undefined) sessao.step = step;
        if (mcIndex !== undefined) sessao.mcIndex = mcIndex;
        sessoes.set(discordId, sessao);
        this._salvarSessoes();
        return sessao;
    }

    static montarPayloadJuramento() {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        return {
            content:
                '<:SimGVRPNL:1228154618048155701> **Situações concluídas.**\n\n' +
                'Por fim, confirme o juramento e assine com seu username do Discord.\n\n' +
                '> Ao assinar, você declara que preencheu o formulário com honestidade, ' +
                'seguiu os requisitos, revisou as respostas e que, se aprovado, seguirá as regras ' +
                '(caso contrário, poderá ser punido).',
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_wl_juramento')
                        .setLabel('Assinar e enviar Whitelist')
                        .setStyle(ButtonStyle.Success)
                )
            ]
        };
    }

    static limparSessao(discordId) {
        sessoes.delete(discordId);
        this._salvarSessoes();
    }

    static resolverTextoMc(perguntaId, value) {
        const pergunta = perguntasMc.find(p => p.id === perguntaId);
        if (!pergunta) return value;
        const opcao = pergunta.opcoes.find(o => o.value === value);
        return opcao ? opcao.textoCompleto : value;
    }

    // --- Submissão / staff ---

    static async criarSolicitacao(client, sessao) {
        const id = Date.now().toString();
        const novo = {
            id,
            discordId: sessao.discordId,
            discordTag: sessao.discordTag,
            answers: { ...sessao.answers },
            status: 'PENDENTE',
            motivoReprovacao: null,
            staffResponsavel: null,
            createdAt: new Date().toISOString()
        };

        solicitacoesPendentes.set(id, novo);
        this._salvarPendentes();
        this.limparSessao(sessao.discordId);

        return novo;
    }

    static async buscarSolicitacao(id) {
        return solicitacoesPendentes.get(id.toString()) || null;
    }

    static async atualizarStatus(client, id, status, staffId, motivo = null) {
        const item = solicitacoesPendentes.get(id.toString());
        if (!item) return null;

        item.status = status;
        item.staffResponsavel = staffId;
        item.updatedAt = new Date().toISOString();

        if (status === 'APROVADO') {
            this._salvarAprovado({ ...item });
        } else if (status === 'REPROVADO') {
            item.motivoReprovacao = motivo;
            cooldownsReprovacao.set(item.discordId, Date.now());
        }

        solicitacoesPendentes.delete(id.toString());
        this._salvarPendentes();
        return item;
    }

    static async deletarPorDiscordId(discordId) {
        let removido = null;

        // Aprovados
        try {
            const lista = this._lerAprovados();
            const index = lista.findIndex(r => r.discordId === discordId);
            if (index !== -1) {
                [removido] = lista.splice(index, 1);
                fs.writeFileSync(aprovadosPath, JSON.stringify(lista, null, 4), 'utf-8');
            }
        } catch (error) {
            console.error('[WL] Falha ao deletar whitelist aprovada:', error);
        }

        // Pendentes
        for (const [id, item] of solicitacoesPendentes.entries()) {
            if (item.discordId === discordId) {
                solicitacoesPendentes.delete(id);
                if (!removido) removido = item;
            }
        }
        this._salvarPendentes();

        // Sessão em andamento
        this.limparSessao(discordId);
        cooldownsReprovacao.delete(discordId);

        return removido;
    }

    // --- UI helpers ---

    static montarSelectMc(pergunta, discordId) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`select_wl_mc_${pergunta.id}`)
            .setPlaceholder('Selecione uma opção...')
            .addOptions(
                pergunta.opcoes.map(op =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(op.label.slice(0, 100))
                        .setValue(op.value)
                        .setDescription(
                            op.textoCompleto.length > 100
                                ? `${op.textoCompleto.slice(0, 97)}...`
                                : op.textoCompleto
                        )
                )
            );

        return new ActionRowBuilder().addComponents(menu);
    }

    static montarPayloadMc(mcIndex) {
        const pergunta = perguntasMc[mcIndex];
        if (!pergunta) return null;

        return {
            content:
                `<:tempo_gvrpnl:1466937443545780437> **Whitelist: Situações (${mcIndex + 1}/${perguntasMc.length})**\n\n` +
                `**${pergunta.pergunta}**`,
            components: [this.montarSelectMc(pergunta)],
            ephemeral: true
        };
    }

    static truncar(texto, max = 900) {
        if (!texto) return '-';
        const s = String(texto);
        return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    /** Quebra textos longos em pedaços ≤ max para TextDisplay (limite ~4000). */
    static _chunkTexto(texto, max = 3500) {
        if (!texto || texto.length <= max) return [texto || '-'];
        const chunks = [];
        let rest = texto;
        while (rest.length > 0) {
            chunks.push(rest.slice(0, max));
            rest = rest.slice(max);
        }
        return chunks;
    }

    static montarPainelStaff(solicitacao) {
        const a = solicitacao.answers || {};

        // 1 item por bloco: pergunta completa + resposta (staff não precisa decorar)
        const itensAbertos = ORDEM_RESPOSTAS_ABERTAS.map((chave, index) => {
            if (a[chave] === undefined || a[chave] === null) return null;
            const n = index + 1;
            return (
                `**Pergunta ${n}**\n` +
                `${this.getLabelAberta(chave)}\n` +
                `> ${this.truncar(a[chave], 800)}`
            );
        }).filter(Boolean);

        // 1 pergunta por TextDisplay para não cortar o enunciado
        const gruposAbertos = itensAbertos;

        const textoMc = perguntasMc
            .map((p, index) => {
                const resp = a[`mc_${p.id}`];
                if (!resp) return null;
                return (
                    `**Situação ${index + 1}**\n` +
                    `${p.pergunta}\n` +
                    `> ${this.truncar(resp, 400)}`
                );
            })
            .filter(Boolean)
            .join('\n\n');

        const container = new ContainerBuilder()
            .setAccentColor(0x6E4D5F)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '<:tempo_gvrpnl:1466937443545780437> **Nova solicitação de Whitelist**\n' +
                        '-# <:GVNL:1391202082920595556> WL · GVRPNL · Aguardando avaliação'
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${solicitacao.discordId}> (\`${solicitacao.discordTag || '-'}\`)\n` +
                        `<:valdotsmall:1392947288879665244> **Roblox:** \`${a.userRoblox || '-'}\`\n` +
                        `-# ID: \`${solicitacao.id}\``
                )
            );

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### Respostas abertas')
        );

        if (gruposAbertos.length === 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent('_Sem respostas._')
            );
        } else {
            for (const grupo of gruposAbertos) {
                for (const chunk of this._chunkTexto(grupo, 3500)) {
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(chunk)
                    );
                }
            }
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        const mcChunks = this._chunkTexto(
            `### Múltipla escolha\n\n${textoMc || '_Sem respostas._'}`,
            3500
        );
        for (const chunk of mcChunks) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
        }

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_aprovar_wl_${solicitacao.id}`)
                    .setLabel('Aprovar WL')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`btn_reprovar_wl_${solicitacao.id}`)
                    .setLabel('Reprovar WL')
                    .setStyle(ButtonStyle.Danger)
            )
        );

        return container;
    }

    static async enviarPainelStaff(client, solicitacao) {
        const canal = client.channels.cache.get(STAFF_WL_PANEL_CHANNEL_ID);
        if (!canal) {
            console.error(
                `[WL] Canal de avaliação de whitelist não encontrado: ${STAFF_WL_PANEL_CHANNEL_ID}`
            );
            return;
        }

        await canal.send({
            components: [this.montarPainelStaff(solicitacao)],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    static async registrarLog(client, tipo, dados) {
        const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
        if (!canalLogs) return;

        let accent = 0x3120F2;
        let titulo = 'Nova Whitelist Solicitada';

        if (tipo === 'APROVADO') {
            accent = 0x05eb18;
            titulo = 'Whitelist Aprovada';
        } else if (tipo === 'REPROVADO') {
            accent = 0x990000;
            titulo = 'Whitelist Reprovada';
        }

        let corpo =
            `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
            `<:valdotsmall:1392947288879665244> **Roblox:** \`${dados.answers?.userRoblox || '-'}\``;

        if (tipo === 'APROVADO') {
            corpo += `\n<:MembrosGVRPNL:1223380937698443324> **Aprovado por:** <@${dados.staffResponsavel}>`;
        } else if (tipo === 'REPROVADO') {
            corpo +=
                `\n<:MembrosGVRPNL:1223380937698443324> **Reprovado por:** <@${dados.staffResponsavel}>\n` +
                `<:info:1373983629746638938> **Motivo:** ${dados.motivoReprovacao || '-'}`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(accent)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${titulo}**\n-# <:GVNL:1391202082920595556> LOG · WL · GVRPNL`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(corpo))
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# ID: \`${dados.id}\``)
            );

        await canalLogs
            .send({
                components: [container],
                flags: [MessageFlags.IsComponentsV2]
            })
            .catch(() => null);
    }

    /**
     * Mensagem de WL aprovada + como completar o registro de personagem.
     * @param {import('discord.js').User | { id: string }} user
     */
    static montarNotificacaoAprovacao(user) {
        const canalRegistro =
            process.env.REGISTRO_CHANNEL_ID && process.env.REGISTRO_CHANNEL_ID !== ''
                ? `<#${process.env.REGISTRO_CHANNEL_ID}>`
                : '#registro-cidadao';

        return new ContainerBuilder()
            .setAccentColor(COR_WL_APROVADA)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# <:wumpus_wow:1467288238271102986> WHITELIST APROVADA!'
                        ),
                        new TextDisplayBuilder().setContent(
                            `> <:valdotsmall:1392947288879665244> Olá, <@${user.id}>!\n` +
                                '> <:valdotsmall:1392947288879665244> Parabéns! Sua **Whitelist** no **GVRPNL** foi **aprovada** com sucesso.'
                        )
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(LOGO_URL))
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '### <:rpc2:1500318320853782669> Como se registrar totalmente\n' +
                        '> <:valdotsmall:1392947288879665244> **1.** Você já recebeu acesso ao canal de **registro de personagem**.\n' +
                        `> <:valdotsmall:1392947288879665244> **2.** Acesse ${canalRegistro}.\n` +
                        '> <:valdotsmall:1392947288879665244> **3.** Clique em **Registrar Personagem** e preencha o formulário (nome, idade, local de nascimento, etc.).\n' +
                        '> <:valdotsmall:1392947288879665244> **4.** Envie e **aguarde a análise da staff**. Não é automático.\n' +
                        '> <:valdotsmall:1392947288879665244> **5.** Se o registro for **aprovado**, seu personagem será liberado e você poderá começar sua história no servidor.\n' +
                        '> <:valdotsmall:1392947288879665244> **6.** Se for **reprovado**, corrija o que for pedido e envie de novo.'
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '### <:wumpus_asdawdsa:1467288278800662588> Orientações do registro\n' +
                        '> <:valdotsmall:1392947288879665244> Evite nomes de pessoas reais ou celebridades.\n' +
                        '> <:valdotsmall:1392947288879665244> A idade do personagem deve ser **igual ou superior a 18 anos**.\n' +
                        '> <:valdotsmall:1392947288879665244> Nomes inapropriados podem resultar em reprovação ou punições.'
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '### <:suporteGVRPNL:1239389974923710504> Precisa de ajuda?\n' +
                        'Ficou com dúvida sobre o registro? Contate a staff. Teremos prazer em ajudar.'
                )
            );
    }

    /** Texto curto para fallback (DM fechada / próximo clique do jogador). */
    static textoFallbackAprovacao() {
        const canalRegistro =
            process.env.REGISTRO_CHANNEL_ID && process.env.REGISTRO_CHANNEL_ID !== ''
                ? `<#${process.env.REGISTRO_CHANNEL_ID}>`
                : '#registro-cidadao';

        return (
            '<:SimGVRPNL:1228154618048155701> **Você passou na Whitelist!**\n' +
            'Não foi possível enviar a DM completa (DMs fechadas).\n\n' +
            `**Próximo passo:** vá em ${canalRegistro}, clique em **Registrar Personagem**, preencha o formulário e aguarde a staff. ` +
            'Só depois do registro aprovado você estará totalmente liberado no servidor.'
        );
    }

    static async notificarDm(membro, container) {
        try {
            await membro.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
            return true;
        } catch (err) {
            console.log(`[WL DM] Falha ao enviar DM para ${membro.user?.tag}: ${err.message}`);
            return false;
        }
    }

    /**
     * Quando a DM falha, guarda um aviso para o próximo clique do jogador (ephemeral).
     */
    static enfileirarFallback(discordId, texto) {
        notificacoesPendentes.set(discordId, { texto, em: Date.now() });
    }

    /**
     * Consome e retorna o texto do fallback, se houver (e ainda for recente: 7 dias).
     */
    static consumirFallback(discordId) {
        const item = notificacoesPendentes.get(discordId);
        if (!item) return null;
        notificacoesPendentes.delete(discordId);
        if (Date.now() - item.em > 7 * 24 * 60 * 60 * 1000) return null;
        return item.texto;
    }
}

module.exports = WhitelistService;
