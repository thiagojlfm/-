const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require('discord.js');

const dataPath = path.join(__dirname, '..', 'data', 'registros.json');
const backupIdsPath = path.join(__dirname, '..', 'data', 'backup_ids.json');
const pendentesPath = path.join(__dirname, '..', 'data', 'pendentes.json');

if (!fs.existsSync(path.dirname(dataPath))) {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
}
if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([], null, 4));
}
if (!fs.existsSync(backupIdsPath)) {
    fs.writeFileSync(backupIdsPath, JSON.stringify([], null, 4));
}
if (!fs.existsSync(pendentesPath)) {
    fs.writeFileSync(pendentesPath, JSON.stringify([], null, 4));
}

const processingInteractions = new Set();
const cooldownsReprovacao = new Map();

// Carrega pendentes do disco ao iniciar — sobrevive a restarts
const solicitacoesPendentes = new Map();
try {
    const pendentesRaw = JSON.parse(fs.readFileSync(pendentesPath, 'utf-8'));
    for (const reg of pendentesRaw) {
        solicitacoesPendentes.set(reg.id, reg);
    }
    if (pendentesRaw.length > 0) {
        console.log(`[PENDENTES] ${pendentesRaw.length} registro(s) pendente(s) recarregado(s) do disco.`);
    }
} catch {
    console.log('[PENDENTES] Nenhum pendente anterior encontrado.');
}

class RegistroService {

