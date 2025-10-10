export function getPlayerTeam(gameState, playerId) {
    if (!playerId)
        return null;
    const player = gameState.players.find((p) => p.id === playerId);
    if (!player)
        return null;
    const { teamId } = player;
    return typeof teamId === 'number' && Number.isFinite(teamId) && teamId > 0
        ? Math.trunc(teamId)
        : null;
}
export function arePlayersTeammates(gameState, playerA, playerB) {
    if (!gameState.gameConfig?.allowTeamPlay)
        return false;
    if (!playerB || playerB === 'neutral')
        return false;
    const teamA = getPlayerTeam(gameState, playerA);
    const teamB = getPlayerTeam(gameState, playerB);
    if (!teamA || !teamB)
        return false;
    return teamA === teamB;
}
//# sourceMappingURL=gameTeams.js.map