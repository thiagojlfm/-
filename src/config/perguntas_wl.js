/**
 * Perguntas de múltipla escolha da Whitelist.
 * O bot NÃO corrige automaticamente: a staff avalia.
 * value curto (customId/value limit); textoCompleto vai pro painel da staff.
 */
module.exports = [
    {
        id: 'giroflex',
        pergunta:
            'Você está trafegando na faixa da esquerda a 55 MPH, quando um veículo de emergência pede passagem utilizando giroflex e sirene. O que você faria?',
        opcoes: [
            { value: 'a', label: 'Continuar na faixa', textoCompleto: 'Eu iria continuar na faixa' },
            {
                value: 'b',
                label: 'Frear com tudo (velocidade da via)',
                textoCompleto:
                    'Iria freiar com tudo, eu estou na velocidade da via e ele não pode me passar'
            },
            {
                value: 'c',
                label: 'Sinalizar, trocar de faixa e liberar',
                textoCompleto:
                    'Sinalizaria para a troca de faixa, quando seguro, efetuaria a troca e liberaria a passagem'
            },
            {
                value: 'd',
                label: 'Acelerar para ele não me passar',
                textoCompleto: 'Eu aceleraria o veículo para ele não me passar'
            }
        ]
    },
    {
        id: 'bloqueio',
        pergunta:
            'Você está andando com o seu carro normalmente, quando vê um bloqueio policial com placas de "stop" à frente (acidente, via interditada). O correto a se fazer?',
        opcoes: [
            {
                value: 'a',
                label: 'Passar pela grama ou contra-mão',
                textoCompleto: 'Passar direto pela grama ou contra-mão'
            },
            {
                value: 'b',
                label: 'Cortar giro / borrachão / bater nos carros',
                textoCompleto:
                    'Ficar cortando de giro, fazendo borrachão, bater nos carros, para tirarem o bloqueio logo'
            },
            {
                value: 'c',
                label: 'Pisca-alerta e esperar o bloqueio acabar',
                textoCompleto: 'Ligar o pisca alerta e esperar o bloqueio acabar'
            },
            {
                value: 'd',
                label: 'Frear de propósito e bater no bloqueio',
                textoCompleto:
                    'Frear de proposito e bater nos carros dentro do bloqueio para gerar mais roleplay'
            }
        ]
    },
    {
        id: 'colisao',
        pergunta:
            'Você acabou de colidir de frente com outro jogador a 60 Mph (sem lag/dessinc). Qual a conduta correta imediatamente?',
        opcoes: [
            {
                value: 'a',
                label: 'Dar ré e fugir da polícia',
                textoCompleto: 'Dar ré e fugir antes que a polícia chegue.'
            },
            {
                value: 'b',
                label: 'Resetar o personagem e andar',
                textoCompleto: 'Resetar o personagem e andar normalmente.'
            },
            {
                value: 'c',
                label: 'Parar, simular ferimentos e aguardar',
                textoCompleto: 'Parar, simular ferimentos e aguardar socorro.'
            },
            {
                value: 'd',
                label: 'Culpar lag no chat global',
                textoCompleto: 'Digitar no chat global que a culpa foi do lag do outro jogador.'
            }
        ]
    },
    {
        id: 'pt_on_parada',
        pergunta:
            'Durante o peace-time ON, um policial te dá ordem de parada. Qual a sua atitude?',
        opcoes: [
            {
                value: 'a',
                label: 'Acelerar e tentar fugir',
                textoCompleto: 'Acelero o carro e tento fugir'
            },
            {
                value: 'b',
                label: 'Quit do jogo para não ser preso',
                textoCompleto: 'Quito do jogo para não ser preso'
            },
            {
                value: 'c',
                label: 'Encostar e obedecer as ordens',
                textoCompleto: 'Encosto o veículo e obedeço as ordens dele'
            },
            {
                value: 'd',
                label: 'Fingir que não escutou',
                textoCompleto: 'Finjo que não estou escutando e continuo ignorando ele'
            }
        ]
    },
    {
        id: 'frp_pt_off',
        pergunta: 'Qual o FRP em Peace-Time OFF?',
        opcoes: [
            { value: 'a', label: '75', textoCompleto: '75' },
            { value: 'b', label: '115', textoCompleto: '115' },
            { value: 'c', label: '95', textoCompleto: '95' },
            { value: 'd', label: '100', textoCompleto: '100' }
        ]
    },
    {
        id: 'usar_veiculo',
        pergunta: 'Para usar um veículo nas sessões da comunidade, eu devo:',
        opcoes: [
            {
                value: 'a',
                label: 'Só pegar o carro no jogo e usar',
                textoCompleto: 'Apenas pegar o carro no jogo e usar ele'
            },
            {
                value: 'b',
                label: 'Pegar, checar se é banido e usar',
                textoCompleto:
                    'Apenas pegar o carro no jogo, verificar se ele é banido ou não e usar ele caso não seja'
            },
            {
                value: 'c',
                label: 'Cotar, checar ban, pagar, registrar e usar',
                textoCompleto:
                    'Mandar o pedido de cotação na concessionaria, verificar se o carro é banido, e quando responderem na concessionaria, pagar o veículo, registrar e usar ele'
            }
        ]
    },
    {
        id: 'jura',
        pergunta:
            'Você JURA ter certeza das suas respostas e GARANTE que não usou de terceiros para facilitar a passagem no teste?',
        opcoes: [
            { value: 'sim', label: 'Sim', textoCompleto: 'Sim' },
            { value: 'nao', label: 'Não', textoCompleto: 'Não' }
        ]
    }
];
