import { treasureMetrics } from '../services/metricsService.js';
import territoryModifierService from '../services/territoryModifierService.js';
import { getPlayerTeam as utilGetPlayerTeam, arePlayersTeammates as utilArePlayersTeammates } from '../utils/gameTeams.js';
import { drawTreasure, ensureTreasureState, findRedeemableSets, normalizeTreasureConfig, redeemSet, } from './hiddenTreasures.js';
export class GameEngine {
    gameModifiersCache = new Map();
    cyrb128(seed) {
        let h1 = 1779033703;
        let h2 = 3144134277;
        let h3 = 1013904242;
        let h4 = 2773480762;
        for (let i = 0; i < seed.length; i++) {
            const k = seed.charCodeAt(i);
            h1 = (h2 ^ Math.imul(h1 ^ k, 597399067)) >>> 0;
            h2 = (h3 ^ Math.imul(h2 ^ k, 2869860233)) >>> 0;
            h3 = (h4 ^ Math.imul(h3 ^ k, 951274213)) >>> 0;
            h4 = (h1 ^ Math.imul(h4 ^ k, 2716044179)) >>> 0;
        }
        h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067) >>> 0;
        h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233) >>> 0;
        h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213) >>> 0;
        h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179) >>> 0;
        return [h1, h2, h3, h4];
    }
    sfc32(a, b, c, d) {
        let _a = a >>> 0;
        let _b = b >>> 0;
        let _c = c >>> 0;
        let _d = d >>> 0;
        return () => {
            const t = (((_a + _b) | 0) + _d) | 0;
            _d = (_d + 1) | 0;
            _a = _b ^ (_b >>> 9);
            _b = (_c + (_c << 3)) | 0;
            _c = (_c << 21) | (_c >>> 11) | 0;
            _c = (_c + t) | 0;
            return (t >>> 0) / 4294967296;
        };
    }
    ensureCombatRng(gameState) {
        if (!gameState.combatRngSeed || !gameState.combatRngState) {
            const seed = gameState.combatRngSeed || `${gameState.roomId}:legacy`;
            const [a, b, c, d] = this.cyrb128(seed);
            gameState.combatRngSeed = seed;
            gameState.combatRngState = { a, b, c, d };
        }
        return gameState.combatRngState;
    }
    nextRandom(gameState) {
        const st = this.ensureCombatRng(gameState);
        const next = this.sfc32(st.a, st.b, st.c, st.d);
        const r = next();
        const r1 = Math.floor(next() * 4294967296) >>> 0;
        const r2 = Math.floor(next() * 4294967296) >>> 0;
        const r3 = Math.floor(next() * 4294967296) >>> 0;
        const r4 = Math.floor(next() * 4294967296) >>> 0;
        gameState.combatRngState = { a: r1, b: r2, c: r3, d: r4 };
        return r;
    }
    clearModifiersCache(roomId) {
        this.gameModifiersCache.delete(roomId);
    }
    initializeGame(roomId, playerConfigs, gameConfig, mapOverrides) {
        if (!mapOverrides || !Array.isArray(mapOverrides.territories)) {
            throw new Error('Map data not provided to GameEngine');
        }
        const baseTerritories = mapOverrides.territories;
        const territories = baseTerritories.map((t) => ({
            id: t.id,
            name: t.name,
            sector: (t.sector || t.continent || 'unknown'),
            ownerId: null,
            armies: 0,
            adjacentTerritories: [...t.adjacentTerritories],
            ...(t.coordinates ? { coordinates: { ...t.coordinates } } : {}),
            ...(typeof t.isCapital === 'boolean' ? { isCapital: t.isCapital } : {}),
            ...(t.capitalOwnerId !== undefined ? { capitalOwnerId: t.capitalOwnerId ?? null } : {}),
        }));
        const players = this.createPlayers(playerConfigs);
        this.randomizePlayerOrder(players);
        this.distributeTerritoriesWithNeutrals(territories, players);
        let kingConfig = null;
        let hillRotation = null;
        if (gameConfig.gameMode === 'king_of_the_hill') {
            kingConfig = this.normalizeKingOfTheHillConfig(gameConfig.kingOfTheHill, territories);
            hillRotation = this.createInitialHillRotation(territories, kingConfig);
            if (hillRotation) {
                this.prepareInitialHillTerritory(territories, players, kingConfig, hillRotation.current);
            }
        }
        this.deployInitialArmies(territories, players, gameConfig);
        const hydratedConfig = {
            ...gameConfig,
            sectorBonuses: gameConfig.sectorBonuses && gameConfig.sectorBonuses.length > 0
                ? gameConfig.sectorBonuses
                : gameConfig.continentBonuses && gameConfig.continentBonuses.length > 0
                    ? gameConfig.continentBonuses
                    : mapOverrides.continentBonuses,
        };
        if (kingConfig) {
            hydratedConfig.kingOfTheHill = kingConfig;
        }
        const treasureConfig = this.ensureTreasureConfig(hydratedConfig);
        treasureMetrics.recordMode(treasureConfig);
        if (hydratedConfig.gameMode === 'assassination') {
            hydratedConfig.allowTeamPlay = false;
        }
        const assassinationTargets = hydratedConfig.gameMode === 'assassination'
            ? this.assignAssassinationTargets(players)
            : undefined;
        const kingOfTheHillState = kingConfig && hillRotation
            ? this.createInitialKingOfTheHillState(kingConfig, hillRotation)
            : undefined;
        const gameState = {
            roomId,
            players,
            currentPlayer: players[0].id,
            phase: 'reinforcement',
            turn: 1,
            board: territories,
            cards: [],
            gameConfig: hydratedConfig,
            movementTracking: {},
            mustCashInTreasures: false,
            conqueredDuringTurn: false,
            ...(assassinationTargets ? { assassinationTargets } : {}),
            ...(kingOfTheHillState ? { kingOfTheHillState } : {}),
            ...(treasureConfig.enabled ? { treasureState: ensureTreasureState() } : {}),
        };
        this.prepareReinforcementPhase(gameState, treasureConfig);
        return gameState;
    }
    async processAction(gameState, action) {
        const newState = { ...gameState };
        newState.version = (newState.version ?? 0) + 1;
        switch (action.type) {
            case 'deploy':
                return { gameState: this.handleDeploy(newState, action) };
            case 'attack': {
                const battleResult = await this.handleAttack(newState, action);
                return { gameState: newState, battleResult };
            }
            case 'fortify':
                return { gameState: this.handleFortify(newState, action) };
            case 'transfer_conquest': {
                const { fromTerritoryId, toTerritoryId, armies } = action.payload;
                const updated = this.transferConquestArmies(newState, action.playerId, fromTerritoryId, toTerritoryId, armies);
                return { gameState: updated };
            }
            case 'undo_fortify':
                return { gameState: this.handleUndoFortify(newState, action) };
            case 'end_turn':
                return { gameState: this.handleEndTurn(newState) };
            case 'trade_cards':
                return { gameState: this.handleTradeCards(newState, action) };
            case 'go_back_to_reinforcement':
                return { gameState: this.handleGoBackToReinforcement(newState) };
            default: {
                const _exhaustiveCheck = action;
                throw new Error(`Unknown action type received in game engine`);
            }
        }
    }
    validateAction(gameState, action) {
        if (action.playerId !== gameState.currentPlayer) {
            return false;
        }
        switch (action.type) {
            case 'deploy':
                return this.validateDeploy(gameState, action);
            case 'attack':
                return this.validateAttack(gameState, action);
            case 'fortify':
                return this.validateFortify(gameState, action);
            case 'transfer_conquest':
                return true;
            case 'undo_fortify':
                return this.validateUndoFortify(gameState, action);
            case 'end_turn': {
                if (gameState.mustCashInTreasures) {
                    return false;
                }
                if (gameState.phase === 'reinforcement') {
                    const player = gameState.players.find((p) => p.id === action.playerId);
                    if (player && player.armies > 0) {
                        return false;
                    }
                }
                return true;
            }
            case 'trade_cards':
                return this.validateTreasureTrade(gameState, action);
            case 'go_back_to_reinforcement':
                return gameState.phase === 'attack' && !gameState.hasAttackedThisTurn;
            default:
                return false;
        }
    }
    createPlayers(playerConfigs) {
        const fallbackPalette = [
            '#DC2626',
            '#851D2D',
            '#EC4899',
            '#EA580C',
            '#F59E0B',
            '#014421',
            '#059669',
            '#2563EB',
            '#06B6D4',
            '#7C3AED',
            '#918151',
            '#5C4033',
        ];
        const namedPalette = {
            red: '#DC2626',
            blue: '#2563EB',
            green: '#059669',
            yellow: '#F59E0B',
            purple: '#7C3AED',
            orange: '#EA580C',
            cyan: '#06B6D4',
            pink: '#EC4899',
            brown: '#5C4033',
            lime: '#014421',
            indigo: '#7C3AED',
            teal: '#06B6D4',
        };
        const assigned = new Set();
        const colorKey = (value) => {
            const trimmed = value.trim();
            if (trimmed.startsWith('#')) {
                return trimmed.toUpperCase();
            }
            return trimmed.toLowerCase();
        };
        const normalizeColor = (value) => {
            if (!value || typeof value !== 'string') {
                return null;
            }
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }
            if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed)) {
                return trimmed.toUpperCase();
            }
            const mapped = namedPalette[trimmed.toLowerCase()];
            if (mapped) {
                return mapped;
            }
            return trimmed;
        };
        const resolveColor = (candidate, fallbackIndex) => {
            const normalized = normalizeColor(candidate);
            if (normalized) {
                const key = colorKey(normalized);
                if (!assigned.has(key)) {
                    assigned.add(key);
                    return normalized;
                }
            }
            for (const fallback of fallbackPalette) {
                const key = colorKey(fallback);
                if (!assigned.has(key)) {
                    assigned.add(key);
                    return fallback;
                }
            }
            const fallback = fallbackPalette[fallbackIndex % fallbackPalette.length];
            assigned.add(colorKey(fallback));
            return fallback;
        };
        return playerConfigs.map((player, index) => {
            const base = {
                id: player.userId,
                username: player.username || `Player ${index + 1}`,
                color: resolveColor(player.color, index),
                armies: this.calculateInitialArmies(playerConfigs.length),
                territories: [],
                cards: [],
                isEliminated: false,
                teamId: typeof player.teamId === 'number' && !Number.isNaN(player.teamId) && player.teamId > 0
                    ? player.teamId
                    : null,
                isAi: player.isAi === true,
                aiDifficulty: player.aiDifficulty ?? null,
                aiPersonalitySeed: typeof player.aiPersonalitySeed === 'number' && Number.isFinite(player.aiPersonalitySeed)
                    ? Math.trunc(player.aiPersonalitySeed)
                    : (player.aiPersonalitySeed ?? null),
                treasures: [],
                mustCashInTreasures: false,
            };
            const maybeSkill = typeof player.skillRating === 'number' && Number.isFinite(player.skillRating)
                ? Math.trunc(player.skillRating)
                : undefined;
            return {
                ...base,
                ...(maybeSkill !== undefined ? { skillRating: maybeSkill } : {}),
            };
        });
    }
    calculateInitialArmies(playerCount) {
        const armyMap = {
            2: 40,
            3: 35,
            4: 30,
            5: 25,
            6: 20,
        };
        return armyMap[playerCount] || 20;
    }
    ensureTreasureConfig(gameConfig) {
        const normalized = normalizeTreasureConfig(gameConfig.treasureConfig);
        gameConfig.treasureConfig = normalized;
        return normalized;
    }
    getPlayerTreasureHand(player) {
        if (!player.treasures) {
            player.treasures = [];
        }
        return player.treasures;
    }
    updateCurrentPlayerCashRequirement(gameState, treasureConfig) {
        if (!treasureConfig.enabled) {
            gameState.mustCashInTreasures = false;
            return;
        }
        const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer);
        if (!currentPlayer) {
            gameState.mustCashInTreasures = false;
            return;
        }
        const hand = this.getPlayerTreasureHand(currentPlayer);
        const hasValidSet = findRedeemableSets(hand).length > 0;
        currentPlayer.mustCashInTreasures = hand.length >= treasureConfig.handCap && hasValidSet;
        gameState.mustCashInTreasures = currentPlayer.mustCashInTreasures ?? false;
    }
    maybeAwardTreasureForConquest(gameState, player, treasureConfig) {
        if (!treasureConfig.enabled || !gameState.conqueredDuringTurn) {
            return;
        }
        const treasureState = ensureTreasureState(gameState.treasureState);
        const treasure = drawTreasure(treasureConfig);
        const hand = this.getPlayerTreasureHand(player);
        hand.push(treasure);
        gameState.treasureState = treasureState;
        treasureMetrics.recordDraw(treasureConfig, treasure);
        if (hand.length >= treasureConfig.handCap) {
            player.mustCashInTreasures = findRedeemableSets(hand).length > 0;
        }
    }
    transferEliminatedTreasures(gameState, eliminatorId, treasureConfig, eliminatedPlayerIds = []) {
        if (!treasureConfig.enabled || eliminatedPlayerIds.length === 0) {
            return;
        }
        const eliminator = gameState.players.find((p) => p.id === eliminatorId);
        if (!eliminator) {
            return;
        }
        const eliminatorHand = this.getPlayerTreasureHand(eliminator);
        let transferred = 0;
        for (const playerId of eliminatedPlayerIds) {
            const eliminated = gameState.players.find((p) => p.id === playerId);
            if (!eliminated || !eliminated.treasures || eliminated.treasures.length === 0) {
                continue;
            }
            eliminatorHand.push(...eliminated.treasures);
            transferred += eliminated.treasures.length;
            eliminated.treasures = [];
            eliminated.mustCashInTreasures = false;
        }
        if (transferred > 0 && eliminatorHand.length >= treasureConfig.handCap) {
            const hasValidSet = findRedeemableSets(eliminatorHand).length > 0;
            eliminator.mustCashInTreasures = hasValidSet;
            if (hasValidSet && eliminator.id === gameState.currentPlayer) {
                gameState.mustCashInTreasures = true;
            }
        }
    }
    randomizePlayerOrder(players) {
        const shuffleInPlace = (items) => {
            for (let index = items.length - 1; index > 0; index -= 1) {
                const swapIndex = Math.floor(Math.random() * (index + 1));
                [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
            }
        };
        const teamBuckets = new Map();
        const soloPlayers = [];
        for (const player of players) {
            const teamId = typeof player.teamId === 'number' && Number.isFinite(player.teamId) && player.teamId > 0
                ? Math.trunc(player.teamId)
                : null;
            if (teamId) {
                const bucket = teamBuckets.get(teamId);
                if (bucket) {
                    bucket.push(player);
                }
                else {
                    teamBuckets.set(teamId, [player]);
                }
            }
            else {
                soloPlayers.push(player);
            }
        }
        if (teamBuckets.size <= 1) {
            shuffleInPlace(players);
            return;
        }
        const rotation = [];
        for (const [, members] of teamBuckets) {
            const copy = [...members];
            shuffleInPlace(copy);
            rotation.push({ members: copy });
        }
        for (const solo of soloPlayers) {
            rotation.push({ members: [solo] });
        }
        shuffleInPlace(rotation);
        const ordered = [];
        let madeProgress = true;
        while (madeProgress) {
            madeProgress = false;
            for (const bucket of rotation) {
                const next = bucket.members.shift();
                if (next) {
                    ordered.push(next);
                    madeProgress = true;
                }
            }
        }
        if (ordered.length !== players.length) {
            const remaining = players.filter((player) => !ordered.includes(player));
            shuffleInPlace(remaining);
            ordered.push(...remaining);
        }
        players.splice(0, players.length, ...ordered);
    }
    shuffleArray(items) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
    }
    assignAssassinationTargets(players) {
        const eligible = players.filter((player) => !player.isEliminated);
        if (eligible.length < 2) {
            return undefined;
        }
        const shuffled = [...eligible];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const assignments = {};
        for (let i = 0; i < shuffled.length; i++) {
            const hunter = shuffled[i];
            const target = shuffled[(i + 1) % shuffled.length];
            assignments[hunter.id] = target.id;
        }
        return assignments;
    }
    normalizeKingOfTheHillConfig(config, territories) {
        const territoryIds = territories.map((territory) => territory.id);
        const territoryIdSet = new Set(territoryIds);
        const eligibleSource = Array.isArray(config?.eligibleTerritories)
            ? config.eligibleTerritories
            : config?.eligibleTerritoryIds;
        const eligibleSet = new Set((eligibleSource && eligibleSource.length > 0 ? eligibleSource : territoryIds).filter((id) => territoryIdSet.has(id)));
        if (eligibleSet.size === 0) {
            for (const id of territoryIds) {
                eligibleSet.add(id);
            }
        }
        const rawRotationOrder = Array.isArray(config?.rotationOrder) ? config.rotationOrder : [];
        const rotationOrder = [];
        const seenRotation = new Set();
        for (const id of rawRotationOrder) {
            if (typeof id !== 'string' || !eligibleSet.has(id) || seenRotation.has(id)) {
                continue;
            }
            seenRotation.add(id);
            rotationOrder.push(id);
        }
        const targetPoints = Math.max(1, Math.floor(config?.targetPoints ?? 10));
        const neutralArmies = Math.max(1, Math.floor(config?.neutralArmies ?? 8));
        const previewTurns = Math.max(0, Math.floor(config?.previewTurns ?? 2));
        const rawInterval = typeof config?.rotationInterval === 'number' && Number.isFinite(config.rotationInterval)
            ? Math.floor(config.rotationInterval)
            : null;
        const rotationInterval = rawInterval && rawInterval > 0 ? rawInterval : null;
        return {
            targetPoints,
            neutralArmies,
            previewTurns,
            rotationInterval,
            eligibleTerritoryIds: Array.from(eligibleSet),
            rotationOrder,
        };
    }
    createInitialHillRotation(territories, config) {
        const territoryIds = territories.map((territory) => territory.id);
        const territoryIdSet = new Set(territoryIds);
        const eligiblePool = config.eligibleTerritoryIds && config.eligibleTerritoryIds.length > 0
            ? config.eligibleTerritoryIds.filter((id) => territoryIdSet.has(id))
            : territoryIds;
        if (eligiblePool.length === 0) {
            return null;
        }
        let rotationPool;
        const eligiblePoolSet = new Set(eligiblePool);
        if (config.rotationOrder && config.rotationOrder.length > 0) {
            const uniqueOrder = [];
            const seen = new Set();
            for (const id of config.rotationOrder) {
                if (typeof id !== 'string' || !eligiblePoolSet.has(id) || seen.has(id)) {
                    continue;
                }
                seen.add(id);
                uniqueOrder.push(id);
            }
            const remaining = eligiblePool.filter((id) => !seen.has(id));
            rotationPool = [...uniqueOrder, ...remaining];
        }
        else {
            rotationPool = [...eligiblePool];
            this.shuffleArray(rotationPool);
        }
        const current = rotationPool.shift() ?? eligiblePool[0];
        const queue = rotationPool;
        return { current, queue };
    }
    prepareInitialHillTerritory(territories, players, config, hillId) {
        const hillTerritory = territories.find((territory) => territory.id === hillId);
        if (!hillTerritory) {
            return;
        }
        const previousOwner = hillTerritory.ownerId;
        hillTerritory.ownerId = 'neutral';
        hillTerritory.armies = config.neutralArmies ? Math.max(1, Math.floor(config.neutralArmies)) : 8;
        if (previousOwner && previousOwner !== 'neutral') {
            const owner = players.find((player) => player.id === previousOwner);
            if (owner) {
                owner.territories = owner.territories.filter((territoryId) => territoryId !== hillId);
            }
        }
    }
    createInitialKingOfTheHillState(config, rotation) {
        const rotationInterval = typeof config.rotationInterval === 'number' && config.rotationInterval > 0
            ? config.rotationInterval
            : null;
        const previewTurns = Math.max(0, config.previewTurns ?? 0);
        return {
            currentHillTerritoryId: rotation.current,
            points: {},
            targetPoints: Math.max(1, config.targetPoints ?? 10),
            rotationInterval,
            turnsUntilRotation: rotationInterval ?? null,
            upcomingHillTerritoryId: rotation.queue.length > 0 ? rotation.queue[0] : null,
            previewTurns,
            neutralArmies: Math.max(1, config.neutralArmies ?? 8),
            rotationQueue: [...rotation.queue],
            ...(Array.isArray(config.eligibleTerritoryIds)
                ? { eligibleTerritoryIds: [...config.eligibleTerritoryIds] }
                : {}),
        };
    }
    handleKingOfTheHillRoundComplete(gameState) {
        const state = gameState.kingOfTheHillState;
        if (!state) {
            return;
        }
        if (state.lastScoreTurn === gameState.turn) {
            return;
        }
        state.lastScoreTurn = gameState.turn;
        const hillTerritory = gameState.board.find((territory) => territory.id === state.currentHillTerritoryId);
        if (hillTerritory) {
            const ownerId = hillTerritory.ownerId;
            if (ownerId && ownerId !== 'neutral') {
                const owner = gameState.players.find((player) => player.id === ownerId);
                if (owner && !owner.isEliminated) {
                    state.points[owner.id] = (state.points[owner.id] ?? 0) + 1;
                    if (this.isKingOfTheHillVictory(gameState, owner)) {
                        this.endGame(gameState, owner);
                    }
                }
            }
        }
        if (gameState.phase !== 'finished') {
            this.progressKingOfTheHillRotation(gameState);
        }
    }
    progressKingOfTheHillRotation(gameState) {
        const state = gameState.kingOfTheHillState;
        if (!state || !state.rotationInterval || state.rotationInterval <= 0) {
            return;
        }
        const remaining = typeof state.turnsUntilRotation === 'number'
            ? state.turnsUntilRotation - 1
            : state.rotationInterval - 1;
        if (remaining <= 0) {
            this.rotateKingOfTheHill(gameState);
        }
        else {
            state.turnsUntilRotation = remaining;
            if (state.rotationQueue && state.rotationQueue.length > 0) {
                state.upcomingHillTerritoryId = state.rotationQueue[0] ?? null;
            }
        }
    }
    rotateKingOfTheHill(gameState) {
        const state = gameState.kingOfTheHillState;
        if (!state || !state.rotationInterval || state.rotationInterval <= 0) {
            return;
        }
        const queue = state.rotationQueue ? [...state.rotationQueue] : [];
        if (queue.length === 0) {
            queue.push(...this.refillHillRotationQueue(gameState));
        }
        if (queue.length === 0) {
            state.turnsUntilRotation = state.rotationInterval;
            state.upcomingHillTerritoryId = null;
            return;
        }
        const nextHill = queue.shift();
        if (!nextHill) {
            state.turnsUntilRotation = state.rotationInterval;
            state.upcomingHillTerritoryId = null;
            return;
        }
        state.currentHillTerritoryId = nextHill;
        state.rotationQueue = queue;
        this.ensureHillNeutralDefenders(gameState, nextHill);
        if (!state.rotationQueue || state.rotationQueue.length === 0) {
            state.rotationQueue = this.refillHillRotationQueue(gameState);
        }
        state.turnsUntilRotation = state.rotationInterval;
        state.upcomingHillTerritoryId =
            state.rotationQueue && state.rotationQueue.length > 0 ? state.rotationQueue[0] : null;
    }
    refillHillRotationQueue(gameState) {
        const state = gameState.kingOfTheHillState;
        if (!state) {
            return [];
        }
        const eligibleIds = state.eligibleTerritoryIds && state.eligibleTerritoryIds.length > 0
            ? state.eligibleTerritoryIds
            : gameState.board.map((territory) => territory.id);
        const pool = [];
        const seen = new Set();
        for (const id of eligibleIds) {
            if (id === state.currentHillTerritoryId || seen.has(id)) {
                continue;
            }
            seen.add(id);
            pool.push(id);
        }
        this.shuffleArray(pool);
        return pool;
    }
    ensureHillNeutralDefenders(gameState, territoryId) {
        const state = gameState.kingOfTheHillState;
        if (!state) {
            return;
        }
        const territory = gameState.board.find((t) => t.id === territoryId);
        if (!territory) {
            return;
        }
        if (!territory.ownerId || territory.ownerId === 'neutral') {
            territory.ownerId = 'neutral';
            if (typeof territory.armies !== 'number' || territory.armies < state.neutralArmies) {
                territory.armies = state.neutralArmies;
            }
        }
    }
    isKingOfTheHillVictory(gameState, player) {
        const state = gameState.kingOfTheHillState;
        if (!state) {
            return false;
        }
        const target = Math.max(1, state.targetPoints ?? 0);
        const playerPoints = state.points[player.id] ?? 0;
        if (playerPoints >= target) {
            return true;
        }
        if (!gameState.gameConfig.allowTeamPlay) {
            return false;
        }
        const teamId = this.getPlayerTeam(gameState, player.id);
        if (!teamId) {
            return false;
        }
        let total = 0;
        for (const teammate of gameState.players) {
            if (teammate.isEliminated) {
                continue;
            }
            if (this.getPlayerTeam(gameState, teammate.id) === teamId) {
                total += state.points[teammate.id] ?? 0;
                if (total >= target) {
                    return true;
                }
            }
        }
        return false;
    }
    distributeTerritoriesWithNeutrals(territories, players) {
        const territoriesPerPlayer = Math.floor(territories.length / (players.length + 1));
        const shuffledTerritories = [...territories];
        for (let i = shuffledTerritories.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledTerritories[i], shuffledTerritories[j]] = [
                shuffledTerritories[j],
                shuffledTerritories[i],
            ];
        }
        let territoryIndex = 0;
        for (const player of players) {
            for (let i = 0; i < territoriesPerPlayer; i++) {
                if (territoryIndex < shuffledTerritories.length) {
                    const territory = shuffledTerritories[territoryIndex];
                    territory.ownerId = player.id;
                    territory.armies = 3;
                    player.territories.push(territory.id);
                    territoryIndex++;
                }
            }
        }
        while (territoryIndex < shuffledTerritories.length) {
            const territory = shuffledTerritories[territoryIndex];
            territory.ownerId = 'neutral';
            territory.armies = 3;
            territoryIndex++;
        }
    }
    deployInitialArmies(territories, players, gameConfig) {
        for (const player of players) {
            player.armies = this.calculateReinforcementArmies(player.territories, territories, gameConfig);
        }
    }
    calculateReinforcementArmies(playerTerritories, allTerritories, gameConfig) {
        const territoryCount = playerTerritories.length;
        let armies = Math.max(3, Math.floor(territoryCount / 3));
        armies += this.calculateSectorBonuses(playerTerritories, allTerritories, gameConfig);
        return armies;
    }
    calculateSectorBonuses(playerTerritories, allTerritories, gameConfig) {
        let bonusArmies = 0;
        const configuredBonuses = gameConfig
            ? gameConfig.continentBonuses !== undefined
                ? gameConfig.continentBonuses
                : gameConfig.sectorBonuses
            : undefined;
        if (Array.isArray(configuredBonuses) && configuredBonuses.length > 0) {
            for (const sector of configuredBonuses) {
                const playerOwnsAll = sector.territories.every((territoryId) => playerTerritories.includes(territoryId));
                if (playerOwnsAll) {
                    bonusArmies += sector.bonusArmies;
                }
            }
        }
        else {
            const classicSectorBonuses = {
                'north-america': 5,
                'south-america': 2,
                europe: 5,
                asia: 7,
                africa: 3,
                australia: 2,
            };
            const sectors = {};
            for (const territory of allTerritories) {
                const sec = (territory.sector || territory.continent || 'unknown');
                if (!sectors[sec]) {
                    sectors[sec] = [];
                }
                sectors[sec].push(territory.id);
            }
            for (const [sector, territories] of Object.entries(sectors)) {
                const playerOwnsAll = territories.every((territoryId) => playerTerritories.includes(territoryId));
                if (playerOwnsAll && classicSectorBonuses[sector]) {
                    bonusArmies += classicSectorBonuses[sector];
                }
            }
        }
        return bonusArmies;
    }
    handleDeploy(gameState, action) {
        const { territoryId, armies } = action.payload;
        const territory = gameState.board.find((t) => t.id === territoryId);
        if (territory && this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId)) {
            const baseline = gameState.reinforcementBaseline?.[territoryId];
            if (typeof baseline === 'number' && armies < 0) {
                const allowedUndo = Math.max(0, territory.armies - baseline);
                const requested = Math.abs(armies);
                const actual = Math.min(allowedUndo, requested);
                territory.armies = Math.max(baseline, territory.armies - actual);
                const player = gameState.players.find((p) => p.id === action.playerId);
                if (player)
                    player.armies += actual;
                const entry = {
                    playerId: action.playerId,
                    territoryId,
                    armies: -actual,
                    ts: Date.now(),
                };
                gameState.reinforcementHistory = [...(gameState.reinforcementHistory ?? []), entry];
            }
            else {
                territory.armies += armies;
                const player = gameState.players.find((p) => p.id === action.playerId);
                if (player) {
                    player.armies -= armies;
                    if (player.armies <= 0) {
                        player.armies = 0;
                        if (gameState.phase === 'reinforcement') {
                            const resumePhase = gameState.resumePhaseAfterReinforcement;
                            if (resumePhase && resumePhase !== 'reinforcement') {
                                gameState.phase = resumePhase;
                                if (resumePhase === 'attack') {
                                    gameState.hasAttackedThisTurn =
                                        gameState.resumeHasAttackedAfterReinforcement ??
                                            gameState.hasAttackedThisTurn ??
                                            false;
                                }
                            }
                            else {
                                gameState.phase = 'attack';
                                gameState.hasAttackedThisTurn = false;
                            }
                            gameState.resumePhaseAfterReinforcement = null;
                            delete gameState.resumeHasAttackedAfterReinforcement;
                        }
                    }
                }
                const entry = {
                    playerId: action.playerId,
                    territoryId,
                    armies,
                    ts: Date.now(),
                };
                gameState.reinforcementHistory = [...(gameState.reinforcementHistory ?? []), entry];
            }
        }
        return gameState;
    }
    async handleAttack(gameState, action) {
        const { fromTerritoryId, toTerritoryId } = action.payload;
        const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId);
        const toTerritory = gameState.board.find((t) => t.id === toTerritoryId);
        if (!fromTerritory || !toTerritory) {
            throw new Error('Invalid territories for attack');
        }
        if (gameState.phase !== 'attack') {
            throw new Error('Cannot attack outside of attack phase');
        }
        if (fromTerritory.armies <= 1) {
            throw new Error('Not enough armies to attack');
        }
        const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig);
        gameState.hasAttackedThisTurn = true;
        let _attackBonus = 0;
        let _defenseBonus = 0;
        if (gameState.gameConfig?.useTerritoryModifiers && gameState.roomId) {
            let gameModifiers = this.gameModifiersCache.get(gameState.roomId);
            if (!gameModifiers) {
                gameModifiers = await territoryModifierService.getGameModifiers(gameState.roomId);
                this.gameModifiersCache.set(gameState.roomId, gameModifiers);
            }
            const attackerModifier = gameModifiers.get(fromTerritoryId);
            const defenderModifier = gameModifiers.get(toTerritoryId);
            if (attackerModifier) {
                _attackBonus = attackerModifier.attack_bonus;
            }
            if (defenderModifier) {
                _defenseBonus = defenderModifier.defense_bonus;
            }
        }
        const attackerDiceCount = Math.max(1, Math.min(3, fromTerritory.armies - 1));
        const defenderDiceCount = Math.max(1, Math.min(2, toTerritory.armies));
        const battleResult = this.simulateBattle(gameState, attackerDiceCount, defenderDiceCount);
        fromTerritory.armies = Math.max(1, fromTerritory.armies - battleResult.attackerLosses);
        toTerritory.armies = Math.max(0, toTerritory.armies - battleResult.defenderLosses);
        const conquered = toTerritory.armies === 0;
        if (conquered) {
            const attacker = gameState.players.find((p) => p.id === action.playerId);
            const defender = gameState.players.find((p) => p.id === toTerritory.ownerId);
            if (attacker && defender) {
                defender.territories = defender.territories.filter((t) => t !== toTerritoryId);
                attacker.territories.push(toTerritoryId);
                this.getPlayerTreasureHand(attacker);
            }
            toTerritory.ownerId = action.playerId;
            toTerritory.armies = 1;
            fromTerritory.armies -= 1;
            gameState.conqueredDuringTurn = true;
        }
        const result = {
            ...battleResult,
            conquered,
            fromTerritory: {
                id: fromTerritory.id,
                name: fromTerritory.name,
                armies: fromTerritory.armies,
            },
            toTerritory: {
                id: toTerritory.id,
                name: toTerritory.name,
                armies: toTerritory.armies,
                ownerId: toTerritory.ownerId ?? action.playerId,
            },
            pendingConquestFor: conquered ? action.playerId : null,
        };
        gameState.lastBattleResult = result;
        if (conquered) {
            const gameEndCheck = this.checkGameEnd(gameState);
            result.gameEnded = gameEndCheck.gameEnded;
            result.winner = gameEndCheck.winner;
            result.eliminatedPlayers = gameEndCheck.eliminatedPlayers;
            this.transferEliminatedTreasures(gameState, action.playerId, treasureConfig, gameEndCheck.eliminatedPlayers ?? []);
            this.updateCurrentPlayerCashRequirement(gameState, treasureConfig);
        }
        return result;
    }
    transferConquestArmies(gameState, playerId, fromTerritoryId, toTerritoryId, armies) {
        if (gameState.phase !== 'attack') {
            throw new Error('Can only transfer armies immediately after an attack');
        }
        const lastBattle = gameState.lastBattleResult;
        if (!lastBattle || !lastBattle.conquered) {
            throw new Error('No conquest available for transfer');
        }
        if (lastBattle.pendingConquestFor === null) {
            throw new Error('Conquest transfer already completed');
        }
        if (lastBattle.pendingConquestFor && lastBattle.pendingConquestFor !== playerId) {
            throw new Error('Only the conquering player can transfer armies');
        }
        const expectedFrom = lastBattle.fromTerritory.id;
        const expectedTo = lastBattle.toTerritory.id;
        if (expectedFrom !== fromTerritoryId || expectedTo !== toTerritoryId) {
            throw new Error('Transfer must match the most recent conquest');
        }
        const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId);
        const toTerritory = gameState.board.find((t) => t.id === toTerritoryId);
        if (!fromTerritory || !toTerritory) {
            throw new Error('Territory not found for conquest transfer');
        }
        if (fromTerritory.ownerId !== playerId || toTerritory.ownerId !== playerId) {
            throw new Error('You must control both territories to transfer armies');
        }
        if (!fromTerritory.adjacentTerritories.includes(toTerritory.id)) {
            throw new Error('Conquest transfer requires adjacent territories');
        }
        if (!Number.isInteger(armies) || armies < 0 || armies >= fromTerritory.armies) {
            throw new Error('Invalid number of armies to transfer');
        }
        fromTerritory.armies -= armies;
        toTerritory.armies += armies;
        const resolvedFrom = {
            id: fromTerritory.id,
            name: fromTerritory.name,
            armies: fromTerritory.armies,
        };
        const resolvedTo = {
            id: toTerritory.id,
            name: toTerritory.name,
            armies: toTerritory.armies,
            ownerId: toTerritory.ownerId ?? playerId,
        };
        gameState.lastBattleResult = {
            ...lastBattle,
            fromTerritory: resolvedFrom,
            toTerritory: resolvedTo,
            pendingConquestFor: null,
        };
        return gameState;
    }
    handleFortify(gameState, action) {
        const { fromTerritoryId, toTerritoryId, armies } = action.payload;
        if (!this.validateFortify(gameState, action)) {
            throw new Error('Invalid fortify action');
        }
        const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId);
        const toTerritory = gameState.board.find((t) => t.id === toTerritoryId);
        if (!fromTerritory || !toTerritory) {
            throw new Error('Fortification territories not found');
        }
        fromTerritory.armies -= armies;
        toTerritory.armies += armies;
        this.markTerritoryAsMoved(gameState, fromTerritoryId);
        if (!gameState.fortifyHistory) {
            gameState.fortifyHistory = [];
        }
        gameState.fortifyHistory.push({
            playerId: action.playerId,
            fromTerritoryId,
            toTerritoryId,
            armies,
            ts: Date.now(),
        });
        return gameState;
    }
    handleUndoFortify(gameState, action) {
        if (!this.validateUndoFortify(gameState, action)) {
            throw new Error('Invalid undo fortify action');
        }
        const history = gameState.fortifyHistory ?? [];
        if (history.length === 0) {
            throw new Error('No fortify moves to undo');
        }
        const lastMove = history[history.length - 1];
        const fromTerritory = gameState.board.find((t) => t.id === lastMove.fromTerritoryId);
        const toTerritory = gameState.board.find((t) => t.id === lastMove.toTerritoryId);
        if (!fromTerritory || !toTerritory) {
            throw new Error('Territories not found for undo');
        }
        fromTerritory.armies += lastMove.armies;
        toTerritory.armies -= lastMove.armies;
        if (gameState.movementTracking?.[lastMove.fromTerritoryId]) {
            delete gameState.movementTracking[lastMove.fromTerritoryId];
        }
        gameState.fortifyHistory = history.slice(0, -1);
        return gameState;
    }
    handleTradeCards(gameState, action) {
        const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig);
        if (!treasureConfig.enabled) {
            return gameState;
        }
        const player = gameState.players.find((p) => p.id === action.playerId);
        if (!player) {
            return gameState;
        }
        const previousPhase = gameState.phase;
        const selection = action.payload?.treasureSet;
        if (!Array.isArray(selection) || selection.length !== 3) {
            throw new Error('Treasure set selection is required');
        }
        const indices = selection.map((value) => Number(value));
        if (indices.some((value) => Number.isNaN(value))) {
            throw new Error('Treasure indices must be numeric');
        }
        const tuple = [indices[0], indices[1], indices[2]];
        const treasureState = ensureTreasureState(gameState.treasureState);
        const result = redeemSet(this.getPlayerTreasureHand(player), tuple, treasureConfig, treasureState);
        player.treasures = result.updatedHand;
        player.armies += result.troops;
        const remainingMatches = findRedeemableSets(result.updatedHand);
        player.mustCashInTreasures =
            result.updatedHand.length >= treasureConfig.handCap && remainingMatches.length > 0;
        gameState.treasureState = result.updatedState;
        if (result.troops > 0 && previousPhase !== 'reinforcement') {
            gameState.resumePhaseAfterReinforcement = previousPhase;
            gameState.resumeHasAttackedAfterReinforcement = gameState.hasAttackedThisTurn ?? false;
            gameState.phase = 'reinforcement';
            this.refreshReinforcementTracking(gameState);
        }
        else if (previousPhase === 'reinforcement') {
            gameState.resumePhaseAfterReinforcement = null;
            delete gameState.resumeHasAttackedAfterReinforcement;
        }
        treasureMetrics.recordCash(treasureConfig, result.hasDiamond);
        this.updateCurrentPlayerCashRequirement(gameState, treasureConfig);
        return gameState;
    }
    handleEndTurn(gameState) {
        switch (gameState.phase) {
            case 'reinforcement':
                gameState.phase = 'attack';
                gameState.hasAttackedThisTurn = false;
                gameState.reinforcementHistory = [];
                delete gameState.reinforcementBaseline;
                gameState.resumePhaseAfterReinforcement = null;
                delete gameState.resumeHasAttackedAfterReinforcement;
                break;
            case 'attack':
                gameState.phase = 'fortify';
                this.resetMovementTracking(gameState);
                gameState.fortifyHistory = [];
                break;
            case 'fortify':
                this.endPlayerTurn(gameState);
                break;
        }
        return gameState;
    }
    endPlayerTurn(gameState) {
        const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig);
        const currentPlayerIndex = gameState.players.findIndex((p) => p.id === gameState.currentPlayer);
        const currentPlayer = gameState.players[currentPlayerIndex];
        if (currentPlayer) {
            this.getPlayerTreasureHand(currentPlayer);
            this.maybeAwardTreasureForConquest(gameState, currentPlayer, treasureConfig);
        }
        gameState.conqueredDuringTurn = false;
        this.updateEliminatedPlayers(gameState);
        const activePlayers = gameState.players.filter((p) => !p.isEliminated);
        if (activePlayers.length <= 1) {
            this.endGame(gameState, activePlayers[0] || null);
            return;
        }
        let nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
        while (gameState.players[nextPlayerIndex].isEliminated) {
            nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
        }
        gameState.currentPlayer = gameState.players[nextPlayerIndex].id;
        gameState.hasAttackedThisTurn = false;
        delete gameState.lastBattleResult;
        const firstActivePlayerIndex = gameState.players.findIndex((p) => !p.isEliminated);
        if (nextPlayerIndex === firstActivePlayerIndex) {
            this.handleKingOfTheHillRoundComplete(gameState);
            if (gameState.phase === 'finished') {
                return;
            }
            gameState.turn += 1;
        }
        gameState.phase = 'reinforcement';
        this.prepareReinforcementPhase(gameState, treasureConfig);
    }
    refreshReinforcementTracking(gameState) {
        try {
            const baseline = {};
            for (const territory of gameState.board) {
                if (territory.ownerId === gameState.currentPlayer) {
                    baseline[territory.id] = Math.max(0, Math.trunc(territory.armies));
                }
            }
            gameState.reinforcementBaseline = baseline;
        }
        catch {
            gameState.reinforcementBaseline = {};
        }
        gameState.reinforcementHistory = [];
    }
    prepareReinforcementPhase(gameState, providedTreasureConfig) {
        const treasureConfig = providedTreasureConfig ?? this.ensureTreasureConfig(gameState.gameConfig);
        const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer);
        if (currentPlayer) {
            currentPlayer.armies = this.calculateReinforcementArmies(currentPlayer.territories, gameState.board, gameState.gameConfig);
        }
        this.refreshReinforcementTracking(gameState);
        gameState.resumePhaseAfterReinforcement = null;
        delete gameState.resumeHasAttackedAfterReinforcement;
        if (treasureConfig.enabled) {
            gameState.treasureState = ensureTreasureState(gameState.treasureState);
            if (currentPlayer) {
                this.getPlayerTreasureHand(currentPlayer);
            }
        }
        else {
            delete gameState.treasureState;
        }
        this.updateCurrentPlayerCashRequirement(gameState, treasureConfig);
        gameState.conqueredDuringTurn = false;
    }
    getValidFortifyTargets(gameState, fromTerritoryId, playerId) {
        const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId);
        if (!fromTerritory || fromTerritory.ownerId !== playerId || fromTerritory.armies <= 1) {
            return [];
        }
        const _movementType = gameState.gameConfig.movementType;
        const validTargets = [];
        for (const territory of gameState.board) {
            if (!this.canMoveTo(territory, playerId, gameState))
                continue;
            if (territory.id === fromTerritoryId)
                continue;
            if (this.validateMovementByType(gameState, fromTerritoryId, territory.id, playerId)) {
                validTargets.push(territory.id);
            }
        }
        return validTargets;
    }
    calculateBaseReinforcementArmies(gameState, playerId) {
        const player = gameState.players.find((p) => p.id === playerId);
        if (!player) {
            return 0;
        }
        return this.calculateReinforcementArmies(player.territories, gameState.board, gameState.gameConfig);
    }
    advancePhase(gameState) {
        return this.handleEndTurn(gameState);
    }
    handleGoBackToReinforcement(gameState) {
        if (gameState.phase === 'attack' && !gameState.hasAttackedThisTurn) {
            gameState.phase = 'reinforcement';
            const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer);
            if (currentPlayer) {
                const baseReinforcements = this.calculateReinforcementArmies(currentPlayer.territories, gameState.board, gameState.gameConfig);
                const history = (gameState.reinforcementHistory ?? []).filter((entry) => entry.playerId === currentPlayer.id);
                const netPlacements = history.reduce((sum, entry) => sum + entry.armies, 0);
                const remaining = Math.max(0, baseReinforcements - netPlacements);
                currentPlayer.armies = remaining;
            }
        }
        return gameState;
    }
    validateDeploy(gameState, action) {
        const { territoryId, armies } = action.payload;
        const player = gameState.players.find((p) => p.id === action.playerId);
        const territory = gameState.board.find((t) => t.id === territoryId);
        if (!player || !territory || gameState.phase !== 'reinforcement')
            return false;
        if (armies > 0 && gameState.mustCashInTreasures) {
            return false;
        }
        if (armies > 0) {
            if (player.armies < armies)
                return false;
            return this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId);
        }
        if (armies < 0) {
            const baseline = gameState.reinforcementBaseline?.[territoryId];
            if (typeof baseline !== 'number')
                return false;
            const available = Math.max(0, territory.armies - baseline);
            const requested = Math.abs(armies);
            if (requested <= 0)
                return false;
            if (available <= 0)
                return false;
            return this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId);
        }
        return false;
    }
    isFriendlyTerritory(gameState, playerId, ownerId) {
        if (!ownerId) {
            return false;
        }
        if (ownerId === playerId) {
            return true;
        }
        if (ownerId === 'neutral') {
            return false;
        }
        return this.arePlayersTeammates(gameState, playerId, ownerId);
    }
    validateAttack(gameState, action) {
        if (gameState.mustCashInTreasures) {
            return false;
        }
        const { fromTerritoryId, toTerritoryId, armies = 0 } = action.payload;
        const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId);
        const toTerritory = gameState.board.find((t) => t.id === toTerritoryId);
        if (gameState.phase !== 'attack') {
            return false;
        }
        if (toTerritory && this.arePlayersTeammates(gameState, action.playerId, toTerritory.ownerId)) {
            return false;
        }
        const hasEnoughArmies = fromTerritory ? fromTerritory.armies >= 2 : false;
        const armiesOk = typeof armies === 'number' && armies > 0
            ? fromTerritory
                ? armies <= Math.max(0, fromTerritory.armies - 1)
                : false
            : true;
        return !!(fromTerritory &&
            toTerritory &&
            gameState.currentPlayer === action.playerId &&
            gameState.phase === 'attack' &&
            fromTerritory.ownerId === action.playerId &&
            toTerritory.ownerId !== action.playerId &&
            hasEnoughArmies &&
            armiesOk &&
            fromTerritory.adjacentTerritories.includes(toTerritoryId));
    }
    validateFortify(gameState, action) {
        const { fromTerritoryId, toTerritoryId, armies } = action.payload;
        const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId);
        const toTerritory = gameState.board.find((t) => t.id === toTerritoryId);
        if (!fromTerritory || !toTerritory)
            return false;
        if (fromTerritory.ownerId !== action.playerId)
            return false;
        if (!this.canMoveTo(toTerritory, action.playerId, gameState))
            return false;
        if (fromTerritory.armies <= armies)
            return false;
        if (armies <= 0)
            return false;
        if (armies > 1_000_000)
            return false;
        if (gameState.phase !== 'fortify')
            return false;
        return this.validateMovementByType(gameState, fromTerritoryId, toTerritoryId, action.playerId);
    }
    validateUndoFortify(gameState, action) {
        if (gameState.phase !== 'fortify')
            return false;
        if (action.playerId !== gameState.currentPlayer)
            return false;
        const history = gameState.fortifyHistory ?? [];
        if (history.length === 0)
            return false;
        const lastMove = history[history.length - 1];
        if (lastMove.playerId !== action.playerId)
            return false;
        return true;
    }
    validateTreasureTrade(gameState, action) {
        const allowedPhases = ['reinforcement', 'attack', 'fortify'];
        if (!allowedPhases.includes(gameState.phase)) {
            return false;
        }
        const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig);
        if (!treasureConfig.enabled) {
            return false;
        }
        const player = gameState.players.find((p) => p.id === action.playerId);
        if (!player) {
            return false;
        }
        const selection = action.payload?.treasureSet;
        if (!Array.isArray(selection) || selection.length !== 3) {
            return false;
        }
        const hand = this.getPlayerTreasureHand(player);
        const indices = selection.map((value) => Number(value));
        if (indices.some((value) => Number.isNaN(value))) {
            return false;
        }
        const sorted = [...indices].sort((a, b) => a - b);
        if (sorted.some((index) => index < 0 || index >= hand.length)) {
            return false;
        }
        const matches = findRedeemableSets(hand);
        return matches.some((match) => match.indices.every((value, idx) => value === sorted[idx]));
    }
    simulateBattle(gameState, attackerDiceCount, defenderDiceCount, attackBonus = 0, defenseBonus = 0) {
        let attackerDice = this.rollDice(gameState, attackerDiceCount).sort((a, b) => b - a);
        let defenderDice = this.rollDice(gameState, defenderDiceCount).sort((a, b) => b - a);
        if (attackBonus !== 0) {
            attackerDice = attackerDice.map((die) => Math.max(1, Math.min(6, die + attackBonus)));
            attackerDice.sort((a, b) => b - a);
        }
        if (defenseBonus !== 0) {
            defenderDice = defenderDice.map((die) => Math.max(1, Math.min(6, die + defenseBonus)));
            defenderDice.sort((a, b) => b - a);
        }
        let attackerLosses = 0;
        let defenderLosses = 0;
        if (attackerDice[0] > defenderDice[0]) {
            defenderLosses++;
        }
        else {
            attackerLosses++;
        }
        if (attackerDice.length > 1 && defenderDice.length > 1) {
            if (attackerDice[1] > defenderDice[1]) {
                defenderLosses++;
            }
            else {
                attackerLosses++;
            }
        }
        return {
            attackerDice,
            defenderDice,
            attackerLosses,
            defenderLosses,
        };
    }
    rollDice(gameState, count) {
        const dice = [];
        for (let i = 0; i < count; i++) {
            const r = this.nextRandom(gameState);
            dice.push(Math.floor(r * 6) + 1);
        }
        return dice;
    }
    getPlayerTeam(gameState, playerId) {
        return utilGetPlayerTeam(gameState, playerId);
    }
    arePlayersTeammates(gameState, playerA, playerB) {
        return utilArePlayersTeammates(gameState, playerA, playerB);
    }
    canMoveTo(territory, playerId, gameState) {
        if (territory.ownerId === playerId)
            return true;
        if (gameState.gameConfig.allowTeamPlay) {
            if (this.arePlayersTeammates(gameState, playerId, territory.ownerId)) {
                return true;
            }
        }
        return false;
    }
    validateMovementByType(gameState, fromId, toId, playerId) {
        const movementType = gameState.gameConfig.movementType;
        switch (movementType) {
            case 'classic_adjacent':
                return this.validateClassicAdjacent(gameState, fromId, toId, playerId);
            case 'adjacent_multi':
                return this.validateAdjacentMulti(gameState, fromId, toId, playerId);
            case 'path_single':
                return this.validatePathSingle(gameState, fromId, toId, playerId);
            case 'path_multi':
                return this.validatePathMulti(gameState, fromId, toId, playerId);
            default:
                return false;
        }
    }
    validateClassicAdjacent(gameState, fromId, toId, _playerId) {
        const fromTerritory = gameState.board.find((t) => t.id === fromId);
        if (!fromTerritory)
            return false;
        const isAdjacent = fromTerritory.adjacentTerritories.includes(toId);
        if (!isAdjacent)
            return false;
        const hasAnyMovement = Object.keys(gameState.movementTracking || {}).length > 0;
        return !hasAnyMovement;
    }
    validateAdjacentMulti(gameState, fromId, toId, _playerId) {
        const fromTerritory = gameState.board.find((t) => t.id === fromId);
        if (!fromTerritory)
            return false;
        const isAdjacent = fromTerritory.adjacentTerritories.includes(toId);
        if (!isAdjacent)
            return false;
        const hasAlreadyMoved = gameState.movementTracking?.[fromId] || false;
        return !hasAlreadyMoved;
    }
    validatePathSingle(gameState, fromId, toId, playerId) {
        const hasAnyMovement = Object.keys(gameState.movementTracking || {}).length > 0;
        if (hasAnyMovement)
            return false;
        return this.areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState);
    }
    validatePathMulti(gameState, fromId, toId, playerId) {
        const hasAlreadyMoved = gameState.movementTracking?.[fromId] || false;
        if (hasAlreadyMoved)
            return false;
        return this.areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState);
    }
    areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState) {
        if (fromId === toId)
            return true;
        const allowedTerritories = gameState.board.filter((t) => this.canUseForPathfinding(t, playerId, gameState));
        const allowedTerritoryMap = new Map(allowedTerritories.map((territory) => [territory.id, territory]));
        const visited = new Set();
        const queue = [fromId];
        let queueIndex = 0;
        while (queueIndex < queue.length) {
            const currentId = queue[queueIndex++];
            if (!currentId) {
                continue;
            }
            if (currentId === toId) {
                return true;
            }
            if (visited.has(currentId)) {
                continue;
            }
            visited.add(currentId);
            const currentTerritory = allowedTerritoryMap.get(currentId);
            if (!currentTerritory)
                continue;
            for (const adjacentId of currentTerritory.adjacentTerritories) {
                if (!visited.has(adjacentId) && allowedTerritoryMap.has(adjacentId)) {
                    queue.push(adjacentId);
                }
            }
        }
        return false;
    }
    canUseForPathfinding(territory, playerId, gameState) {
        if (territory.ownerId === playerId)
            return true;
        if (gameState.gameConfig.allowTeamPlay) {
            if (this.arePlayersTeammates(gameState, playerId, territory.ownerId)) {
                return true;
            }
        }
        return false;
    }
    resetMovementTracking(gameState) {
        gameState.movementTracking = {};
    }
    markTerritoryAsMoved(gameState, territoryId) {
        if (!gameState.movementTracking) {
            gameState.movementTracking = {};
        }
        gameState.movementTracking[territoryId] = true;
    }
    updateEliminatedPlayers(gameState) {
        const newlyEliminated = [];
        for (const player of gameState.players) {
            if (!player.isEliminated) {
                const playerTerritories = gameState.board.filter((t) => t.ownerId === player.id);
                if (playerTerritories.length === 0) {
                    player.isEliminated = true;
                    newlyEliminated.push(player.id);
                }
            }
        }
        return newlyEliminated;
    }
    endGame(gameState, winner) {
        gameState.phase = 'finished';
        if (winner) {
            gameState.currentPlayer = winner.id;
        }
    }
    resolveAssassinationVictory(gameState, eliminatedPlayers) {
        if (!gameState.assassinationTargets || eliminatedPlayers.length === 0) {
            return null;
        }
        for (const eliminatedId of eliminatedPlayers) {
            for (const [hunterId, targetId] of Object.entries(gameState.assassinationTargets)) {
                if (targetId !== eliminatedId) {
                    continue;
                }
                const hunter = gameState.players.find((player) => player.id === hunterId);
                if (hunter && !hunter.isEliminated) {
                    return hunter;
                }
            }
        }
        return null;
    }
    checkGameEnd(gameState) {
        const eliminatedPlayers = this.updateEliminatedPlayers(gameState);
        if (gameState.gameConfig.gameMode === 'assassination') {
            const winner = this.resolveAssassinationVictory(gameState, eliminatedPlayers);
            if (winner) {
                this.endGame(gameState, winner);
                return {
                    gameEnded: true,
                    winner,
                    eliminatedPlayers,
                };
            }
        }
        const activePlayers = gameState.players.filter((p) => !p.isEliminated);
        if (activePlayers.length <= 1) {
            this.endGame(gameState, activePlayers[0] || null);
            return {
                gameEnded: true,
                winner: activePlayers[0] || null,
                eliminatedPlayers,
            };
        }
        if (gameState.gameConfig.allowTeamPlay) {
            const distinctTeams = new Set();
            for (const player of activePlayers) {
                const teamId = this.getPlayerTeam(gameState, player.id);
                if (teamId) {
                    distinctTeams.add(`team-${teamId}`);
                }
                else {
                    distinctTeams.add(`player-${player.id}`);
                }
            }
            if (distinctTeams.size === 1) {
                const winner = activePlayers[0] || null;
                this.endGame(gameState, winner);
                return {
                    gameEnded: true,
                    winner,
                    eliminatedPlayers,
                };
            }
        }
        return {
            gameEnded: false,
            winner: null,
            eliminatedPlayers,
        };
    }
}
//# sourceMappingURL=gameEngine.js.map