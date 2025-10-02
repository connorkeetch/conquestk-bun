export interface CapitalGenerationTerritory {
  id: string
  name: string
  connections: string[]
}

export interface CapitalGenerationResult {
  assignments: Record<string, string[]>
  generatedCounts: number[]
  skippedCounts: number[]
  warnings: string[]
  usedTerritoryIds: string[]
}

type Graph = Map<string, Set<string>>

const buildAdjacencyGraph = (territories: CapitalGenerationTerritory[]): Graph => {
  const graph: Graph = new Map()
  const territoryIds = new Set(territories.map((territory) => territory.id))

  for (const territory of territories) {
    if (!graph.has(territory.id)) {
      graph.set(territory.id, new Set())
    }

    for (const connectionId of territory.connections) {
      if (!territoryIds.has(connectionId)) {
        continue
      }

      graph.get(territory.id)?.add(connectionId)

      if (!graph.has(connectionId)) {
        graph.set(connectionId, new Set())
      }
      graph.get(connectionId)?.add(territory.id)
    }
  }

  return graph
}

const findConnectedComponents = (
  territories: CapitalGenerationTerritory[],
  graph: Graph,
): CapitalGenerationTerritory[][] => {
  const components: CapitalGenerationTerritory[][] = []
  const visited = new Set<string>()
  const territoryMap = new Map(territories.map((territory) => [territory.id, territory]))

  for (const territory of territories) {
    if (visited.has(territory.id)) {
      continue
    }

    const queue: string[] = [territory.id]
    visited.add(territory.id)
    const componentIds: string[] = []

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) {
        continue
      }

      componentIds.push(currentId)

      const neighbors = graph.get(currentId)
      if (!neighbors) {
        continue
      }

      for (const neighborId of neighbors) {
        if (visited.has(neighborId) || !territoryMap.has(neighborId)) {
          continue
        }
        visited.add(neighborId)
        queue.push(neighborId)
      }
    }

    const componentTerritories = componentIds
      .map((id) => territoryMap.get(id))
      .filter((territory): territory is CapitalGenerationTerritory => Boolean(territory))

    if (componentTerritories.length > 0) {
      components.push(componentTerritories)
    }
  }

  return components
}

const getDistance = (fromId: string, toId: string, graph: Graph, validIds: Set<string>): number => {
  if (fromId === toId) {
    return 0
  }

  const visited = new Set<string>([fromId])
  const queue: Array<{ id: string; distance: number }> = [{ id: fromId, distance: 0 }]

  while (queue.length > 0) {
    const next = queue.shift()
    if (!next) {
      break
    }

    const { id, distance } = next
    const neighbors = graph.get(id)
    if (!neighbors) {
      continue
    }

    for (const neighborId of neighbors) {
      if (!validIds.has(neighborId) || visited.has(neighborId)) {
        continue
      }

      if (neighborId === toId) {
        return distance + 1
      }

      visited.add(neighborId)
      queue.push({ id: neighborId, distance: distance + 1 })
    }
  }

  return Number.POSITIVE_INFINITY
}

const getTotalDistanceToAll = (
  originId: string,
  targetIds: string[],
  graph: Graph,
  validIds: Set<string>,
): number => {
  let totalDistance = 0

  for (const targetId of targetIds) {
    if (targetId === originId) {
      continue
    }

    const distance = getDistance(originId, targetId, graph, validIds)
    totalDistance += distance
  }

  return totalDistance
}

const findMostCentralTerritory = (
  territories: CapitalGenerationTerritory[],
  graph: Graph,
): string => {
  let bestTerritoryId = territories[0].id
  let bestScore = Number.POSITIVE_INFINITY
  const territoryIds = territories.map((territory) => territory.id)
  const validIds = new Set(territoryIds)

  for (const territory of territories) {
    const totalDistance = getTotalDistanceToAll(territory.id, territoryIds, graph, validIds)
    const connectionBonus = (graph.get(territory.id)?.size ?? 0) * 2
    const score = totalDistance - connectionBonus

    if (score < bestScore) {
      bestScore = score
      bestTerritoryId = territory.id
    }
  }

  return bestTerritoryId
}

