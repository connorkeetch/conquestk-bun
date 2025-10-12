/* tslint:disable */
/* eslint-disable */
export function version(): string;
export function simulate_step(seed_hi: number, seed_lo: number, att_dice: number, def_dice: number): any;
export function simulate_battle(seed_hi: number, seed_lo: number, att_armies: number, def_armies: number, policy: any): any;
export function monte_carlo(att_armies: number, def_armies: number, trials: number, seed_hi: number, seed_lo: number): any;
export function odds_matrix(max_att: number, max_def: number, trials: number, seed_hi: number, seed_lo: number): any;
export function exact_odds(att_armies: number, def_armies: number): number;
