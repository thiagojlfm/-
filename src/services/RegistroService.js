const fs = require('fs');
const path = require('path');
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

const dataPath = path.join(__dirname, '..', 'data', 'registros.json');

if (!fs.existsSync(path.dirname(dataPath))) {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
}
if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([], null, 4));
}

const processingInteractions = new Set();
const solicitacoesPendentes = new Map();
const cooldownsReprovacao = new Map(); // Guarda o timestamp da reprovação por usuário

class RegistroService {

// Remove um registro aprovado do JSON pelo Discord ID ou SSN
    static async deletarRegistro(discordIdOrSsn) {
        try {
            const registros = this._lerAprovados();
            const index = registros.findIndex(r => r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn);

            if (index === -1) return null;

            // Remove o registro do array e salva o arquivo novamente
            const [registroRemovido] = registros.splice(index, 1);
            fs.writeFileSync(dataPath, JSON.stringify(registros, null, 4), 'utf-8');

            return registroRemovido;
        } catch (error) {
            console.error('[ERRO] Falha ao deletar registro do JSON:', error);
            throw error;
        }
    }

    static _lerAprovados() {
        try {
            const rawData = fs.readFileSync(dataPath, 'utf-8');
            return JSON.parse(rawData);
        } catch (error) {
            console.error('[ERRO] Falha ao ler registros.json:', error);
            return [];
        }
    }

    static _salvarAprovado(registro) {
        try {
            const registros = this._lerAprovados();
            registros.push(registro);
            fs.writeFileSync(dataPath, JSON.stringify(registros, null, 4), 'utf-8');
        } catch (error) {
            console.error('[ERRO] Falha ao salvar registros.json:', error);
        }
    }

    static gerarSSN() {
        const parte1 = Math.floor(Math.random() * 900) + 100;
        const parte2 = Math.floor(Math.random() * 90) + 10;
        const parte3 = Math.floor(Math.random() * 9000) + 1000;
        return `${parte1}-${parte2}-${parte3}`;
    }

    static buscarPendentePorDiscordId(discordId) {
        for (const reg of solicitacoesPendentes.values()) {
            if (reg.discordId === discordId) return reg;
        }
        return null;
    }

    static isProcessing(registroId) {
        return processingInteractions.has(registroId.toString());
    }

    static lockInteraction(registroId) {
        processingInteractions.add(registroId.toString());
    }

    static unlockInteraction(registroId) {
        processingInteractions.delete(registroId.toString());
    }

    // Retorna o tempo restante de cooldown em milissegundos, ou 0 se estiver liberado
    static obterTempoRestanteCooldown(discordId) {
        const timestampReprovacao = cooldownsReprovacao.get(discordId);
        if (!timestampReprovacao) return 0;

        const cincoMinutos = 5 * 60 * 1000;
        const tempoPassado = Date.now() - timestampReprovacao;
        const tempoRestante = cincoMinutos - tempoPassado;

        if (tempoRestante <= 0) {
            cooldownsReprovacao.delete(discordId); // Limpa da memória se já passou do tempo
            return 0;
        }

        return tempoRestante;
    }

    static async verificarElegibilidade(client, discordId) {
        // 1. Verifica se há formulário pendente na memória
        for (const [id, reg] of solicitacoesPendentes.entries()) {
            if (reg.discordId === discordId) return false;
        }

        // 2. Verifica se já está aprovado no JSON
        const aprovados = this._lerAprovados();
        const jaAprovado = aprovados.some(r => r.discordId === discordId);
        
        return !jaAprovado;
    }

    static async criarRegistro(client, dados) {
        const registroId = Date.now().toString(); 

        const novoRegistro = {
            id: registroId,
            discordId: dados.discordId,
            nicknameOriginal: dados.nicknameOriginal,
            nickRoblox: dados.nickRoblox,
            userRoblox: dados.userRoblox,
            nomePersonagem: dados.nomePersonagem,
            idade: dados.idade,
            localNascimento: dados.localNascimento,
            ssn: null,
            status: 'PENDENTE',
            motivoReprovacao: null,
            staffResponsavel: null,
            createdAt: new Date().toISOString()
        };

        solicitacoesPendentes.set(registroId, novoRegistro);
        
        return novoRegistro;
    }

    static async buscarRegistro(client, registroId) {
        return solicitacoesPendentes.get(registroId.toString());
    }

    static async atualizarStatus(client, registroId, status, staffId, motivo = null) {
        const registro = solicitacoesPendentes.get(registroId.toString());
        if (!registro) return null;

        registro.status = status;
        registro.staffResponsavel = staffId;
        
        if (status === 'APROVADO') {
            registro.ssn = this.gerarSSN();
            this._salvarAprovado(registro);
        } else if (status === 'REPROVADO') {
            registro.motivoReprovacao = motivo;
            // Define o início do cooldown de 5 minutos para o usuário reprovado
            cooldownsReprovacao.set(registro.discordId, Date.now());
        }

        solicitacoesPendentes.delete(registroId.toString());

        return registro;
    }

    static async registrarLog(client, tipo, dados) {
        const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
        if (!canalLogs) return;

        let logContainer;
        const infoRoblox = `<:valdotsmall:1392947288879665244> **Roblox:** \`${dados.nickRoblox}\` (\`@${dados.userRoblox}\`)`;

        if (tipo === 'CRIADO') {
            logContainer = new ContainerBuilder()
                .setAccentColor(0x3120F2)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:tempo_gvrpnl:1466937443545780437> **Novo Registro Solicitado**\n' +
                        '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
                        `${infoRoblox}\n` +
                        `<:rpc2:1500318320853782669>**Personagem:** \`${dados.nomePersonagem}\`\n` +
                        `<:info:1373983629746638938> **Idade:** \`${dados.idade} anos\` <:white_dot:1373337479721123870> **Origem:** \`${dados.localNascimento}\``
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# <:lock_gvrpnl:1466937465674792990> ID: \`${dados.id}\``
                    )
                );

        } else if (tipo === 'APROVADO') {
            logContainer = new ContainerBuilder()
                .setAccentColor(0x75F5E9)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:SimGVRPNL:1228154618048155701> **Registro Aprovado**\n' +
                        '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
                        `${infoRoblox}\n` +
                        `<:rpc2:1500318320853782669>**Personagem:** \`${dados.nomePersonagem}\`\n` +
                        `<:lock_gvrpnl:1466937465674792990> **SSN Gerado:** \`${dados.ssn}\`\n` +
                        `<:MembrosGVRPNL:1223380937698443324> **Aprovado por:** <@${dados.staffResponsavel}>`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# <:lock_gvrpnl:1466937465674792990> ID: \`${dados.id}\``
                    )
                );

        } else if (tipo === 'REPROVADO') {
            logContainer = new ContainerBuilder()
                .setAccentColor(0xFF59A2)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:NoGVRPNL:1223380966924484650> **Registro Reprovado**\n' +
                        '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
                        `${infoRoblox}\n` +
                        `<:rpc2:1500318320853782669>**Personagem:** \`${dados.nomePersonagem}\`\n` +
                        `<:lock_gvrpnl:1466937465674792990> **Reprovado por:** <@${dados.staffResponsavel}>`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:info:1373983629746638938> **Motivo:** ${dados.motivoReprovacao}\n\n` +
                        `-# <:lock_gvrpnl:1466937465674792990> ID: \`${dados.id}\``
                    )
                );
        }

        await canalLogs.send({
            components: [logContainer],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }
}

    

module.exports = RegistroService;