const getMinDistanceToCapitals = (
  candidateId: string,
  capitals: string[],
  graph: Graph,
  validIds: Set<string>,
): number => {
  let minDistance = Number.POSITIVE_INFINITY

  for (const capitalId of capitals) {
    const distance = getDistance(candidateId, capitalId, graph, validIds)
    if (distance < minDistance) {
      minDistance = distance
    }
  }

  return minDistance
}

const selectOptimalCapitals = (
  territories: CapitalGenerationTerritory[],
  graph: Graph,
  count: number,
): string[] => {
  if (territories.length === 0) {
    return []
  }

  const capitals: string[] = []
  const territoryIds = territories.map((territory) => territory.id)
  const validIds = new Set(territoryIds)

  const firstCapitalId = findMostCentralTerritory(territories, graph)
  capitals.push(firstCapitalId)

  while (capitals.length < count) {
    let bestCandidate: string | null = null
    let bestMinDistance = -1

    for (const candidateId of territoryIds) {
      if (capitals.includes(candidateId)) {
        continue
      }

      const minDistance = getMinDistanceToCapitals(candidateId, capitals, graph, validIds)

      if (minDistance > bestMinDistance) {
        bestMinDistance = minDistance
        bestCandidate = candidateId
      }
    }

    if (bestCandidate) {
      capitals.push(bestCandidate)
    } else {
      break
    }
  }

  return capitals
}

export const generateCapitalAssignments = (
  territories: CapitalGenerationTerritory[],
  minPlayers: number,
  maxPlayers: number,
): CapitalGenerationResult => {
  const sanitizedTerritories = territories
    .filter((territory) => territory.id)
    .map((territory) => ({
      id: territory.id,
      name: territory.name,
      connections: Array.isArray(territory.connections)
        ? territory.connections.filter((connectionId) => typeof connectionId === 'string')
        : [],
    }))

  const totalTerritoryCount = sanitizedTerritories.length
  if (totalTerritoryCount === 0) {
    return {
      assignments: {},
      generatedCounts: [],
      skippedCounts: [],
      warnings: ['No territories available to generate capitals.'],
      usedTerritoryIds: [],
    }
  }

  const graph = buildAdjacencyGraph(sanitizedTerritories)
  const components = findConnectedComponents(sanitizedTerritories, graph)

  let workingTerritories = sanitizedTerritories
  const warnings: string[] = []

  if (components.length > 1) {
    const largestComponent = components.reduce((largest, current) =>
      current.length > largest.length ? current : largest,
    )
    const largestIds = new Set(largestComponent.map((territory) => territory.id))
    workingTerritories = sanitizedTerritories.filter((territory) => largestIds.has(territory.id))

    warnings.push(
      `Map has ${components.length} disconnected clusters; generated capitals using the largest group (${workingTerritories.length} of ${totalTerritoryCount} territories).`,
    )
  }

  const workingGraph = buildAdjacencyGraph(workingTerritories)
  const assignments: Record<string, string[]> = {}
  const generatedCounts: number[] = []
  const skippedCounts: number[] = []

  const startPlayers = Math.max(2, Math.min(minPlayers, maxPlayers))
  const endPlayers = Math.max(startPlayers, Math.min(12, maxPlayers))

  for (let playerCount = startPlayers; playerCount <= endPlayers; playerCount += 1) {
    if (workingTerritories.length < playerCount) {
      skippedCounts.push(playerCount)
      continue
    }

    const capitals = selectOptimalCapitals(workingTerritories, workingGraph, playerCount)
    if (capitals.length === playerCount) {
      assignments[playerCount.toString()] = capitals
      generatedCounts.push(playerCount)
    } else {
      skippedCounts.push(playerCount)
    }
  }

  if (generatedCounts.length === 0 && workingTerritories.length > 0) {
    warnings.push('Unable to auto-generate capitals. Please verify territory connections.')
  }

  return {
    assignments,
    generatedCounts,
    skippedCounts,
    warnings,
    usedTerritoryIds: workingTerritories.map((territory) => territory.id),
  }
}
