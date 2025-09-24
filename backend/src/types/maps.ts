// Advanced Map System Types
// Supports custom maps with special abilities, game modes, and asymmetric gameplay

export type MapStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'

export type MapCollaboratorRole = 'editor' | 'viewer' | 'owner' | 'reviewer'

export interface MapCollaborator {
  mapId: string
  userId: string
  role: MapCollaboratorRole
  assignedBy?: string | null
  assignedAt: Date
}

export interface CustomMap {
  id: string
  name: string
  description?: string
  creatorId: string
  creatorName?: string // For display
  imageUrl?: string
  imageWidth: number
  imageHeight: number
  isPublic: boolean
  isFeatured: boolean
  status: MapStatus
  version: number
  parentMapId?: string // For tracking edits of approved maps
  downloadCount: number
  playCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[] // ["naval", "asymmetric", "fantasy"]
  capitalTerritories?: Record<string, number[]> // {"2": [1, 25], "3": [1, 17, 33], ...}

  // Review fields
  submittedAt?: Date
  reviewedAt?: Date
  reviewedBy?: string
  reviewNotes?: string
  rejectionReason?: string

  createdAt: Date
  updatedAt: Date
}

export interface GameMode {
  id: string
  name: string
  description?: string
  config: GameModeConfig
  isDefault: boolean
  createdAt: Date
}

export interface GameModeConfig {
  type: 'classic' | 'capital' | 'naval' | 'resource' | 'asymmetric' | 'custom'
  eliminationOnCapitalLoss?: boolean
  cardBonuses?: boolean
  capitalBonus?: number
  navalMovement?: boolean
  portAdvantage?: boolean
  resources?: string[]
  resourceRequirements?: boolean
  unequalStart?: boolean
  playerBonuses?: boolean
  customRules?: Record<string, unknown>
}

export interface MapGameMode {
  id: string
  mapId: string
  gameModeId: string
  customConfig?: Partial<GameModeConfig>
  isRecommended: boolean
}

export interface MapContinent {
  id: string
  mapId: string
  name: string
  bonusArmies: number
  color: string
  specialRules?: ContinentSpecialRules
  createdAt: Date
}

export interface ContinentSpecialRules {
  seasonalEffects?: boolean
  resourceGeneration?: string
  movementRestrictions?: string[]
  [key: string]: unknown
}

export interface TerritoryAbilityType {
  id: string
  name: string
  description?: string
  icon: string // Emoji or icon identifier
  effectConfig: TerritoryEffect
  createdAt: Date
}

export interface TerritoryEffect {
  type: 'defense' | 'attack' | 'income' | 'movement' | 'special' | 'magical'
  defenseBonus?: number
  attackBonus?: number
  incomeBonus?: number
  navalMovement?: boolean
  restrictedAccess?: boolean
  isCapital?: boolean
  teleport?: boolean
  specialPowers?: boolean
  [key: string]: unknown
}

export interface MapTerritory {
  id: string
  mapId: string
  territoryId: string // Unique within the map
  name: string
  continentId?: string
  boundaryCoords: Coordinate[] // Polygon coordinates
  armyPosition: Coordinate
  abilityTypeId?: string
  customAbilityConfig?: Partial<TerritoryEffect>
  startingOwnerSlot?: number // For asymmetric modes
  startingArmies: number
  createdAt: Date
}

export interface Coordinate {
  x: number
  y: number
}

export interface TerritoryAdjacency {
  id: string
  fromTerritoryId: string
  toTerritoryId: string
  connectionType: 'land' | 'sea' | 'air' | 'tunnel' | 'special'
  isBidirectional: boolean
  specialRequirements?: ConnectionRequirements
}

export interface ConnectionRequirements {
  requiresNavalBase?: boolean
  seasonalBlocked?: string[] // ['winter', 'storm']
  resourceCost?: string
  [key: string]: unknown
}

export interface TerritoryModifierMetadata {
  templateId?: string
  name?: string
  icon?: string
  color?: string
  defenseBonus?: number
  attackBonus?: number
  troopBonus?: number
  movementRestriction?: boolean
  supplyLineBonus?: boolean
  notes?: string
}

export interface MapRating {
  id: string
  mapId: string
  userId: string
  rating: number // 1-5
  review?: string
  createdAt: Date
}

// Enhanced Territory interface for gameplay
export interface EnhancedTerritory {
  id: string
  name: string
  continent: string
  ownerId: string | null
  armies: number
  adjacentTerritories: string[]

  // Enhanced features
  ability?: TerritoryAbilityType
  boundaryCoords?: Coordinate[]
  armyPosition: Coordinate
  specialEffects?: TerritoryEffect
  startingOwner?: number // Player slot for asymmetric games
}

// Enhanced Game State with Map Support
export interface EnhancedGameState {
  roomId: string
  mapId?: string // Reference to custom map
  gameModeId?: string // Reference to game mode
  players: EnhancedGamePlayer[]
  currentPlayer: string
  phase: 'setup' | 'reinforcement' | 'attack' | 'fortify' | 'finished'
  turn: number
  board: EnhancedTerritory[]
  cards: Card[]

  // Enhanced features
  gameMode?: GameMode
  mapData?: CustomMap
  resources?: PlayerResources
  specialEvents?: GameEvent[]
}

