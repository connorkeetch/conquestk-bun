import { logger } from '../utils/logger.js';
import { GameService } from './gameService.js';
import { socketPayloadMetrics } from './metricsService.js';
const ROOM_PREFIX = 'game:';
function getViewerTeamId(state, viewerId) {
    const p = state.players.find((pl) => pl.id === viewerId);
    return p?.teamId ?? null;
}
export function computeVisibilityMask(state, viewerId) {
    const allowTeam = state.gameConfig?.allowTeamPlay === true;
    const viewerTeam = allowTeam ? getViewerTeamId(state, viewerId) : null;
    const owned = new Set();
    for (const t of state.board) {
        if (t.ownerId === viewerId) {
            owned.add(t.id);
        }
        else if (allowTeam && viewerTeam && viewerTeam > 0) {
            const owner = t.ownerId ? state.players.find((pl) => pl.id === t.ownerId) : null;
            if (owner?.teamId && owner.teamId === viewerTeam)
                owned.add(t.id);
        }
    }
    const visible = new Set(owned);
    for (const t of state.board) {
        if (!owned.has(t.id))
            continue;
        for (const adj of t.adjacentTerritories)
            visible.add(adj);
    }
    return visible;
}
function filterDeltaForMask(delta, mask) {
    if (delta.type === 'TERRITORY_UPDATE') {
        return mask.has(delta.territoryId) ? delta : null;
    }
    if (delta.type === 'BATTLE_RESULT') {
        const fromId = delta.battleResult.fromTerritory.id;
        const toId = delta.battleResult.toTerritory.id;
        const fromVisible = mask.has(fromId);
        const toVisible = mask.has(toId);
        if (!fromVisible && !toVisible) {
            return null;
        }
        const redacted = { ...delta, battleResult: { ...delta.battleResult } };
        if (!fromVisible) {
            redacted.battleResult.fromTerritory = {
                id: fromId,
                armies: 0,
            };
        }
        if (!toVisible) {
            redacted.battleResult.toTerritory = {
                id: toId,
                armies: 0,
                ownerId: undefined,
            };
        }
        const maybeAny = redacted;
        if (Array.isArray(maybeAny.changes)) {
            maybeAny.changes = maybeAny.changes.filter((c) => c?.type !== 'TERRITORY_UPDATE' || mask.has(c.territoryId));
        }
        return redacted;
    }
    if (delta.type === 'PLAYER_UPDATE') {
        return {
            ...delta,
            changes: { ...delta.changes, territories: undefined },
        };
    }
    if (delta.type === 'FORTIFY_RESULT') {
        const fr = delta;
        const fromVisible = mask.has(fr.fromTerritoryId);
        const toVisible = mask.has(fr.toTerritoryId);
        if (!fromVisible && !toVisible) {
            return null;
        }
        return delta;
    }
    return delta;
}
export async function emitFogFilteredDelta(io, roomId, delta, state) {
    const channel = `${ROOM_PREFIX}${roomId}`;
    let sockets;
    try {
        sockets = (await io.in(channel).fetchSockets());
    }
    catch {
        try {
            const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8');
            socketPayloadMetrics.record('game-delta', bytes);
        }
        catch {
        }
        io.to(channel).emit('game-delta', delta);
        return;
    }
    const gameState = state ?? (await new GameService().getGameState(roomId));
    if (!gameState) {
        try {
            const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8');
            socketPayloadMetrics.record('game-delta', bytes);
        }
        catch {
        }
        io.to(channel).emit('game-delta', delta);
        return;
    }
    const fogMode = gameState.gameConfig
        ?.fogOfWar ?? 'off';
    if (fogMode === 'off') {
        try {
            const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8');
            socketPayloadMetrics.record('game-delta', bytes);
        }
        catch {
        }
        io.to(channel).emit('game-delta', delta);
        return;
    }
    for (const s of sockets) {
        const viewerId = s.data?.userId;
        if (!viewerId) {
            try {
                const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8');
                socketPayloadMetrics.record('game-delta', bytes);
            }
            catch {
            }
            io.to(s.id).emit('game-delta', delta);
            continue;
        }
        const mask = computeVisibilityMask(gameState, viewerId);
        const filtered = filterDeltaForMask(delta, mask);
        if (filtered) {
            try {
                const bytes = Buffer.byteLength(JSON.stringify(filtered), 'utf8');
                socketPayloadMetrics.record('game-delta', bytes);
            }
            catch {
            }
            io.to(s.id).emit('game-delta', filtered);
        }
    }
}
export function filterFullStateForViewer(state, viewerId) {
    const fogMode = state.gameConfig?.fogOfWar;
    const fogEnabled = fogMode && fogMode !== 'off';
    if (!fogEnabled)
        return state;
    const mask = computeVisibilityMask(state, viewerId);
    return {
        ...state,
        board: state.board.map((t) => (mask.has(t.id) ? t : { ...t, ownerId: null, armies: 0 })),
    };
}
export function filterStateForPlanner(state, viewerId) {
    return filterFullStateForViewer(state, viewerId);
}
function serializeForClient(state) {
    const territoryModifiers = state.territoryModifiers;
    if (territoryModifiers instanceof Map) {
        const obj = Object.fromEntries(territoryModifiers.entries());
        return { ...state, territoryModifiers: obj };
    }
    return state;
}
export async function emitRevealSnapshot(io, roomId, viewerId, state) {
    const channel = `${ROOM_PREFIX}${roomId}`;
    let sockets;
    try {
        sockets = (await io.in(channel).fetchSockets());
    }
    catch {
        return;
    }
    const target = sockets.find((s) => s.data?.userId === viewerId);
    if (!target)
        return;
    const gameState = state ?? (await new GameService().getGameState(roomId));
    if (!gameState)
        return;
    const filtered = filterFullStateForViewer(gameState, viewerId);
    const serialized = serializeForClient(filtered);
    try {
        const bytes = Buffer.byteLength(JSON.stringify(serialized), 'utf8');
        socketPayloadMetrics.record('game-update', bytes);
        if (socketPayloadMetrics.shouldLog('game-update')) {
            const stats = socketPayloadMetrics.snapshot('game-update');
            if (stats) {
                logger.info('Socket payload stats', {
                    event: 'game-update',
                    windowCount: stats.count,
                    p50Bytes: stats.p50,
                    p95Bytes: stats.p95,
                    maxBytes: stats.max,
                });
            }
        }
    }
    catch {
    }
    io.to(target.id).emit('game-update', serialized);
}
//# sourceMappingURL=fogService.js.map