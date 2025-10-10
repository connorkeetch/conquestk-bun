import { GameEngine } from '../game/gameEngine.js';
import { arePlayersTeammates as utilArePlayersTeammates } from '../utils/gameTeams.js';
import { findRedeemableSets, normalizeTreasureConfig } from '../game/hiddenTreasures.js';
import { filterStateForPlanner } from './fogService.js';
class AIDecisionService {
    async chooseAction(request) {
        const start = Date.now();
        if (request.budget.signal?.aborted) {
            return this.createFallbackPlan('aborted', request, start);
        }
        if (request.budget.maxThinkTimeMs <= 0) {
            return this.createFallbackPlan('timeout', request, start);
        }
        try {
            const fogMode = request.gameState.gameConfig?.fogOfWar ?? 'off';
            const effectiveState = fogMode === 'off'
                ? request.gameState
                : filterStateForPlanner(request.gameState, request.player.id);
            const plannedActions = this.generatePlan({ ...request, gameState: effectiveState });
            if (request.budget.signal?.aborted) {
                return this.createFallbackPlan('aborted', request, start);
            }
            const elapsed = Date.now() - start;
            if (elapsed > request.budget.maxThinkTimeMs) {
                return this.createFallbackPlan('timeout', request, start);
            }
            if (plannedActions.length === 0) {
                return this.createFallbackPlan('stubbed', request, start);
            }
            const boundedActions = this.enforceBudget(plannedActions, request);
            if (boundedActions.length === 0) {
                return this.createFallbackPlan('stubbed', request, start);
            }
            return {
                actions: boundedActions,
                usedFallback: false,
                diagnostics: {
                    generatedAt: new Date().toISOString(),
                    durationMs: elapsed,
                    requestedDifficulty: request.difficulty,
                    plannedActionCount: boundedActions.length,
                    budget: {
                        maxThinkTimeMs: request.budget.maxThinkTimeMs,
                        maxPlannedActions: request.budget.maxPlannedActions,
                        readableDelayMs: request.budget.readableDelayMs,
                        maxAttackChains: request.budget.maxAttackChains,
                        minAttackOddsByTier: request.budget.minAttackOddsByTier,
                        allowOneSpiceAttack: request.budget.allowOneSpiceAttack,
                    },
                },
            };
        }
        catch {
            return this.createFallbackPlan('stubbed', request, start);
        }
    }
    generatePlan(request) {
        if (request.player.isEliminated) {
            return [];
        }
        switch (request.difficulty) {
            case 'recruit':
                return this.generateRecruitPlan(request);
            case 'commander':
                return this.generateCommanderPlan(request);
            case 'grandmaster':
                return this.generateGrandmasterPlan(request);
            default:
                return [];
        }
    }
    generateCommanderPlan(request) {
        const { gameState, player, budget } = request;
        const roomId = gameState.roomId;
        const actions = [];
        const push = (a) => {
            if (budget.maxPlannedActions !== undefined && actions.length >= budget.maxPlannedActions) {
                return false;
            }
            actions.push(a);
            return true;
        };
        if (gameState.phase === 'finished')
            return [];
        try {
            const cfg = gameState.gameConfig?.treasureConfig;
            const hand = (player.treasures ?? []);
            const mustCash = Boolean(player.mustCashInTreasures || gameState.mustCashInTreasures);
            if (cfg?.enabled && hand.length >= 3) {
                const norm = normalizeTreasureConfig(cfg);
                const sets = findRedeemableSets(hand);
                const nearCap = hand.length >= Math.max(3, norm.handCap - 1);
                if ((mustCash || nearCap) && sets.length > 0) {
                    const first = sets[0];
                    push({
                        type: 'trade_cards',
                        roomId,
                        playerId: player.id,
                        payload: { treasureSet: first.indices },
                    });
                }
            }
        }
        catch {
        }
        let phase = gameState.phase;
        if (phase === 'reinforcement') {
            const available = Math.max(0, player.armies);
            if (available > 0) {
                const target = this.chooseCommanderReinforcement(gameState, player.id);
                if (target) {
                    if (!push({
                        type: 'deploy',
                        roomId,
                        playerId: player.id,
                        payload: { territoryId: target, armies: available },
                    }))
                        return actions;
                }
            }
            if (!push({ type: 'end_turn', roomId, playerId: player.id }))
                return actions;
            phase = 'attack';
        }
        if (phase === 'attack') {
            const attack = this.findCommanderAttack(gameState, player.id, budget);
            if (attack) {
                if (!push(attack))
                    return actions;
            }
            if (!push({ type: 'end_turn', roomId, playerId: player.id }))
                return actions;
            phase = 'fortify';
        }
        if (phase === 'fortify') {
            const fort = this.findGrandmasterFortify(gameState, player.id);
            if (fort)
                push(fort);
            push({ type: 'end_turn', roomId, playerId: player.id });
        }
        return actions;
    }
    chooseCommanderReinforcement(gameState, playerId) {
        const owned = gameState.board.filter((t) => t.ownerId === playerId);
        if (owned.length === 0)
            return null;
        const sectorMap = new Map();
        for (const t of gameState.board) {
            const key = t.sector || t.continent || 'unknown';
            const e = sectorMap.get(key) ?? { owned: 0, total: 0 };
            e.total += 1;
            if (t.ownerId === playerId)
                e.owned += 1;
            sectorMap.set(key, e);
        }
        const candidateSectors = Array.from(sectorMap.entries())
            .filter(([key]) => key !== 'unknown')
            .sort((a, b) => b[1].owned / Math.max(1, b[1].total) - a[1].owned / Math.max(1, a[1].total));
        for (const [sector] of candidateSectors) {
            const borders = owned
                .filter((t) => (t.sector || t.continent) === sector && this.hasEnemyNeighbor(gameState, t, playerId))
                .sort((a, b) => a.armies - b.armies);
            if (borders.length > 0)
                return borders[0].id;
        }
        const allBorders = owned
            .filter((t) => this.hasEnemyNeighbor(gameState, t, playerId))
            .sort((a, b) => a.armies - b.armies);
        return allBorders[0]?.id ?? owned[0].id;
    }
    findCommanderAttack(gameState, playerId, budget) {
        const owned = gameState.board.filter((t) => t.ownerId === playerId);
        if (owned.length === 0)
            return null;
        const sectorScore = new Map();
        for (const t of gameState.board) {
            const key = t.sector || t.continent || 'unknown';
            const e = sectorScore.get(key) ?? 0;
            sectorScore.set(key, e + (t.ownerId === playerId ? 1 : 0));
        }
        const bestSector = Array.from(sectorScore.entries())
            .filter(([k]) => k !== 'unknown')
            .sort((a, b) => b[1] - a[1])[0]?.[0];
        const candidates = [];
        for (const src of owned) {
            if (src.armies <= 3)
                continue;
            for (const nid of src.adjacentTerritories) {
                const tgt = this.getTerritory(gameState, nid);
                if (!tgt || tgt.ownerId === playerId)
                    continue;
                if (tgt.ownerId && this.arePlayersTeammates(gameState, playerId, tgt.ownerId))
                    continue;
                const attackDice = Math.min(3, Math.max(1, src.armies - 1));
                const advantage = src.armies - 1 - (tgt.armies ?? 0);
                const sectorBonus = (tgt.sector || tgt.continent) === bestSector ? 2 : 0;
                const isCapital = tgt.isCapital === true ? 2 : 0;
                const score = advantage * 2 + sectorBonus + isCapital;
                if (advantage >= 1) {
                    candidates.push({ from: src.id, to: tgt.id, score, armies: attackDice });
                }
                else if (advantage === 0 &&
                    (budget.minAttackOddsByTier?.commander ?? 0.68) <= 0.68) {
                    candidates.push({ from: src.id, to: tgt.id, score: score - 1, armies: attackDice });
                }
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        const pick = candidates[0];
        if (!pick)
            return null;
        return {
            type: 'attack',
            roomId: gameState.roomId,
            playerId,
            payload: { fromTerritoryId: pick.from, toTerritoryId: pick.to, armies: pick.armies },
        };
    }
    generateGrandmasterPlan(request) {
        const { gameState, player, budget } = request;
        const roomId = gameState.roomId;
        const actions = [];
        const push = (a) => {
            if (budget.maxPlannedActions !== undefined && actions.length >= budget.maxPlannedActions) {
                return false;
            }
            actions.push(a);
            return true;
        };
        if (gameState.phase === 'finished')
            return [];
        try {
            const cfg = gameState.gameConfig?.treasureConfig;
            const hand = (player.treasures ?? []);
            const mustCash = Boolean(player.mustCashInTreasures || gameState.mustCashInTreasures);
            if (cfg?.enabled && hand.length >= 3) {
                const norm = normalizeTreasureConfig(cfg);
                const sets = findRedeemableSets(hand);
                const nearCap = hand.length >= Math.max(3, norm.handCap - 1);
                if ((mustCash || nearCap) && sets.length > 0) {
                    const first = sets[0];
                    push({
                        type: 'trade_cards',
                        roomId,
                        playerId: player.id,
                        payload: { treasureSet: first.indices },
                    });
                }
            }
        }
        catch {
        }
        let phase = gameState.phase;
        if (phase === 'reinforcement') {
            const avail = Math.max(0, player.armies);
            if (avail > 0) {
                const target = this.chooseCommanderReinforcement(gameState, player.id);
                if (target) {
                    if (!push({
                        type: 'deploy',
                        roomId,
                        playerId: player.id,
                        payload: { territoryId: target, armies: avail },
                    }))
                        return actions;
                }
            }
            if (!push({ type: 'end_turn', roomId, playerId: player.id }))
                return actions;
            phase = 'attack';
        }
        if (phase === 'attack') {
            const attack = this.findGrandmasterAttack(gameState, player.id, budget);
            if (attack) {
                if (!push(attack))
                    return actions;
            }
            if (!push({ type: 'end_turn', roomId, playerId: player.id }))
                return actions;
            phase = 'fortify';
        }
        if (phase === 'fortify') {
            const fort = this.findRecruitFortify(gameState, player.id);
            if (fort)
                push(fort);
            push({ type: 'end_turn', roomId, playerId: player.id });
        }
        return actions;
    }
    findGrandmasterAttack(gameState, playerId, budget) {
        const owned = gameState.board.filter((t) => t.ownerId === playerId);
        if (owned.length === 0)
            return null;
        const endTime = Date.now() + Math.max(0, budget.maxThinkTimeMs - 50);
        const candidates = [];
        for (const src of owned) {
            if (src.armies <= 3)
                continue;
            for (const nid of src.adjacentTerritories) {
                const tgt = this.getTerritory(gameState, nid);
                if (!tgt || tgt.ownerId === playerId)
                    continue;
                if (tgt.ownerId && this.arePlayersTeammates(gameState, playerId, tgt.ownerId))
                    continue;
                const attackDice = Math.min(3, Math.max(1, src.armies - 1));
                const ev = this.estimateAttackEV(gameState, playerId, src.id, tgt.id, endTime);
                candidates.push({ from: src.id, to: tgt.id, ev, armies: attackDice });
            }
        }
        candidates.sort((a, b) => b.ev - a.ev);
        const best = candidates[0];
        if (!best)
            return null;
        if (best.ev <= 0)
            return null;
        return {
            type: 'attack',
            roomId: gameState.roomId,
            playerId,
            payload: {
                fromTerritoryId: best.from,
                toTerritoryId: best.to,
                armies: Math.min(3, Math.max(1, (this.getTerritory(gameState, best.from)?.armies ?? 2) - 1)),
            },
        };
    }
    estimateAttackEV(gameState, playerId, fromId, toId, endTimeMs) {
        const from = this.getTerritory(gameState, fromId);
        const to = this.getTerritory(gameState, toId);
        if (!from || !to)
            return 0;
        const attackersStart = Math.max(0, from.armies - 1);
        const defendersStart = Math.max(0, to.armies);
        if (attackersStart <= 0 || defendersStart <= 0)
            return 0;
        let wins = 0;
        let totalALoss = 0;
        let totalDLoss = 0;
        let trials = 0;
        const maxTrials = 200;
        while (trials < maxTrials && Date.now() < endTimeMs) {
            const { aLoss, dLoss, conquered } = this.simulateBattle(attackersStart, defendersStart);
            if (conquered)
                wins += 1;
            totalALoss += aLoss;
            totalDLoss += dLoss;
            trials += 1;
        }
        if (trials === 0)
            return 0;
        const pWin = wins / trials;
        const expALoss = totalALoss / trials;
        const expDLoss = totalDLoss / trials;
        const sectorVal = this.sectorCaptureValue(gameState, playerId, to);
        const capitalBonus = to.isCapital === true ? 3 : 0;
        const territoryBase = 1;
        const valueIfWin = territoryBase + sectorVal + capitalBonus;
        const ev = pWin * valueIfWin - expALoss * 0.2 + expDLoss * 0.05;
        return ev;
    }
    findGrandmasterFortify(gameState, playerId) {
        const owned = gameState.board.filter((t) => t.ownerId === playerId);
        if (owned.length === 0)
            return null;
        const engine = new GameEngine();
        const sources = owned
            .filter((t) => t.armies >= 4 && !this.hasEnemyNeighbor(gameState, t, playerId))
            .sort((a, b) => b.armies - a.armies);
        const sectorCtrl = new Map();
        for (const t of gameState.board) {
            const key = t.sector || t.continent || 'unknown';
            const e = sectorCtrl.get(key) ?? { owned: 0, total: 0 };
            e.total += 1;
            if (t.ownerId === playerId)
                e.owned += 1;
            sectorCtrl.set(key, e);
        }
        let best = null;
        for (const src of sources) {
            const targets = engine.getValidFortifyTargets(gameState, src.id, playerId);
            if (!targets || targets.length === 0)
                continue;
            for (const tid of targets) {
                const tgt = this.getTerritory(gameState, tid);
                if (!tgt)
                    continue;
                const isBorder = this.hasEnemyNeighbor(gameState, tgt, playerId);
                if (!isBorder && !tgt.isCapital)
                    continue;
                const sector = tgt.sector || tgt.continent || 'unknown';
                const ctrl = sectorCtrl.get(sector) ?? { owned: 0, total: 1 };
                const willOwn = ctrl.owned;
                const progress = willOwn / Math.max(1, ctrl.total);
                const capBonus = tgt.isCapital === true ? 3 : 0;
                const borderWeakness = isBorder ? Math.max(0, 8 - tgt.armies) : 0;
                const score = capBonus + borderWeakness + progress;
                const moveable = Math.max(1, src.armies - 1);
                const armies = Math.max(1, Math.min(moveable, Math.ceil(moveable / 2)));
                if (!best || score > best.score) {
                    best = { from: src.id, to: tid, armies, score };
                }
            }
        }
        if (!best)
            return null;
        return {
            type: 'fortify',
            roomId: gameState.roomId,
            playerId,
            payload: { fromTerritoryId: best.from, toTerritoryId: best.to, armies: best.armies },
        };
    }
    sectorCaptureValue(state, playerId, to) {
        const sector = to.sector || to.continent;
        if (!sector)
            return 0;
        let total = 0;
        let owned = 0;
        for (const t of state.board) {
            if ((t.sector || t.continent) !== sector)
                continue;
            total += 1;
            if (t.ownerId === playerId)
                owned += 1;
        }
        const willOwn = owned + 1;
        if (total > 0 && willOwn === total)
            return 3;
        return Math.max(0, willOwn / Math.max(1, total) - owned / Math.max(1, total));
    }
    simulateBattle(attackersStart, defendersStart) {
        let a = attackersStart;
        let d = defendersStart;
        let aLoss = 0;
        let dLoss = 0;
        while (a > 0 && d > 0) {
            const ad = Math.min(3, Math.max(1, a));
            const dd = Math.min(2, Math.max(1, d));
            const aRolls = this.rollDice(ad);
            const dRolls = this.rollDice(dd);
            const pairs = Math.min(aRolls.length, dRolls.length);
            for (let i = 0; i < pairs; i++) {
                if (aRolls[i] > dRolls[i]) {
                    d -= 1;
                    dLoss += 1;
                }
                else {
                    a -= 1;
                    aLoss += 1;
                }
            }
            if (a <= 0 || d <= 0)
                break;
            if (a <= d && a <= 1)
                break;
            if (a <= 0)
                break;
        }
        return { aLoss, dLoss, conquered: d <= 0 };
    }
    rollDice(n) {
        const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
        return rolls.sort((a, b) => b - a);
    }
    generateRecruitPlan(request) {
        const { gameState, player, budget } = request;
        const actions = [];
        const roomId = gameState.roomId;
        const maxActions = budget.maxPlannedActions ?? Number.POSITIVE_INFINITY;
        const pushAction = (action) => {
            if (actions.length < maxActions) {
                actions.push(action);
                return true;
            }
            return false;
        };
        if (gameState.phase === 'finished') {
            return [];
        }
        let currentPhase = gameState.phase;
        if (currentPhase === 'reinforcement') {
            const reinforcement = this.buildReinforcementAction(gameState, player.id, player.armies);
            if (reinforcement) {
                if (!pushAction(reinforcement)) {
                    return actions;
                }
            }
            if (!pushAction({ type: 'end_turn', roomId, playerId: player.id })) {
                return actions;
            }
            currentPhase = 'attack';
        }
        if (currentPhase === 'attack') {
            const attack = this.findRecruitAttack(gameState, player.id, budget);
            if (attack) {
                if (!pushAction(attack)) {
                    return actions;
                }
            }
            if (!pushAction({ type: 'end_turn', roomId, playerId: player.id })) {
                return actions;
            }
            currentPhase = 'fortify';
        }
        if (currentPhase === 'fortify') {
            const fortify = this.findRecruitFortify(gameState, player.id);
            if (fortify) {
                if (!pushAction(fortify)) {
                    return actions;
                }
            }
            pushAction({ type: 'end_turn', roomId, playerId: player.id });
        }
        return actions;
    }
    buildReinforcementAction(gameState, playerId, availableArmies) {
        if (!availableArmies || availableArmies <= 0) {
            return null;
        }
        const ownedTerritories = gameState.board.filter((territory) => territory.ownerId === playerId);
        if (ownedTerritories.length === 0) {
            return null;
        }
        const borderTerritories = ownedTerritories.filter((territory) => this.hasEnemyNeighbor(gameState, territory, playerId));
        const targetTerritories = borderTerritories.length > 0 ? borderTerritories : ownedTerritories;
        const target = [...targetTerritories].sort((a, b) => a.armies - b.armies)[0];
        return {
            type: 'deploy',
            roomId: gameState.roomId,
            playerId,
            payload: {
                territoryId: target.id,
                armies: availableArmies,
            },
        };
    }
    findRecruitAttack(gameState, playerId, budget) {
        const ownedTerritories = gameState.board.filter((territory) => territory.ownerId === playerId);
        const rankedSources = [...ownedTerritories].sort((a, b) => b.armies - a.armies);
        for (const source of rankedSources) {
            if (source.armies <= 3) {
                continue;
            }
            const hostileNeighbors = source.adjacentTerritories
                .map((neighborId) => this.getTerritory(gameState, neighborId))
                .filter((territory) => {
                if (!territory) {
                    return false;
                }
                if (territory.ownerId === playerId) {
                    return false;
                }
                if (territory.ownerId &&
                    this.arePlayersTeammates(gameState, playerId, territory.ownerId)) {
                    return false;
                }
                return true;
            })
                .sort((a, b) => {
                const capA = a.isCapital === true ? 1 : 0;
                const capB = b.isCapital === true ? 1 : 0;
                if (capA !== capB)
                    return capB - capA;
                return a.armies - b.armies;
            });
            const safeTarget = hostileNeighbors.find((neighbor) => source.armies - 1 > neighbor.armies);
            if (safeTarget) {
                return {
                    type: 'attack',
                    roomId: gameState.roomId,
                    playerId,
                    payload: {
                        fromTerritoryId: source.id,
                        toTerritoryId: safeTarget.id,
                        armies: Math.min(3, Math.max(1, source.armies - 1)),
                    },
                };
            }
            if (budget.allowOneSpiceAttack) {
                const spice = hostileNeighbors.find((neighbor) => source.armies - 1 === neighbor.armies);
                if (spice) {
                    return {
                        type: 'attack',
                        roomId: gameState.roomId,
                        playerId,
                        payload: {
                            fromTerritoryId: source.id,
                            toTerritoryId: spice.id,
                            armies: Math.min(3, Math.max(1, source.armies - 1)),
                        },
                    };
                }
            }
        }
        return null;
    }
    findRecruitFortify(gameState, playerId) {
        const ownedTerritories = gameState.board.filter((territory) => territory.ownerId === playerId);
        if (ownedTerritories.length === 0) {
            return null;
        }
        const interiorSources = ownedTerritories
            .filter((territory) => territory.armies >= 3 && !this.hasEnemyNeighbor(gameState, territory, playerId))
            .sort((a, b) => b.armies - a.armies);
        const borderTargets = ownedTerritories
            .filter((territory) => this.hasEnemyNeighbor(gameState, territory, playerId))
            .sort((a, b) => {
            const capA = a.isCapital === true ? 1 : 0;
            const capB = b.isCapital === true ? 1 : 0;
            if (capA !== capB)
                return capB - capA;
            return a.armies - b.armies;
        });
        for (const source of interiorSources) {
            for (const target of borderTargets) {
                if (source.adjacentTerritories.includes(target.id)) {
                    const armiesToMove = Math.min(3, source.armies - 1);
                    if (armiesToMove > 0) {
                        return {
                            type: 'fortify',
                            roomId: gameState.roomId,
                            playerId,
                            payload: {
                                fromTerritoryId: source.id,
                                toTerritoryId: target.id,
                                armies: armiesToMove,
                            },
                        };
                    }
                }
            }
        }
        return null;
    }
    enforceBudget(actions, request) {
        const maxAllowed = request.budget.maxPlannedActions;
        if (typeof maxAllowed === 'number') {
            if (maxAllowed <= 0) {
                return [];
            }
            return actions.slice(0, maxAllowed);
        }
        return actions;
    }
    hasEnemyNeighbor(gameState, territory, playerId) {
        return territory.adjacentTerritories.some((neighborId) => this.isHostileTerritory(gameState, neighborId, playerId));
    }
    isHostileTerritory(gameState, territoryId, playerId) {
        const neighbor = this.getTerritory(gameState, territoryId);
        if (!neighbor) {
            return false;
        }
        if (neighbor.ownerId === playerId) {
            return false;
        }
        if (neighbor.ownerId && this.arePlayersTeammates(gameState, playerId, neighbor.ownerId)) {
            return false;
        }
        return true;
    }
    arePlayersTeammates(gameState, playerA, playerB) {
        return utilArePlayersTeammates(gameState, playerA, playerB);
    }
    getTerritory(gameState, territoryId) {
        return gameState.board.find((territory) => territory.id === territoryId) ?? null;
    }
    buildFallbackPlan(gameState, playerId) {
        const actions = [];
        const roomId = gameState.roomId;
        const phase = gameState.phase;
        const player = gameState.players.find((entry) => entry.id === playerId);
        const armiesToDeploy = Math.max(0, Math.trunc(player?.armies ?? 0));
        const firstTerritoryId = player?.territories?.[0];
        const addEndTurn = () => {
            actions.push({ type: 'end_turn', roomId, playerId });
        };
        switch (phase) {
            case 'reinforcement':
                if (firstTerritoryId && armiesToDeploy > 0) {
                    actions.push({
                        type: 'deploy',
                        roomId,
                        playerId,
                        payload: { territoryId: firstTerritoryId, armies: armiesToDeploy },
                    });
                }
                addEndTurn();
                addEndTurn();
                break;
            case 'attack':
                addEndTurn();
                addEndTurn();
                break;
            case 'fortify':
                addEndTurn();
                break;
            default:
                break;
        }
        if (actions.length === 0) {
            actions.push({ type: 'end_turn', roomId, playerId });
        }
        return actions;
    }
    createFallbackPlan(reason, request, startedAt) {
        const fallbackActions = this.buildFallbackPlan(request.gameState, request.player.id);
        const maxAllowed = request.budget.maxPlannedActions ?? fallbackActions.length;
        const boundedActions = fallbackActions.slice(0, Math.max(1, maxAllowed));
        return {
            actions: boundedActions,
            usedFallback: true,
            reason,
            diagnostics: {
                generatedAt: new Date().toISOString(),
                durationMs: Date.now() - startedAt,
                requestedDifficulty: request.difficulty,
                plannedActionCount: boundedActions.length,
                budget: {
                    maxThinkTimeMs: request.budget.maxThinkTimeMs,
                    maxPlannedActions: request.budget.maxPlannedActions,
                    readableDelayMs: request.budget.readableDelayMs,
                    maxAttackChains: request.budget.maxAttackChains,
                    minAttackOddsByTier: request.budget.minAttackOddsByTier,
                    allowOneSpiceAttack: request.budget.allowOneSpiceAttack,
                },
            },
        };
    }
}
export const aiDecisionService = new AIDecisionService();
//# sourceMappingURL=aiDecisionService.js.map