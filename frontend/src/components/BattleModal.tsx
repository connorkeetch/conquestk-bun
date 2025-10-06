import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
import audioService from '../services/audioService'
import type { BattleResult, BattleTerritorySnapshot } from '../types/game'

interface BattleModalProps {
  isOpen: boolean
  battleResult: BattleResult | null
  onClose: () => void
  onContinueAttack?: () => void
}

export const BattleModal: React.FC<BattleModalProps> = ({
  isOpen,
  battleResult,
  onClose,
  onContinueAttack,
}) => {
  const [showAnimation, setShowAnimation] = useState(false)
  const speed = useAppSelector((s) => s.uiRoom.animationSpeed)

  const resolveTerritory = (
    territory: BattleResult['fromTerritory'],
  ): BattleTerritorySnapshot & { name: string; armies: number } => {
    if (typeof territory === 'string') {
      return {
        id: territory,
        name: territory,
        armies: 0,
        ownerId: null,
      }
    }

    return {
      id: territory.id,
      name: territory.name ?? territory.id,
      armies: territory.armies ?? 0,
      ownerId: territory.ownerId ?? null,
    }
  }

  useEffect(() => {
    if (isOpen && battleResult) {
      setShowAnimation(true)

      // Play battle sounds
      audioService.playEffect('dice')

      const timeouts: number[] = []

      // Play battle/attack sound after dice
      timeouts.push(
        window.setTimeout(() => {
          audioService.playEffect('battle')
        }, 500),
      )

      if (speed !== 'instant') {
        // Play outcome sound
        timeouts.push(
          window.setTimeout(() => {
            if (battleResult.conquered) {
              audioService.playEffect('fanfare')
              audioService.playEffect('capture')
            } else if (battleResult.defenderLosses > battleResult.attackerLosses) {
              audioService.playEffect('attack')
            }
          }, 1000),
        )
      }

      if (!onContinueAttack) {
        timeouts.push(window.setTimeout(onClose, speed === 'instant' ? 600 : 3000))
      }

      return () => {
        timeouts.forEach((timeoutId) => {
          window.clearTimeout(timeoutId)
        })
      }
    }
  }, [isOpen, battleResult, onClose, onContinueAttack, speed])

  const game = useAppSelector((s) => s.game.currentGame)
  const neutralGrey = 'var(--color-gray-500)'

  const fromTerritory = battleResult
    ? resolveTerritory(battleResult.fromTerritory)
    : { id: '', name: '', armies: 0, ownerId: null }
  const toTerritory = battleResult
    ? resolveTerritory(battleResult.toTerritory)
    : { id: '', name: '', armies: 0, ownerId: null }

  const { attackerColor, defenderColor } = useMemo(() => {
    if (!game || !battleResult) return { attackerColor: neutralGrey, defenderColor: neutralGrey }

    // Prefer stable attacker/defender ids from the battle payload so colors don't
    // flip when territory ownership changes due to conquest.
    const attackerId =
      battleResult.attackerId ?? fromTerritory.ownerId ?? game.currentPlayer ?? null
    const defenderId = battleResult.defenderId ?? toTerritory.ownerId ?? null

    const aPlayer = attackerId ? game.players.find((p) => p.id === attackerId) : undefined
    const dPlayer = defenderId ? game.players.find((p) => p.id === defenderId) : undefined

    return {
      attackerColor: aPlayer ? getColorValue(aPlayer.color) : neutralGrey,
      defenderColor: dPlayer ? getColorValue(dPlayer.color) : neutralGrey,
    }
  }, [game, battleResult, fromTerritory.ownerId, toTerritory.ownerId])

  if (!isOpen || !battleResult) return null

  const createDiceDescriptors = (dice: number[], role: 'attacker' | 'defender') =>
    dice.map((value, index) => ({
      id: `${fromTerritory.id}-${toTerritory.id}-${role}-${index}-${value}`,
      value,
      index,
    }))

  const renderDice = (dice: ReturnType<typeof createDiceDescriptors>, bgColor: string) => (
    <div className="flex space-x-2">
      {dice.map((die) => (
        <div
          key={die.id}
          className={`w-12 h-12 border-2 border-gray-300 rounded-lg flex items-center justify-center text-white font-bold text-lg ${
            showAnimation && speed !== 'instant' ? 'animate-bounce' : ''
          }`}
          // Use background so gradients (premium colors) render correctly
          style={{ background: bgColor, animationDelay: `${die.index * 0.1}s` }}
        >
          {die.value}
        </div>
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-1 border border-border rounded-lg shadow-xl max-w-md w-full m-4">
        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Battle Results</h2>
            <p className="text-muted">
              {fromTerritory.name} vs {toTerritory.name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Attacker */}
            <div className="text-center">
              <h3 className="font-semibold text-red-600 mb-3">Attacker</h3>
              <p className="text-sm text-muted mb-2">{fromTerritory.name}</p>
              {renderDice(
                createDiceDescriptors(battleResult.attackerDice, 'attacker'),
                attackerColor,
              )}
              <p className="mt-2 text-sm">
                {battleResult.attackerLosses > 0 ? (
                  <span className="text-red-600 font-medium">
                    Lost {battleResult.attackerLosses} armies
                  </span>
                ) : (
                  <span className="text-green-600 font-medium">No losses</span>
                )}
              </p>
              <p className="text-xs text-muted">{fromTerritory.armies} armies remaining</p>
            </div>

            {/* Defender */}
            <div className="text-center">
              <h3 className="font-semibold text-blue-600 mb-3">Defender</h3>
              <p className="text-sm text-muted mb-2">{toTerritory.name}</p>
              {renderDice(
                createDiceDescriptors(battleResult.defenderDice, 'defender'),
                defenderColor,
              )}
              <p className="mt-2 text-sm">
                {battleResult.defenderLosses > 0 ? (
                  <span className="text-red-600 font-medium">
                    Lost {battleResult.defenderLosses} armies
                  </span>
                ) : (
                  <span className="text-green-600 font-medium">No losses</span>
                )}
              </p>
              <p className="text-xs text-muted">{toTerritory.armies} armies remaining</p>
            </div>
          </div>

          {/* Conquest Message */}
          {battleResult.conquered && (
            <div className="bg-warning-soft border border-yellow-600/50 rounded-lg p-4 mb-4">
              <div className="text-center">
                <h3 className="font-bold text-yellow-300 text-lg mb-1">Territory Conquered! 🎉</h3>
                <p className="text-yellow-200 text-sm">
                  {toTerritory.name} is now under your control
                </p>
                <p className="text-yellow-200/80 text-xs mt-2">
                  Choose how many armies to transfer on the next screen
                </p>
              </div>
            </div>
          )}

          {/* Battle Explanation */}
          <div className="bg-surface-2/50 rounded-lg p-3 mb-4 text-xs text-muted">
            <p className="font-medium mb-1">How the battle was resolved:</p>
            <p>
              Highest dice are compared first. Ties go to the defender.
              {battleResult.attackerDice.length > 1 &&
                battleResult.defenderDice.length > 1 &&
                ' Second highest dice are compared if both sides have multiple dice.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            {onContinueAttack && fromTerritory.armies > 1 && !battleResult.conquered && (
              <button
                type="button"
                onClick={onContinueAttack}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded font-medium"
              >
                Continue Attack
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded font-medium"
            >
              {onContinueAttack && fromTerritory.armies > 1 && !battleResult.conquered
                ? 'Stop Attacking'
                : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
