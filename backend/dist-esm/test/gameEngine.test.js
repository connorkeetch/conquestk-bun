"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
globals_1.jest.mock('../config/database', () => ({
    query: globals_1.jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));
const gameEngine_js_1 = require("../game/gameEngine.js");
const hiddenTreasures_js_1 = require("../game/hiddenTreasures.js");
const cacheService_js_1 = require("../services/cacheService.js");
const gameService_js_1 = require("../services/gameService.js");
const createBaseGameState = (override) => {
    const players = [
        {
            id: 'player-1',
            username: 'Player One',
            color: 'red',
            armies: 5,
            territories: ['territory-a'],
            cards: [],
            isEliminated: false,
        },
        {
            id: 'player-2',
            username: 'Player Two',
            color: 'blue',
            armies: 5,
            territories: ['territory-b'],
            cards: [],
            isEliminated: false,
        },
    ];
    const board = [
        {
            id: 'territory-a',
            name: 'Territory A',
            continent: 'america',
            ownerId: 'player-1',
            armies: 3,
            adjacentTerritories: ['territory-b'],
        },
        {
            id: 'territory-b',
            name: 'Territory B',
            continent: 'america',
            ownerId: 'player-2',
            armies: 2,
            adjacentTerritories: ['territory-a'],
        },
    ];
    const baseState = {
        roomId: 'room-1',
        players,
        currentPlayer: 'player-1',
        phase: 'attack',
        turn: 1,
        board,
        cards: [],
        gameConfig: {
            movementType: 'classic_adjacent',
            allowTeamPlay: false,
            maxPlayers: 6,
            mapId: 'classic',
            gameMode: 'standard',
        },
    };
    return { ...baseState, ...override };
};
(0, globals_1.describe)('GameEngine', () => {
    const engine = new gameEngine_js_1.GameEngine();
    (0, globals_1.it)('validates attack requirements including minimum armies', () => {
        const gameState = createBaseGameState();
        const validAttack = {
            type: 'attack',
            roomId: 'room-1',
            playerId: 'player-1',
            payload: {
                fromTerritoryId: 'territory-a',
                toTerritoryId: 'territory-b',
                armies: 2,
            },
        };
        (0, globals_1.expect)(engine.validateAction(gameState, validAttack)).toBe(true);
        const invalidAttack = {
            ...validAttack,
            payload: {
                ...validAttack.payload,
                armies: 3,
            },
        };
        (0, globals_1.expect)(engine.validateAction(gameState, invalidAttack)).toBe(false);
    });
    (0, globals_1.it)('throws for unknown action types to guard regressions', async () => {
        const gameState = createBaseGameState();
        const bogusAction = {
            type: 'unknown_action',
            roomId: 'room-1',
            playerId: 'player-1',
            payload: {},
        };
        await (0, globals_1.expect)(engine.processAction(gameState, bogusAction)).rejects.toThrow('Unknown action type received in game engine');
    });
    (0, globals_1.it)('includes continent metadata when calculating reinforcement armies', () => {
        const reinforcementState = {
            roomId: 'room-reinforcement',
            players: [
                {
                    id: 'player-alpha',
                    username: 'Alpha',
                    color: 'red',
                    armies: 0,
                    territories: ['territory-a', 'territory-b'],
                    cards: [],
                    isEliminated: false,
                },
                {
                    id: 'player-beta',
                    username: 'Beta',
                    color: 'blue',
                    armies: 0,
                    territories: ['territory-c'],
                    cards: [],
                    isEliminated: false,
                },
            ],
            currentPlayer: 'player-alpha',
            phase: 'reinforcement',
            turn: 3,
            board: [
                {
                    id: 'territory-a',
                    name: 'Territory A',
                    continent: 'continent-alpha',
                    ownerId: 'player-alpha',
                    armies: 5,
                    adjacentTerritories: ['territory-b'],
                },
                {
                    id: 'territory-b',
                    name: 'Territory B',
                    continent: 'continent-alpha',
                    ownerId: 'player-alpha',
                    armies: 2,
                    adjacentTerritories: ['territory-a', 'territory-c'],
                },
                {
                    id: 'territory-c',
                    name: 'Territory C',
                    continent: 'continent-beta',
                    ownerId: 'player-beta',
                    armies: 3,
                    adjacentTerritories: ['territory-b'],
                },
            ],
            cards: [],
            gameConfig: {
                movementType: 'classic_adjacent',
                allowTeamPlay: false,
                maxPlayers: 4,
                mapId: 'classic',
                gameMode: 'standard',
                sectorBonuses: [
                    {
                        id: 'continent-alpha',
                        name: 'Continent Alpha',
                        bonusArmies: 4,
                        territories: ['territory-a', 'territory-b'],
                    },
                    {
                        id: 'continent-beta',
                        name: 'Continent Beta',
                        bonusArmies: 2,
                        territories: ['territory-c'],
                    },
                ],
            },
        };
        const reinforcementArmies = engine.calculateBaseReinforcementArmies(reinforcementState, 'player-alpha');
        (0, globals_1.expect)(reinforcementArmies).toBe(7);
    });
    (0, globals_1.it)('allows reinforcement onto teammate territories when team play is enabled', async () => {
        const gameState = {
            roomId: 'team-reinforcement',
            players: [
                {
                    id: 'player-1',
                    username: 'Player One',
                    color: 'red',
                    armies: 6,
                    territories: ['territory-a'],
                    cards: [],
                    isEliminated: false,
                    teamId: 1,
                },
                {
                    id: 'player-2',
                    username: 'Player Two',
                    color: 'blue',
                    armies: 3,
                    territories: ['territory-b'],
                    cards: [],
                    isEliminated: false,
                    teamId: 1,
                },
            ],
            currentPlayer: 'player-1',
            phase: 'reinforcement',
            turn: 2,
            board: [
                {
                    id: 'territory-a',
                    name: 'Territory A',
                    continent: 'continent-alpha',
                    ownerId: 'player-1',
                    armies: 5,
                    adjacentTerritories: ['territory-b'],
                },
                {
                    id: 'territory-b',
                    name: 'Territory B',
                    continent: 'continent-alpha',
                    ownerId: 'player-2',
                    armies: 2,
                    adjacentTerritories: ['territory-a'],
                },
            ],
            cards: [],
            gameConfig: {
                movementType: 'classic_adjacent',
                allowTeamPlay: true,
                maxPlayers: 4,
                mapId: 'classic',
                gameMode: 'standard',
            },
        };
        const action = {
            type: 'deploy',
            roomId: 'team-reinforcement',
            playerId: 'player-1',
            payload: {
                territoryId: 'territory-b',
                armies: 3,
            },
        };
        (0, globals_1.expect)(engine.validateAction(gameState, action)).toBe(true);
        const result = await engine.processAction(gameState, action);
        const updatedBoard = result.gameState.board;
        const teammateTerritory = updatedBoard.find((t) => t.id === 'territory-b');
        const currentPlayer = result.gameState.players.find((p) => p.id === 'player-1');
        (0, globals_1.expect)(teammateTerritory?.armies).toBe(5);
        (0, globals_1.expect)(currentPlayer?.armies).toBe(3);
    });
    (0, globals_1.it)('blocks reinforcement onto teammate territories when team play is disabled', () => {
        const gameState = createBaseGameState({
            phase: 'reinforcement',
            gameConfig: {
                movementType: 'classic_adjacent',
                allowTeamPlay: false,
                maxPlayers: 6,
                mapId: 'classic',
                gameMode: 'standard',
            },
        });
        const action = {
            type: 'deploy',
            roomId: 'room-1',
            playerId: 'player-1',
            payload: {
                territoryId: 'territory-b',
                armies: 2,
            },
        };
        (0, globals_1.expect)(engine.validateAction(gameState, action)).toBe(false);
    });
    (0, globals_1.it)('adds treasure payouts to available reinforcements when cashing a valid set', async () => {
        const treasureConfig = {
            enabled: true,
            payoutMode: 'fixed',
            fixedValue: 5,
            handCap: 5,
            diamondsPercent: 0,
            diamondSetBonus: 0,
        };
        const gameState = createBaseGameState({
            phase: 'reinforcement',
            gameConfig: {
                ...createBaseGameState().gameConfig,
                treasureConfig,
            },
        });
        const current = gameState.players[0];
        current.armies = 3;
        current.treasures = ['bronze', 'bronze', 'bronze'];
        gameState.treasureState = (0, hiddenTreasures_js_1.ensureTreasureState)();
        const action = {
            type: 'trade_cards',
            roomId: gameState.roomId,
            playerId: current.id,
            payload: { treasureSet: [0, 1, 2] },
        };
        const result = await engine.processAction(gameState, action);
        const updatedPlayer = result.gameState.players[0];
        (0, globals_1.expect)(updatedPlayer.armies).toBe(8);
        (0, globals_1.expect)(updatedPlayer.treasures).toHaveLength(0);
        (0, globals_1.expect)(result.gameState.mustCashInTreasures).toBe(false);
    });
    (0, globals_1.it)('prevents ending reinforcement while armies remain to deploy', () => {
        const gameState = createBaseGameState({ phase: 'reinforcement' });
        const current = gameState.players[0];
        current.armies = 4;
        gameState.mustCashInTreasures = false;
        const endTurn = {
            type: 'end_turn',
            roomId: gameState.roomId,
            playerId: current.id,
        };
        (0, globals_1.expect)(engine.validateAction(gameState, endTurn)).toBe(false);
        current.armies = 0;
        (0, globals_1.expect)(engine.validateAction(gameState, endTurn)).toBe(true);
    });
    (0, globals_1.it)('only forces a treasure cash-in when a valid set is present', () => {
        const treasureConfig = {
            enabled: true,
            payoutMode: 'fixed',
            fixedValue: 4,
            handCap: 3,
            diamondsPercent: 0,
            diamondSetBonus: 0,
        };
        const gameState = createBaseGameState({
            phase: 'reinforcement',
            gameConfig: {
                ...createBaseGameState().gameConfig,
                treasureConfig,
            },
        });
        const current = gameState.players[0];
        current.treasures = ['bronze', 'bronze', 'silver'];
        const updateRequirement = engine.updateCurrentPlayerCashRequirement;
        updateRequirement.call(engine, gameState, treasureConfig);
        (0, globals_1.expect)(current.mustCashInTreasures).toBe(false);
        (0, globals_1.expect)(gameState.mustCashInTreasures).toBe(false);
        current.treasures = ['bronze', 'bronze', 'bronze'];
        updateRequirement.call(engine, gameState, treasureConfig);
        (0, globals_1.expect)(current.mustCashInTreasures).toBe(true);
        (0, globals_1.expect)(gameState.mustCashInTreasures).toBe(true);
    });
    (0, globals_1.it)('returns to attack after placing treasure armies when cashing in mid-attack', async () => {
        const treasureConfig = {
            enabled: true,
            payoutMode: 'fixed',
            fixedValue: 4,
            handCap: 5,
            diamondsPercent: 0,
            diamondSetBonus: 0,
        };
        const gameState = createBaseGameState({
            phase: 'attack',
            hasAttackedThisTurn: true,
            gameConfig: {
                ...createBaseGameState().gameConfig,
                treasureConfig,
            },
        });
        const current = gameState.players[0];
        current.armies = 0;
        current.treasures = ['bronze', 'bronze', 'bronze'];
        gameState.treasureState = (0, hiddenTreasures_js_1.ensureTreasureState)();
        const trade = {
            type: 'trade_cards',
            roomId: gameState.roomId,
            playerId: current.id,
            payload: { treasureSet: [0, 1, 2] },
        };
        const traded = await engine.processAction(gameState, trade);
        const afterTrade = traded.gameState;
        const updatedPlayer = afterTrade.players[0];
        (0, globals_1.expect)(afterTrade.phase).toBe('reinforcement');
        (0, globals_1.expect)(updatedPlayer.armies).toBe(4);
        const deploy = {
            type: 'deploy',
            roomId: afterTrade.roomId,
            playerId: updatedPlayer.id,
            payload: { territoryId: 'territory-a', armies: 4 },
        };
        const deployed = await engine.processAction(afterTrade, deploy);
        (0, globals_1.expect)(deployed.gameState.phase).toBe('attack');
        (0, globals_1.expect)(deployed.gameState.hasAttackedThisTurn).toBe(true);
    });
});
(0, globals_1.describe)('GameService serialization', () => {
    const service = new gameService_js_1.GameService();
    const modifiers = new Map([
        [
            'territory-a',
            {
                territory_id: 'territory-a',
                attack_bonus: 1,
                defense_bonus: 0,
                troop_generation_bonus: 0,
                movement_restriction: false,
                supply_line_bonus: false,
                icon: 'sword',
                color: '#ff0000',
                name: 'Battle Hardened',
            },
        ],
    ]);
    const stateWithModifiers = createBaseGameState({
        territoryModifiers: modifiers,
    });
    (0, globals_1.it)('converts Map-based modifiers to plain objects when serializing', () => {
        const serialized = service.serializeGameState(stateWithModifiers);
        (0, globals_1.expect)(serialized.territoryModifiers).toEqual({
            'territory-a': globals_1.expect.objectContaining({ name: 'Battle Hardened', attack_bonus: 1 }),
        });
    });
    (0, globals_1.it)('hydrates serialized modifiers back into Map instances', () => {
        const serialized = service.serializeGameState(stateWithModifiers);
        const hydrated = service.hydrateGameState(serialized);
        (0, globals_1.expect)(hydrated.territoryModifiers).toBeInstanceOf(Map);
        (0, globals_1.expect)(hydrated.territoryModifiers?.get('territory-a')?.name).toBe('Battle Hardened');
    });
});
(0, globals_1.describe)('GameService capital helpers', () => {
    const service = new gameService_js_1.GameService();
    const roomId = 'capital-room-1';
    afterEach(async () => {
        await cacheService_js_1.gameStateCache.deleteGameState(roomId);
    });
    (0, globals_1.it)('identifies capital territories from cached state', async () => {
        const cachedState = {
            roomId,
            players: [
                {
                    id: 'player-1',
                    username: 'Player One',
                    color: 'red',
                    armies: 5,
                    territories: ['territory-capital'],
                    cards: [],
                    isEliminated: false,
                    capitalTerritory: 'territory-capital',
                },
                {
                    id: 'player-2',
                    username: 'Player Two',
                    color: 'blue',
                    armies: 3,
                    territories: ['territory-regular'],
                    cards: [],
                    isEliminated: false,
                },
            ],
            currentPlayer: 'player-1',
            phase: 'reinforcement',
            turn: 1,
            board: [
                {
                    id: 'territory-capital',
                    name: 'Capital Territory',
                    continent: 'continent-alpha',
                    ownerId: 'player-1',
                    armies: 6,
                    adjacentTerritories: ['territory-regular'],
                    isCapital: true,
                    capitalOwnerId: 'player-1',
                },
                {
                    id: 'territory-regular',
                    name: 'Regular Territory',
                    continent: 'continent-beta',
                    ownerId: 'player-2',
                    armies: 4,
                    adjacentTerritories: ['territory-capital'],
                    isCapital: false,
                },
            ],
            cards: [],
            gameConfig: {
                movementType: 'classic_adjacent',
                allowTeamPlay: false,
                maxPlayers: 6,
                mapId: 'classic',
                gameMode: 'standard',
            },
            capitalAssignments: {
                'player-1': 'territory-capital',
            },
        };
        await cacheService_js_1.gameStateCache.setGameState(roomId, cachedState);
        await (0, globals_1.expect)(service.isCapitalTerritory(roomId, 'territory-capital')).resolves.toBe(true);
        await (0, globals_1.expect)(service.isCapitalTerritory(roomId, 'territory-regular')).resolves.toBe(false);
    });
});
//# sourceMappingURL=gameEngine.test.js.map