    static adicionarAvatarAoContainer(container, avatarUrl) {
        if (!avatarUrl) return container;

        return container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(avatarUrl)
                    .setDescription('Avatar do usuário Roblox')
            )
        );
    }

    static async buscarDadosRoblox(username) {
        const normalizedUsername = String(username || '').trim();
        if (!normalizedUsername) {
            throw new Error('O username do Roblox não foi informado.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        try {
            const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usernames: [normalizedUsername], excludeBannedUsers: false }),
                signal: controller.signal
            });

            if (!userResponse.ok) {
                throw new Error(`A API de usuários do Roblox respondeu com HTTP ${userResponse.status}.`);
            }

            const userData = await userResponse.json();
            const user = userData.data?.[0];
            if (!user?.id) {
                throw new Error('Username do Roblox não encontrado.');
            }

            const thumbnailResponse = await fetch(
                `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`,
                { signal: controller.signal }
            );

            if (!thumbnailResponse.ok) {
                throw new Error(`A API de thumbnails do Roblox respondeu com HTTP ${thumbnailResponse.status}.`);
            }

            const thumbnailData = await thumbnailResponse.json();
            const avatarUrl = thumbnailData.data?.[0]?.imageUrl;
            if (!avatarUrl) {
                throw new Error('A API do Roblox não retornou uma foto para esse usuário.');
            }

            return { userId: user.id, username: user.name, avatarUrl };
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('A consulta ao Roblox expirou. Tente novamente em alguns instantes.');
            }
            if (error instanceof TypeError) {
                throw new Error('Não foi possível conectar às APIs do Roblox. Tente novamente em alguns instantes.');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

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

    static _salvarPendentes() {
        try {
            const lista = Array.from(solicitacoesPendentes.values());
            fs.writeFileSync(pendentesPath, JSON.stringify(lista, null, 4), 'utf-8');
        } catch (error) {
            console.error('[ERRO] Falha ao salvar pendentes.json:', error);
        }
    }

    static _salvarAprovado(registro) {
        try {
            const registros = this._lerAprovados();
            // avatarUrl é usado somente nos containers e nunca é persistido no JSON.
            const { avatarUrl, ...registroPersistido } = registro;
            registros.push(registroPersistido);
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
            robloxUserId: dados.robloxUserId,
            avatarUrl: dados.avatarUrl,
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
        this._salvarPendentes();

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
            registro.ssn = registro.ssn || this.gerarSSN();
            this._salvarAprovado(registro);
            this._enviarBackupRegistro(client, registro).catch(() => null);
        } else if (status === 'REPROVADO') {
            registro.motivoReprovacao = motivo;
            // Define o início do cooldown de 5 minutos para o usuário reprovado
            cooldownsReprovacao.set(registro.discordId, Date.now());
        }

        solicitacoesPendentes.delete(registroId.toString());
        this._salvarPendentes();

        return registro;
    }

    static editarRegistro(discordIdOrSsn, campos) {
        try {
            const registros = this._lerAprovados();
            const index = registros.findIndex(r => r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn);

            if (index === -1) return null;

            const camposPermitidos = ['nomePersonagem', 'idade', 'localNascimento', 'nickRoblox', 'userRoblox'];
            for (const [campo, valor] of Object.entries(campos)) {
                if (camposPermitidos.includes(campo) && valor !== null && valor !== undefined) {
                    registros[index][campo] = valor;
                }
            }

            fs.writeFileSync(dataPath, JSON.stringify(registros, null, 4), 'utf-8');
            return registros[index];
        } catch (error) {
            console.error('[ERRO] Falha ao editar registro:', error);
            throw error;
        }
    }

    static _lerIdsBackup() {
        try {
            return JSON.parse(fs.readFileSync(backupIdsPath, 'utf-8'));
        } catch {
            return [];
        }
    }

    static _marcarBackupEnviado(id) {
        const ids = this._lerIdsBackup();
        if (!ids.includes(id)) {
            ids.push(id);
            fs.writeFileSync(backupIdsPath, JSON.stringify(ids, null, 4), 'utf-8');
        }
    }

    static async _enviarBackupRegistro(client, registro) {
        const canal = client.channels.cache.get('1526964267734007890');
        if (!canal) return;

        const agora = new Date().toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });

        const container = new ContainerBuilder()
            .setAccentColor(0x3C166C)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '<:lock_gvrpnl:1466937465674792990> **Backup de Registro**\n' +
                    `-# <:GVNL:1391202082920595556> WL · GVRPNL <:white_dot:1373337479721123870> ${agora}`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registro.discordId}>\n` +
                    `<:valdotsmall:1392947288879665244> **Roblox:** \`${registro.nickRoblox}\` (\`@${registro.userRoblox}\`)`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `<:rpc2:1500318320853782669> **Personagem:** \`${registro.nomePersonagem}\`\n` +
                    `<:info:1373983629746638938> **Idade:** \`${registro.idade} anos\` <:white_dot:1373337479721123870> **Origem:** \`${registro.localNascimento}\`\n` +
                    `<:lock_gvrpnl:1466937465674792990> **SSN:** \`${registro.ssn}\``
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# <:tempo_gvrpnl:1466937443545780437> ID: \`${registro.id}\``
                )
            );

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(err => console.error('[BACKUP] Falha ao enviar backup:', err.message));

        this._marcarBackupEnviado(registro.id);
    }

    // Chamado no bot ready — sincroniza registros que ainda não foram enviados ao canal de backup
    static async sincronizarBackups(client) {
        const registros = this._lerAprovados();
        const idsEnviados = this._lerIdsBackup();
        const pendentes = registros.filter(r => !idsEnviados.includes(r.id));

        if (pendentes.length === 0) return;

        console.log(`[BACKUP] Sincronizando ${pendentes.length} registro(s) não enviado(s)...`);

        for (const registro of pendentes) {
            await this._enviarBackupRegistro(client, registro);
            // Pequena pausa para não estourar o rate limit do Discord
            await new Promise(res => setTimeout(res, 1000));
        }

        console.log('[BACKUP] Sincronização concluída.');
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
                        '-# <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
                        `${infoRoblox}\n` +
                        `<:white_dot:1373337479721123870>**Personagem:** \`${dados.nomePersonagem}\`\n` +
                        `<:white_dot:1373337479721123870> **Idade:** \`${dados.idade} anos\` <:white_dot:1373337479721123870> **Origem:** \`${dados.localNascimento}\``
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
                .setAccentColor(0x05eb18)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:SimGVRPNL:1228154618048155701> **Registro Aprovado**\n' +
                        '-# <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
                        `${infoRoblox}\n` +
                        `<:white_dot:1373337479721123870>**Personagem:** \`${dados.nomePersonagem}\`\n` +
                        `<:white_dot:1373337479721123870> **SSN Gerado:** \`${dados.ssn}\`\n` +
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
                .setAccentColor(0x990000)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:NoGVRPNL:1223380966924484650> **Registro Reprovado**\n' +
                        '-# <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Usuário:** <@${dados.discordId}>\n` +
                        `${infoRoblox}\n` +
                        `:<white_dot:1373337479721123870>**Personagem:** \`${dados.nomePersonagem}\`\n` +
                        `<:white_dot:1373337479721123870> **Reprovado por:** <@${dados.staffResponsavel}>`
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

        this.adicionarAvatarAoContainer(logContainer, dados.avatarUrl);

        await canalLogs.send({
            components: [logContainer],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }
}

    

module.exports = RegistroService;
