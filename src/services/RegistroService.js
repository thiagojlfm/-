const fs = require('fs');
const path = require('path');
const {
    AttachmentBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require('discord.js');

const dataPath = path.join(__dirname, '..', 'data', 'registros.json');
const pendentesPath = path.join(__dirname, '..', 'data', 'pendentes.json');
const arquivadosPath = path.join(__dirname, '..', 'data', 'registros_arquivados.json');
const dataDir = path.dirname(dataPath);
const backupsDir = path.join(dataDir, 'backups_auto');
/** Canal fixo de backup do arquivo registros.json */
const BACKUP_CHANNEL_ID = '1526964267734007890';

/** Status no único arquivo registros.json (não apaga personagem; só muda status). */
const STATUS = {
    APROVADO: 'APROVADO',
    ARQUIVADO_SAIDA: 'ARQUIVADO_SAIDA',
    DELETADO: 'DELETADO',
    PENDENTE: 'PENDENTE',
    REPROVADO: 'REPROVADO'
};

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([], null, 4));
}
if (!fs.existsSync(pendentesPath)) {
    fs.writeFileSync(pendentesPath, JSON.stringify([], null, 4));
}
if (!fs.existsSync(arquivadosPath)) {
    fs.writeFileSync(arquivadosPath, JSON.stringify([], null, 4));
}
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

const processingInteractions = new Set();
const cooldownsReprovacao = new Map();

