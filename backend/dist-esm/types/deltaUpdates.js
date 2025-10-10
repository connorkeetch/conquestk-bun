export const DeltaBuilder = {
    territoryUpdate(roomId, territoryId, changes, version) {
        const normalizedArmies = typeof changes.armies === 'number' && Number.isFinite(changes.armies)
            ? Math.max(0, Math.trunc(changes.armies))
            : undefined;
        const normalizedOwner = typeof changes.ownerId === 'string' && changes.ownerId.trim().length > 0
            ? changes.ownerId
            : undefined;
        return {
            type: 'TERRITORY_UPDATE',
            roomId,
            territoryId,
            changes: {
                ...(normalizedArmies !== undefined ? { armies: normalizedArmies } : {}),
                ...(normalizedOwner !== undefined ? { ownerId: normalizedOwner } : {}),
            },
            timestamp: Date.now(),
            version,
        };
    },
    playerUpdate(roomId, playerId, changes, version) {
        return {
            type: 'PLAYER_UPDATE',
            roomId,
            playerId,
            changes,
            timestamp: Date.now(),
            version,
        };
    },
    phaseChange(roomId, phase, currentPlayer, turn, reinforcementArmies, version) {
        const safeTurn = typeof turn === 'number' && Number.isFinite(turn) ? Math.max(0, Math.trunc(turn)) : undefined;
        const safeReinforce = typeof reinforcementArmies === 'number' && Number.isFinite(reinforcementArmies)
            ? Math.max(0, Math.trunc(reinforcementArmies))
            : undefined;
        return {
            type: 'PHASE_CHANGE',
            roomId,
            phase,
            currentPlayer,
            turn: safeTurn,
            reinforcementArmies: safeReinforce,
            timestamp: Date.now(),
            version,
        };
    },
    battleResult(roomId, battleResult, version) {
        return {
            type: 'BATTLE_RESULT',
            roomId,
            battleResult,
            timestamp: Date.now(),
            version,
        };
    },
    gameEnd(roomId, winner, eliminatedPlayers, version) {
        return {
            type: 'GAME_END',
            roomId,
            winner,
            eliminatedPlayers,
            timestamp: Date.now(),
            version,
        };
    },
};
//# sourceMappingURL=deltaUpdates.js.map