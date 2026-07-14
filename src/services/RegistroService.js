const fs = require('fs');
const path = require('path');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

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

        let cor, titulo, corpo;

        // Formatação padronizada do bloco do Roblox para reutilização
       const infoRoblox = `**Roblox:** \`${dados.nickRoblox}\` (\`@${dados.userRoblox}\`)`;

        if (tipo === 'CRIADO') {
    cor = 0x3120F2;
    titulo = '# [LOG] Novo Registro Solicitado';
    corpo = `**ID:** \`${dados.id}\`\n**Usuário:** <@${dados.discordId}>\n${infoRoblox}\n**Personagem:** \`${dados.nomePersonagem}\`\n**Idade:** \`${dados.idade}\`\n**Local de Nasc.:** \`${dados.localNascimento}\``;
} else if (tipo === 'APROVADO') {
    cor = 0x75F5E9;
    titulo = '# [LOG] Registro Aprovado';
    corpo = `**ID:** \`${dados.id}\`\n**Usuário:** <@${dados.discordId}>\n${infoRoblox}\n**Personagem:** \`${dados.nomePersonagem}\`\n**SSN Gerado:** \`${dados.ssn}\`\n**Staff:** <@${dados.staffResponsavel}>`;
} else if (tipo === 'REPROVADO') {
    cor = 0xFF59A2;
    titulo = '# [LOG] Registro Reprovado';
    corpo = `**ID:** \`${dados.id}\`\n**Usuário:** <@${dados.discordId}>\n${infoRoblox}\n**Personagem:** \`${dados.nomePersonagem}\`\n**Motivo:** \`${dados.motivoReprovacao}\`\n**Staff:** <@${dados.staffResponsavel}>`;
}

        const logContainer = new ContainerBuilder()
            .setAccentColor(cor)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${titulo}\n\n${corpo}`)
            );

        await canalLogs.send({ 
            components: [logContainer],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }
}

    

module.exports = RegistroService;