export interface EnhancedGamePlayer {
  id: string
  username: string
  color: string
  armies: number
  territories: string[]
  cards: Card[]
  isEliminated: boolean

  // Enhanced features
  resources?: PlayerResources
  capitalTerritory?: string
  specialAbilities?: string[]
  playerSlot: number // For asymmetric games
}

export interface PlayerResources {
  gold?: number
  iron?: number
  food?: number
  [key: string]: number | undefined
}

export interface Card {
  id: string
  type: 'infantry' | 'cavalry' | 'artillery' | 'wild'
  territory?: string
}

export interface GameEvent {
  id: string
  type: string
  description: string
  turnsRemaining?: number
  affectedTerritories?: string[]
  effects: Record<string, unknown>
}

// Map Editor Types
export interface MapEditorState {
  mapId?: string
  name: string
  description?: string
  imageUrl?: string
  imageWidth: number
  imageHeight: number

  continents: MapContinent[]
  territories: MapTerritory[]
  adjacencies: TerritoryAdjacency[]

  selectedTool: 'select' | 'territory' | 'continent' | 'adjacency'
  selectedTerritory?: string
  isDrawing: boolean
  currentPolygon: Coordinate[]
}

// API Request/Response Types
export interface MetadataTerritoryInput {
  id?: string
  name?: string
  boundaryCoords?: Coordinate[]
  continentId?: string
  x?: number
  y?: number
  isCapital?: boolean
  armyPosition?: Coordinate
  connections?: string[]
}

export interface MetadataContinentInput {
  id?: string
  name?: string
  bonus?: number
  color?: string
}

export interface MetadataAdjacencyInput {
  from?: string
  to?: string
  fromTerritoryId?: string
  toTerritoryId?: string
  territory_from?: string
  territory_to?: string
  source?: string
  target?: string
}

export interface MapMetadataPayload {
  territories?: MetadataTerritoryInput[]
  continents?: MetadataContinentInput[]
  adjacencies?: MetadataAdjacencyInput[]
  capitalAssignments?: Record<string, string[]>
  width?: number
  height?: number
  territoryModifiers?: Record<string, TerritoryModifierMetadata>
}

export interface CreateMapRequest {
  name: string
  description?: string
  imageFile?: File
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  isPublic?: boolean
  tags?: string[]
  capitalTerritories?: Record<string, number[]>
  minPlayers?: number
  maxPlayers?: number
  metadata?: MapMetadataPayload
}

export interface UpdateMapRequest {
  name?: string
  description?: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  isPublic?: boolean
  tags?: string[]
}

export interface CreateTerritoryRequest {
  mapId: string
  territoryId: string
  name: string
  continentId?: string
  boundaryCoords: Coordinate[]
  armyPosition: Coordinate
  abilityTypeId?: string
  startingOwnerSlot?: number
  startingArmies?: number
}

export interface CreateAdjacencyRequest {
  fromTerritoryId: string
  toTerritoryId: string
  connectionType?: 'land' | 'sea' | 'air' | 'tunnel' | 'special'
  isBidirectional?: boolean
  specialRequirements?: ConnectionRequirements
}

export interface MapSearchFilters {
  search?: string
  tags?: string[]
  creator?: string
  status?: MapStatus | string
  isPublic?: boolean
  isFeatured?: boolean
  minRating?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface MapSearchResult {
  maps: CustomMap[]
  total: number
  hasMore: boolean
}

// Map Draft System
export interface MapDraft {
  id: string
  userId: string
  stagingImageId?: string // Reference to staging image
  parentMapId?: string // If editing/cloning existing map
  name: string
  description?: string
  data: Record<string, unknown> // JSON map data
  territories?: unknown
  continents?: unknown
  adjacencies?: unknown
  capitalAssignments?: Record<string, string[]>
  territoryModifiers?: Record<string, TerritoryModifierMetadata>
  thumbnailUrl?: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  draftStatus?: string
  validationStatus?: string
  validationErrors?: unknown[]
  isPublic?: boolean
  tags?: string[]
  autoSavedAt?: Date
  lastEditedAt?: Date
  createdAt: Date
  updatedAt: Date

  // Deprecated - kept for backward compatibility
  mapId?: string
}

// Map Version History
export interface MapVersion {
  id: string
  mapId: string
  versionNumber: number
  data: Record<string, unknown>
  territories?: unknown
  continents?: unknown
  adjacencies?: unknown
  changeSummary?: string
  changedBy: string
  createdAt: Date
}

// Review Queue
export interface MapReviewItem {
  id: string
  mapId: string
  map?: CustomMap
  submittedBy: string
  submitterName?: string
  status: 'pending' | 'in_review' | 'approved' | 'rejected'
  priority: number
  assignedTo?: string
  submittedAt: Date
  reviewedAt?: Date
}

// Admin Notifications
export interface AdminNotification {
  id: string
  adminId?: string
  type: 'map_submission' | 'map_update' | 'system_update' | 'user_report'
  title: string
  message: string
  data?: Record<string, unknown>
  isRead: boolean
  createdAt: Date
  readAt?: Date
}

// Map Submission Log
export interface MapSubmissionLog {
  id: string
  mapId: string
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'edited' | 'archived'
  performedBy: string
  details?: Record<string, unknown>
  createdAt: Date
}
