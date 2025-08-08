import { describe, it, expect, beforeEach } from "vitest";

interface StakeData {
  amount: bigint;
  startBlock: bigint;
  duration: bigint;
}

interface RewardData {
  accumulated: bigint;
  lastClaimed: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  totalStaked: bigint;
  rewardPool: bigint;
  stakes: Map<string, StakeData>;
  rewards: Map<string, RewardData>;
  MIN_STAKE_AMOUNT: bigint;
  REWARD_RATE: bigint;
  MIN_STAKE_DURATION: bigint;
  PENALTY_RATE: bigint;
  blockHeight: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  fundRewardPool(caller: string, amount: bigint): { value: boolean } | { error: number };
  stake(caller: string, amount: bigint, duration: bigint): { value: boolean } | { error: number };
  unstake(caller: string): { value: bigint } | { error: number };
  claimRewards(caller: string): { value: bigint } | { error: number };
  getUserStake(user: string): { value: StakeData | undefined };
  getUserRewards(user: string): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  totalStaked: 0n,
  rewardPool: 0n,
  stakes: new Map(),
  rewards: new Map(),
  MIN_STAKE_AMOUNT: 1_000_000n,
  REWARD_RATE: 100n,
  MIN_STAKE_DURATION: 144n,
  PENALTY_RATE: 2_000n,
  blockHeight: 1000n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  fundRewardPool(caller: string, amount: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (amount === 0n) return { error: 105 };
    this.rewardPool += amount;
    return { value: true };
  },

  stake(caller: string, amount: bigint, duration: bigint) {
    if (this.paused) return { error: 104 };
    if (amount <= this.MIN_STAKE_AMOUNT) return { error: 105 };
    if (duration < this.MIN_STAKE_DURATION) return { error: 107 };
    if (this.stakes.has(caller)) return { error: 102 };
    this.stakes.set(caller, { amount, startBlock: this.blockHeight, duration });
    this.totalStaked += amount;
    return { value: true };
  },

  unstake(caller: string) {
    if (this.paused) return { error: 104 };
    const stakeData = this.stakes.get(caller);
    if (!stakeData) return { error: 103 };
    const { amount, startBlock, duration } = stakeData;
    const blocksStaked = this.blockHeight - startBlock;
    const penalty = blocksStaked < duration ? (amount * this.PENALTY_RATE) / 10_000n : 0n;
    const returnAmount = amount - penalty;
    if (returnAmount === 0n) return { error: 105 };
    if (penalty > 0n) this.rewardPool += penalty;
    this.stakes.delete(caller);
    this.totalStaked -= amount;
    return { value: returnAmount };
  },

  claimRewards(caller: string) {
    if (this.paused) return { error: 104 };
    const stakeData = this.stakes.get(caller);
    if (!stakeData) return { error: 103 };
    const { amount, startBlock, duration } = stakeData;
    const blocksStaked = this.blockHeight - startBlock;
    const reward = blocksStaked >= duration ? (amount * this.REWARD_RATE * blocksStaked) / 100n : 0n;
    const currentRewards = this.rewards.get(caller) || { accumulated: 0n, lastClaimed: 0n };
    const totalRewards = reward + currentRewards.accumulated;
    if (totalRewards === 0n) return { error: 105 };
    if (this.rewardPool < totalRewards) return { error: 101 };
    this.rewards.set(caller, { accumulated: 0n, lastClaimed: this.blockHeight });
    this.rewardPool -= totalRewards;
    return { value: totalRewards };
  },

  getUserStake(user: string) {
    return { value: this.stakes.get(user) };
  },

  getUserRewards(user: string) {
    const stakeData = this.stakes.get(user);
    let reward = 0n;
    if (stakeData) {
      const { amount, startBlock, duration } = stakeData;
      const blocksStaked = this.blockHeight - startBlock;
      reward = blocksStaked >= duration ? (amount * this.REWARD_RATE * blocksStaked) / 100n : 0n;
    }
    const currentRewards = this.rewards.get(user) || { accumulated: 0n, lastClaimed: 0n };
    return { value: reward + currentRewards.accumulated };
  },
};

describe("StakingRewards Contract", () => {
  beforeEach(() => {
    mockContract.paused = false;
    mockContract.totalStaked = 0n;
    mockContract.rewardPool = 0n;
    mockContract.stakes = new Map();
    mockContract.rewards = new Map();
    mockContract.blockHeight = 1000n;
  });

  it("should allow admin to pause contract", () => {
    const result = mockContract.setPaused(mockContract.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.paused).toBe(true);
  });

  it("should prevent non-admin from pausing contract", () => {
    const result = mockContract.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 100 });
  });

  it("should allow admin to fund reward pool", () => {
    const result = mockContract.fundRewardPool(mockContract.admin, 10_000_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.rewardPool).toBe(10_000_000n);
  });

  it("should allow user to stake tokens", () => {
    const result = mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.stakes.get("ST2CY5...")).toEqual({
      amount: 5_000_000n,
      startBlock: 1000n,
      duration: 200n,
    });
    expect(mockContract.totalStaked).toBe(5_000_000n);
  });

  it("should prevent staking below minimum amount", () => {
    const result = mockContract.stake("ST2CY5...", 500_000n, 200n);
    expect(result).toEqual({ error: 105 });
  });

  it("should prevent staking with invalid duration", () => {
    const result = mockContract.stake("ST2CY5...", 5_000_000n, 100n);
    expect(result).toEqual({ error: 107 });
  });

  it("should prevent restaking", () => {
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    const result = mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    expect(result).toEqual({ error: 102 });
  });

  it("should allow user to unstake after duration", () => {
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    mockContract.blockHeight = 1200n;
    const result = mockContract.unstake("ST2CY5...");
    expect(result).toEqual({ value: 5_000_000n });
    expect(mockContract.stakes.get("ST2CY5...")).toBeUndefined();
    expect(mockContract.totalStaked).toBe(0n);
  });

  it("should apply penalty for early unstake", () => {
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    mockContract.blockHeight = 1100n;
    const result = mockContract.unstake("ST2CY5...");
    expect(result).toEqual({ value: 4_000_000n });
    expect(mockContract.rewardPool).toBe(1_000_000n);
    expect(mockContract.stakes.get("ST2CY5...")).toBeUndefined();
  });

  it("should allow user to claim rewards after duration", () => {
    mockContract.fundRewardPool(mockContract.admin, 1_000_000_000n);
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    mockContract.blockHeight = 1200n;
    const result = mockContract.claimRewards("ST2CY5...");
    expect(result).toEqual({ value: 1_000_000_000n });
    expect(mockContract.rewardPool).toBe(1_000_000_000n - 1_000_000_000n);
    expect(mockContract.rewards.get("ST2CY5...")).toEqual({ accumulated: 0n, lastClaimed: 1200n });
  });

  it("should prevent claiming rewards before duration", () => {
    mockContract.fundRewardPool(mockContract.admin, 10_000_000n);
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    mockContract.blockHeight = 1100n;
    const result = mockContract.claimRewards("ST2CY5...");
    expect(result).toEqual({ error: 105 });
  });

  it("should return user stake", () => {
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    const result = mockContract.getUserStake("ST2CY5...");
    expect(result).toEqual({
      value: { amount: 5_000_000n, startBlock: 1000n, duration: 200n },
    });
  });

  it("should return user rewards", () => {
    mockContract.stake("ST2CY5...", 5_000_000n, 200n);
    mockContract.blockHeight = 1200n;
    const result = mockContract.getUserRewards("ST2CY5...");
    expect(result).toEqual({ value: 1_000_000_000n });
  });
});