// Carrega pendentes do disco ao iniciar: sobrevive a restarts
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

    /**
     * Normaliza o nome do personagem para Title Case.
     * Ex.: "marcos almeida" → "Marcos Almeida"
     * Também colapsa espaços extras e trata hífens (ex.: jean-pierre).
     */
    static formatarNomePersonagem(nome) {
        return String(nome || '')
            .trim()
            .replace(/\s+/g, ' ')
            .split(' ')
            .map((palavra) => {
                if (!palavra) return palavra;
                return palavra
                    .split('-')
                    .map((parte) => {
                        if (!parte) return parte;
                        return (
                            parte.charAt(0).toLocaleUpperCase('pt-BR') +
                            parte.slice(1).toLocaleLowerCase('pt-BR')
                        );
                    })
                    .join('-');
            })
            .join(' ');
    }

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

    static _ehAtivo(r) {
        const s = r?.status;
        // Dados antigos sem status (ou só APROVADO) = ativo
        return !s || s === STATUS.APROVADO;
    }

    static _ehArquivado(r) {
        return r?.status === STATUS.ARQUIVADO_SAIDA || r?.status === STATUS.DELETADO;
    }

    static _chaveRegistro(r) {
        return String(r?.id || '') || `d:${r?.discordId || ''}|s:${r?.ssn || ''}`;
    }

    /** Cópia de segurança local antes de qualquer migração/escrita arriscada. Nunca apaga o original. */
    static _backupLocalArquivos(tag = 'auto') {
        try {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const dest = path.join(backupsDir, `${stamp}_${tag}`);
            fs.mkdirSync(dest, { recursive: true });
            if (fs.existsSync(dataPath)) {
                fs.copyFileSync(dataPath, path.join(dest, 'registros.json'));
            }
            if (fs.existsSync(arquivadosPath)) {
                fs.copyFileSync(arquivadosPath, path.join(dest, 'registros_arquivados.json'));
            }
            console.log(`[BACKUP-LOCAL] Cópia em ${dest}`);
            return dest;
        } catch (error) {
            console.error('[BACKUP-LOCAL] Falha ao copiar (seguindo com cuidado):', error.message);
            return null;
        }
    }

    /**
     * Lê TODOS os registros do JSON único.
     * Em erro de parse: lança — NÃO devolve [] silencioso (isso apagaria o volume se alguém salvasse).
     */
    static _lerTodos() {
        if (!fs.existsSync(dataPath)) return [];
        const rawData = fs.readFileSync(dataPath, 'utf-8');
        if (!String(rawData).trim()) return [];
        let data;
        try {
            data = JSON.parse(rawData);
        } catch (error) {
            console.error('[CRÍTICO] registros.json inválido — recusando operar sobre ele:', error.message);
            throw new Error('registros.json corrompido ou inválido; dados preservados no disco.');
        }
        if (!Array.isArray(data)) {
            throw new Error('registros.json não é um array; dados preservados no disco.');
        }
        return data;
    }

    /**
     * Gravação atômica (tmp + rename). Recusa sobrescrever com [] se o disco ainda tem dados.
     * @param {object[]} lista
     * @param {{ allowEmpty?: boolean }} [opts]
     */
    static _salvarTodos(lista, opts = {}) {
        if (!Array.isArray(lista)) {
            throw new Error('Tentativa de salvar registros com valor não-array — abortado.');
        }

        if (lista.length === 0 && !opts.allowEmpty) {
            try {
                if (fs.existsSync(dataPath)) {
                    const curRaw = fs.readFileSync(dataPath, 'utf-8');
                    if (curRaw.trim()) {
                        const cur = JSON.parse(curRaw);
                        if (Array.isArray(cur) && cur.length > 0) {
                            console.error(
                                `[CRÍTICO] Abortado save vazio: disco ainda tem ${cur.length} registro(s).`
                            );
                            throw new Error('Recusa de sobrescrever registros.json com lista vazia.');
                        }
                    }
                }
            } catch (error) {
                if (String(error.message).includes('Recusa')) throw error;
                // se nem conseguiu ler o atual, não arrisca gravar vazio
                console.error('[CRÍTICO] Abortado save vazio (não foi possível validar disco).');
                throw new Error('Recusa de sobrescrever registros.json com lista vazia.');
            }
        }

        const tmp = `${dataPath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(lista, null, 4), 'utf-8');
        fs.renameSync(tmp, dataPath);
    }

    /**
     * Migração única: funde registros_arquivados.json → registros.json com status.
     * Nunca apaga contagem: se final < esperado, aborta e mantém arquivos originais.
     * O arquivo antigo de arquivados fica em backup; não é apagado sem cópia.
     */
    static _migrarArquivoSeNecessario() {
        let arquivadosLegado = [];
        try {
            if (fs.existsSync(arquivadosPath)) {
                const raw = fs.readFileSync(arquivadosPath, 'utf-8');
                if (raw.trim()) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) arquivadosLegado = parsed;
                }
            }
        } catch (error) {
            console.error('[MIGRAÇÃO] Não foi possível ler registros_arquivados.json — migração adiada:', error.message);
            return;
        }

        let atuais;
        try {
            atuais = this._lerTodos();
        } catch (error) {
            console.error('[MIGRAÇÃO] Abortada (não foi possível ler registros.json):', error.message);
            return;
        }

        const precisaNormalizarStatus = atuais.some(
            (r) =>
                r &&
                r.status !== STATUS.APROVADO &&
                r.status !== STATUS.ARQUIVADO_SAIDA &&
                r.status !== STATUS.DELETADO &&
                r.status !== STATUS.PENDENTE &&
                r.status !== STATUS.REPROVADO &&
                // legado: só APROVADO ou ausente — ok; mas se tem motivoArquivo e ainda "APROVADO" estranho
                false
        );

        // Normaliza ausentes → APROVADO (legado era “tudo no arquivo = ativo”)
        const normalizados = atuais.map((r) => {
            if (!r || typeof r !== 'object') return r;
            if (!r.status || r.status === 'APROVADO') {
                return { ...r, status: STATUS.APROVADO };
            }
            // legado: se alguém ficou com motivoArquivo no arquivo principal
            if (r.motivoArquivo === 'DELETADO_STAFF' && r.status === STATUS.APROVADO) {
                return { ...r, status: STATUS.DELETADO };
            }
            if (
                (r.motivoArquivo === 'SAIDA_SERVIDOR' || r.motivoArquivo === 'SAIDA') &&
                r.status === STATUS.APROVADO
            ) {
                return { ...r, status: STATUS.ARQUIVADO_SAIDA };
            }
            return r;
        });

        if (arquivadosLegado.length === 0) {
            // Só grava se normalizou algo
            const mudou = JSON.stringify(normalizados) !== JSON.stringify(atuais);
            if (mudou) {
                this._backupLocalArquivos('normalize_status');
                this._salvarTodos(normalizados, { allowEmpty: normalizados.length === 0 });
                console.log(`[MIGRAÇÃO] Status normalizado em ${normalizados.length} registro(s). Dados preservados.`);
            }
            return;
        }

        // Há legado no segundo arquivo → merge seguro
        this._backupLocalArquivos('merge_arquivados');

        const porChave = new Map();
        for (const r of normalizados) {
            if (!r) continue;
            porChave.set(this._chaveRegistro(r), { ...r });
        }

        for (const arq of arquivadosLegado) {
            if (!arq) continue;
            const status =
                arq.motivoArquivo === 'DELETADO_STAFF' || arq.status === STATUS.DELETADO
                    ? STATUS.DELETADO
                    : STATUS.ARQUIVADO_SAIDA;

            const merged = {
                ...arq,
                status,
                arquivadoEm: arq.arquivadoEm || new Date().toISOString()
            };
            const key = this._chaveRegistro(merged);
            const existente = porChave.get(key);

            // Se já existe ATIVO no principal, não sobrescreve com arquivado
            if (existente && this._ehAtivo(existente)) {
                console.warn(
                    `[MIGRAÇÃO] Mantido ativo; ignorado arquivado duplicado (${merged.nomePersonagem || key}).`
                );
                continue;
            }
            porChave.set(key, merged);
        }

        const unificados = Array.from(porChave.values());
        const minimoEsperado = Math.max(atuais.length, arquivadosLegado.length);
        // Contagem final não pode ser menor que o maior dos dois conjuntos (perda óbvia)
        if (unificados.length < atuais.length) {
            console.error(
                `[CRÍTICO] Migração abortada: unificados=${unificados.length} < ativos=${atuais.length}. Originais intactos.`
            );
            return;
        }
        if (unificados.length < minimoEsperado && unificados.length < atuais.length + arquivadosLegado.length - 5) {
            // permite algumas dedupes; se perdeu demais, aborta
            const perda = atuais.length + arquivadosLegado.length - unificados.length;
            if (perda > arquivadosLegado.length) {
                console.error('[CRÍTICO] Migração abortada por perda suspeita de contagem. Originais intactos.');
                return;
            }
        }

        try {
            this._salvarTodos(unificados, { allowEmpty: unificados.length === 0 });
        } catch (error) {
            console.error('[CRÍTICO] Migração não gravou registros.json:', error.message);
            return;
        }

        // Preserva o legado em .bak e zera o arquivo “vivo” de arquivados (dados já estão no principal)
        try {
            const bak = `${arquivadosPath}.pre_status_migration.bak`;
            if (!fs.existsSync(bak)) {
                fs.copyFileSync(arquivadosPath, bak);
            }
            fs.writeFileSync(arquivadosPath, JSON.stringify([], null, 4), 'utf-8');
            console.log(
                `[MIGRAÇÃO] OK: ${unificados.length} registro(s) no registros.json ` +
                    `(vinham ${atuais.length} + ${arquivadosLegado.length} arquivados). ` +
                    `Legado copiado para ${path.basename(bak)}.`
            );
        } catch (error) {
            console.error(
                '[MIGRAÇÃO] Principal OK, mas falha ao arquivar o JSON legado (dados no registros.json):',
                error.message
            );
        }
    }

    /**
     * Soft-delete (CK / reset staff): status DELETADO no mesmo JSON.
     * Não apaga o personagem. Só `/devolver_registro` reativa (não auto-restaura na entrada).
     * @param {string} discordIdOrSsn
     * @param {{ motivo?: string, staffId?: string }} [opts]
     */
    static async deletarRegistro(discordIdOrSsn, opts = {}) {
        try {
            const todos = this._lerTodos();
            const index = todos.findIndex(
                (r) => r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn
            );
            if (index === -1) return null;

            const atualizado = {
                ...todos[index],
                status: STATUS.DELETADO,
                motivoArquivo: 'DELETADO_STAFF',
                motivoDetalhe: opts.motivo || null,
                deletadoPor: opts.staffId || null,
                arquivadoEm: new Date().toISOString()
            };
            todos[index] = atualizado;
            this._salvarTodos(todos);
            return atualizado;
        } catch (error) {
            console.error('[ERRO] Falha ao deletar registro do JSON:', error);
            throw error;
        }
    }

    /**
     * Marca registro como arquivado por saída (ou delete, se meta vier de quem ainda chama assim).
     * Uma única gravação — sem mover entre arquivos.
     * @param {string} discordIdOrSsn
     * @param {string|{ motivoArquivo?: string, motivoDetalhe?: string|null, deletadoPor?: string|null }} [motivoOuMeta]
     */
    static async arquivarRegistro(discordIdOrSsn, motivoOuMeta = 'SAIDA_SERVIDOR') {
        try {
            const todos = this._lerTodos();
            const index = todos.findIndex(
                (r) =>
                    (r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn) && this._ehAtivo(r)
            );
            if (index === -1) return null;

            const meta =
                typeof motivoOuMeta === 'string'
                    ? { motivoArquivo: motivoOuMeta }
                    : {
                          motivoArquivo: motivoOuMeta.motivoArquivo || 'SAIDA_SERVIDOR',
                          motivoDetalhe: motivoOuMeta.motivoDetalhe ?? null,
                          deletadoPor: motivoOuMeta.deletadoPor ?? null
                      };

            const isDelete = meta.motivoArquivo === 'DELETADO_STAFF';
            const atualizado = {
                ...todos[index],
                status: isDelete ? STATUS.DELETADO : STATUS.ARQUIVADO_SAIDA,
                arquivadoEm: new Date().toISOString(),
                ...meta
            };
            todos[index] = atualizado;
            this._salvarTodos(todos);
            return atualizado;
        } catch (error) {
            console.error('[ERRO] Falha ao arquivar registro:', error);
            throw error;
        }
    }

    /**
     * Devolve cadastro: status → APROVADO (mesma entrada no JSON).
     * @param {string} discordIdOrSsn
     * @param {{ apenasSaida?: boolean }} [opts]
     */
    static async restaurarRegistro(discordIdOrSsn, opts = {}) {
        try {
            const todos = this._lerTodos();
            const index = todos.findIndex(
                (r) =>
                    (r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn) && this._ehArquivado(r)
            );
            if (index === -1) return null;

            const alvo = todos[index];
            if (opts.apenasSaida && alvo.status === STATUS.DELETADO) {
                return null;
            }

            // Já existe outro ativo com mesmo discord/ssn?
            const jaAtivo = todos.some(
                (r, i) =>
                    i !== index &&
                    this._ehAtivo(r) &&
                    (r.discordId === alvo.discordId || (alvo.ssn && r.ssn === alvo.ssn))
            );
            if (jaAtivo) return null;

            const {
                avatarUrl: _avatarUrl,
                ...rest
            } = alvo;

            const registro = {
                ...rest,
                status: STATUS.APROVADO,
                restauradoEm: new Date().toISOString()
            };
            // Limpa metadados de arquivo (mantém histórico em campos se quiser auditoria — removemos os operacionais)
            delete registro.motivoArquivo;
            delete registro.motivoDetalhe;
            delete registro.deletadoPor;
            delete registro.arquivadoEm;

            todos[index] = registro;
            this._salvarTodos(todos);
            return registro;
        } catch (error) {
            console.error('[ERRO] Falha ao restaurar registro:', error);
            throw error;
        }
    }

    /** Busca registro arquivado/deletado por Discord ID ou SSN. */
    static buscarArquivado(discordIdOrSsn) {
        return (
            this._lerTodos().find(
                (r) =>
                    this._ehArquivado(r) &&
                    (r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn)
            ) || null
        );
    }

    /** Registro ativo (APROVADO) por Discord ID ou SSN. */
    static buscarAtivo(discordIdOrSsn) {
        return (
            this._lerTodos().find(
                (r) =>
                    this._ehAtivo(r) &&
                    (r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn)
            ) || null
        );
    }

    /**
     * Reaplica apelido e cargos de cidadão registrado a um membro do servidor.
     * @param {import('discord.js').GuildMember} member
     * @param {object} registro
     */
    static async aplicarRegistroAoMembro(member, registro) {
        if (!member || !registro) return;

        if (registro.nomePersonagem) {
            await member.setNickname(registro.nomePersonagem).catch((err) =>
                console.log(`[AVISO] Não foi possível restaurar apelido de ${member.id}:`, err.message)
            );
        }
        if (process.env.ROLE_APROVADO_ID) {
            await member.roles.add(process.env.ROLE_APROVADO_ID).catch((err) =>
                console.log(
                    `[AVISO] Não foi possível adicionar cargo aprovado a ${member.id}:`,
                    err.message
                )
            );
        }
        if (process.env.ROLE_REGISTRO_ID) {
            await member.roles.remove(process.env.ROLE_REGISTRO_ID).catch((err) =>
                console.log(
                    `[AVISO] Não foi possível remover cargo de registro de ${member.id}:`,
                    err.message
                )
            );
        }
    }

    /**
     * Compat: lista só ativos (APROVADO). Não inclui arquivados/deletados.
     * Preferir buscarAtivo / _lerTodos em código novo.
     */
    static _lerAprovados() {
        try {
            return this._lerTodos().filter((r) => this._ehAtivo(r));
        } catch (error) {
            console.error('[ERRO] Falha ao ler registros aprovados:', error.message);
            // NÃO devolve [] se o arquivo existe e falhou — devolve [] só se arquivo vazio/inexistente
            // Callers de listagem toleram []; writers usam _lerTodos/_salvarTodos com guarda.
            return [];
        }
    }

    /** Compat legado (migração): lê o segundo arquivo se ainda existir conteúdo. */
    static _lerArquivados() {
        try {
            // Fonte de verdade: status no JSON único
            const doPrincipal = this._lerTodos().filter((r) => this._ehArquivado(r));
            if (doPrincipal.length > 0) return doPrincipal;

            if (!fs.existsSync(arquivadosPath)) return [];
            const rawData = fs.readFileSync(arquivadosPath, 'utf-8');
            if (!rawData.trim()) return [];
            const parsed = JSON.parse(rawData);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('[ERRO] Falha ao ler arquivados:', error.message);
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
            const todos = this._lerTodos();
            const { avatarUrl, ...registroPersistido } = registro;
            const novo = { ...registroPersistido, status: STATUS.APROVADO };

            // Se já existe entrada arquivada/deletada do mesmo jogador, reativa em vez de duplicar
            const idx = todos.findIndex(
                (r) =>
                    r.discordId === novo.discordId ||
                    (novo.ssn && r.ssn === novo.ssn) ||
                    (novo.id && r.id === novo.id)
            );
            if (idx !== -1) {
                todos[idx] = { ...todos[idx], ...novo, status: STATUS.APROVADO };
            } else {
                todos.push(novo);
            }
            this._salvarTodos(todos);
        } catch (error) {
            console.error('[ERRO] Falha ao salvar registros.json:', error);
            throw error;
        }
    }

    /**
     * Entrada no servidor: auto-restaura só ARQUIVADO_SAIDA (não DELETADO).
     * Boas-vindas ficam no index/BoasVindasService.
     */
    static async handleMemberJoin(member, client) {
        const registroRestaurado = await this.restaurarRegistro(member.id, { apenasSaida: true });
        if (!registroRestaurado) return null;

        await this.aplicarRegistroAoMembro(member, registroRestaurado);

        console.log(
            `[AUTOMAÇÃO] Membro ${member.user.tag} voltou. Registro de ${registroRestaurado.nomePersonagem} (SSN ${registroRestaurado.ssn}) restaurado.`
        );

        const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
        if (canalLogs) {
            const logContainer = new ContainerBuilder()
                .setAccentColor(0x05eb18)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# [LOG AUTOMAÇÃO] Registro Restaurado (Retorno)\n\n' +
                            `**Jogador:** ${member.user.tag} (<@${member.id}>)\n` +
                            `**Roblox:** \`${registroRestaurado.nickRoblox}\` (\`@${registroRestaurado.userRoblox}\`)\n` +
                            `**Personagem:** \`${registroRestaurado.nomePersonagem}\`\n` +
                            `**SSN:** \`${registroRestaurado.ssn}\`\n\n` +
                            '*O registro foi devolvido automaticamente porque o usuário voltou ao servidor.*'
                    )
                );

            await canalLogs
                .send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                })
                .catch(() => null);
        }

        const dmContainer = new ContainerBuilder()
            .setAccentColor(0x05eb18)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '# Registro Restaurado\n\n' +
                        `Seu personagem **${registroRestaurado.nomePersonagem}** foi devolvido automaticamente.\n` +
                        `**SSN:** \`${registroRestaurado.ssn}\`\n\n` +
                        'Bem-vindo(a) de volta!'
                )
            );

        await member
            .send({
                components: [dmContainer],
                flags: MessageFlags.IsComponentsV2
            })
            .catch(() => null);

        await this._enviarBackupJson(
            client,
            `auto-restore retorno \`${registroRestaurado.nomePersonagem}\``,
            registroRestaurado
        ).catch(() => null);

        return registroRestaurado;
    }

    /**
     * Saída do servidor: marca ARQUIVADO_SAIDA (não apaga). Backup no canal.
     */
    static async handleMemberLeave(member, client) {
        const registroArquivado = await this.arquivarRegistro(member.id, 'SAIDA_SERVIDOR');
        if (!registroArquivado) return null;

        console.log(
            `[AUTOMAÇÃO] Membro ${member.user.tag} saiu. Registro do personagem ${registroArquivado.nomePersonagem} arquivado (pode ser restaurado).`
        );

        const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
        if (canalLogs) {
            const logContainer = new ContainerBuilder()
                .setAccentColor(0xFF59A2)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# [LOG AUTOMAÇÃO] Registro Arquivado (Saída)\n\n' +
                            `**Jogador:** ${member.user.tag} (<@${member.id}>)\n` +
                            `**Roblox:** \`${registroArquivado.nickRoblox}\` (\`@${registroArquivado.userRoblox}\`)\n` +
                            `**Personagem:** \`${registroArquivado.nomePersonagem}\`\n` +
                            `**SSN:** \`${registroArquivado.ssn}\`\n\n` +
                            '*O registro foi arquivado (não apagado). Se o usuário voltar, o cadastro será devolvido automaticamente. Staff também pode usar `/devolver_registro`.*'
                    )
                );

            await canalLogs
                .send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                })
                .catch(() => null);
        }

        await this._enviarBackupJson(
            client,
            `arquivamento saída \`${registroArquivado.nomePersonagem}\``,
            registroArquivado
        ).catch(() => null);

        return registroArquivado;
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

    /** Normaliza username/nick Roblox para comparação (sem @, case-insensitive). */
    static normalizarRoblox(valor) {
        return String(valor || '')
            .trim()
            .replace(/^@+/, '')
            .toLowerCase();
    }

    static _bateRoblox(registro, robloxNorm) {
        if (!robloxNorm) return false;
        const nick = this.normalizarRoblox(registro.nickRoblox);
        const user = this.normalizarRoblox(registro.userRoblox);
        return nick === robloxNorm || user === robloxNorm;
    }

    /**
     * Consulta unificada: Discord ID, SSN ou Roblox (username/nickname).
     * Ordem: ativos → pendentes → arquivados/deletados (mesmo JSON).
     * @param {{ discordId?: string|null, ssn?: string|null, roblox?: string|null }} criterios
     * @returns {{ registro: object, isPendente: boolean, isArquivado: boolean } | null}
     */
    static consultarRegistro({ discordId = null, ssn = null, roblox = null } = {}) {
        const robloxNorm = roblox ? this.normalizarRoblox(roblox) : null;
        if (!discordId && !ssn && !robloxNorm) return null;

        const match = (r) => {
            if (discordId && r.discordId === discordId) return true;
            if (ssn && r.ssn === ssn) return true;
            if (robloxNorm && this._bateRoblox(r, robloxNorm)) return true;
            return false;
        };

        let todos = [];
        try {
            todos = this._lerTodos();
        } catch (error) {
            console.error('[consultarRegistro] falha ao ler JSON:', error.message);
            return null;
        }

        const aprovado = todos.find((r) => this._ehAtivo(r) && match(r));
        if (aprovado) {
            return { registro: aprovado, isPendente: false, isArquivado: false };
        }

        for (const reg of solicitacoesPendentes.values()) {
            if (match(reg)) {
                return { registro: reg, isPendente: true, isArquivado: false };
            }
        }

        const arquivado = todos.find((r) => this._ehArquivado(r) && match(r));
        if (arquivado) {
            return { registro: arquivado, isPendente: false, isArquivado: true };
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

    /**
     * Pode abrir formulário de personagem?
     * Bloqueia se: pendente, ativo, arquivado (saída) ou deletado (CK).
     * Política: pós-CK/arquivo só com `/devolver_registro` (ou auto-restore na reentrada se saída).
     */
    static async verificarElegibilidade(client, discordId) {
        for (const reg of solicitacoesPendentes.values()) {
            if (reg.discordId === discordId) return false;
        }

        try {
            const existente = this._lerTodos().find((r) => r.discordId === discordId);
            if (!existente) return true;
            // Qualquer status no JSON único = já tem personagem no sistema
            if (
                this._ehAtivo(existente) ||
                existente.status === STATUS.ARQUIVADO_SAIDA ||
                existente.status === STATUS.DELETADO
            ) {
                return false;
            }
            return true;
        } catch (error) {
            console.error('[verificarElegibilidade] falha ao ler JSON — bloqueando por segurança:', error.message);
            return false;
        }
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
            nomePersonagem: this.formatarNomePersonagem(dados.nomePersonagem),
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
            const registros = this._lerTodos();
            const index = registros.findIndex(
                (r) =>
                    this._ehAtivo(r) &&
                    (r.discordId === discordIdOrSsn || r.ssn === discordIdOrSsn)
            );

            if (index === -1) return null;

            const camposPermitidos = ['nomePersonagem', 'idade', 'localNascimento', 'nickRoblox', 'userRoblox'];
            for (const [campo, valor] of Object.entries(campos)) {
                if (camposPermitidos.includes(campo) && valor !== null && valor !== undefined) {
                    registros[index][campo] =
                        campo === 'nomePersonagem' ? this.formatarNomePersonagem(valor) : valor;
                }
            }

            this._salvarTodos(registros);
            return registros[index];
        } catch (error) {
            console.error('[ERRO] Falha ao editar registro:', error);
            throw error;
        }
    }

    /**
     * Envia o arquivo `registros.json` literal no canal de backup.
     * @param {import('discord.js').Client} client
     * @param {string} [motivo]
     * @param {object} [registro] registro recém-aprovado (só para o texto da mensagem)
     */
    static async _enviarBackupJson(client, motivo = 'atualização', registro = null) {
        let canal = client.channels.cache.get(BACKUP_CHANNEL_ID);
        if (!canal) {
            canal = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
        }
        if (!canal) {
            console.error(`[BACKUP] Canal de backup não encontrado: ${BACKUP_CHANNEL_ID}`);
            return;
        }

        if (!fs.existsSync(dataPath)) {
            console.error('[BACKUP] registros.json não encontrado no disco.');
            return;
        }

        const agora = new Date().toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });

        let total = 0;
        let ativos = 0;
        try {
            const todos = this._lerTodos();
            total = todos.length;
            ativos = todos.filter((r) => this._ehAtivo(r)).length;
        } catch {
            total = -1;
        }
        const detalheRegistro = registro
            ? `\n-# Último: \`${registro.nomePersonagem || '-'}\` · SSN \`${registro.ssn || '-'}\` · ID \`${registro.id || '-'}\``
            : '';

        // Anexa o arquivo real do volume/disco (não um resumo formatado)
        const attachment = new AttachmentBuilder(dataPath, { name: 'registros.json' });

        await canal.send({
            content:
                `<:lock_gvrpnl:1466937465674792990> **Backup: \`registros.json\`**\n` +
                `-# <:GVNL:1391202082920595556> WL · GVRPNL · ${agora}\n` +
                `-# Motivo: ${motivo} · Total: \`${total}\` · Ativos: \`${ativos}\`` +
                detalheRegistro,
            files: [attachment]
        }).catch(err => console.error('[BACKUP] Falha ao enviar registros.json:', err.message));
    }

    /** Compat: chamadas antigas passam o registro aprovado; agora manda o .json completo. */
    static async _enviarBackupRegistro(client, registro) {
        const motivo = registro?.nomePersonagem
            ? `aprovação de \`${registro.nomePersonagem}\``
            : 'aprovação';
        return this._enviarBackupJson(client, motivo, registro);
    }

    // No boot: migração segura + envia o registros.json atual (se houver dados no volume)
    static async sincronizarBackups(client) {
        try {
            this._migrarArquivoSeNecessario();
        } catch (error) {
            console.error('[MIGRAÇÃO] Erro no boot (dados no disco preservados):', error.message);
        }

        let total = 0;
        try {
            total = this._lerTodos().length;
        } catch (error) {
            console.error('[BACKUP] Não foi possível ler registros no boot:', error.message);
            return;
        }

        if (total === 0) {
            console.log('[BACKUP] Nenhum registro no disco; backup de arquivo ignorado.');
            return;
        }

        console.log(`[BACKUP] Enviando registros.json (${total} registro(s) no total) no boot...`);
        await this._enviarBackupJson(client, 'sincronização no boot');
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

// Migração no load do módulo (antes de qualquer comando). Falha = originais intactos.
try {
    RegistroService._migrarArquivoSeNecessario();
} catch (error) {
    console.error('[MIGRAÇÃO] Erro no load (dados preservados):', error.message);
}

module.exports = RegistroService;
module.exports.STATUS = STATUS;
