import { describe, it, expect, beforeEach } from "vitest";

interface StrategyYield {
  totalYield: bigint;
  lastUpdated: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  totalYield: bigint;
  strategyYields: Map<string, StrategyYield>;
  userYieldShares: Map<string, bigint>;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  transferAdmin(caller: string, newAdmin: string): { value: boolean } | { error: number };
  addYieldStrategy(caller: string, strategy: string, apy: bigint, riskScore: bigint): { value: boolean } | { error: number };
  depositAndStake(caller: string, amount: bigint, strategy: string, stakeDuration: bigint): { value: bigint } | { error: number };
  withdrawAndClaim(caller: string, amount: bigint, strategy: string): { value: bigint } | { error: number };
  updateYield(caller: string, strategy: string, yieldAmount: bigint): { value: boolean } | { error: number };
  executeGovernanceProposal(caller: string, proposalId: bigint): { value: boolean } | { error: number };
  getUserYieldShares(user: string, strategy: string): { value: bigint };
  getStrategyYield(strategy: string): { value: StrategyYield | undefined };
  getTotalYield(): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  totalYield: 0n,
  strategyYields: new Map(),
  userYieldShares: new Map(),

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  transferAdmin(caller: string, newAdmin: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.admin = newAdmin;
    return { value: true };
  },

  addYieldStrategy(caller: string, strategy: string, apy: bigint, riskScore: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (strategy === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.strategyYields.set(strategy, { totalYield: 0n, lastUpdated: 1000n });
    return { value: true };
  },

  depositAndStake(caller: string, amount: bigint, strategy: string, stakeDuration: bigint) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 104 };
    if (!this.strategyYields.has(strategy)) return { error: 102 };
    const shares = amount; // Mock VaultManager deposit
    this.userYieldShares.set(`${caller}-${strategy}`, (this.userYieldShares.get(`${caller}-${strategy}`) || 0n) + shares);
    return { value: shares };
  },

  withdrawAndClaim(caller: string, amount: bigint, strategy: string) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 104 };
    if (!this.strategyYields.has(strategy)) return { error: 102 };
    const shares = amount; // Mock VaultManager withdraw
    const rewards = 1_000_000n; // Mock StakingRewards claim
    const currentShares = this.userYieldShares.get(`${caller}-${strategy}`) || 0n;
    if (currentShares < shares) return { error: 101 };
    this.userYieldShares.set(`${caller}-${strategy}`, currentShares - shares);
    return { value: rewards };
  },

  updateYield(caller: string, strategy: string, yieldAmount: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.strategyYields.has(strategy)) return { error: 102 };
    if (yieldAmount === 0n) return { error: 104 };
    const currentYield = this.strategyYields.get(strategy)!;
    this.strategyYields.set(strategy, { totalYield: currentYield.totalYield + yieldAmount, lastUpdated: 1000n });
    this.totalYield += yieldAmount;
    return { value: true };
  },

  executeGovernanceProposal(caller: string, proposalId: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    return { value: true }; // Mock Governance execution
  },

  getUserYieldShares(user: string, strategy: string) {
    return { value: this.userYieldShares.get(`${user}-${strategy}`) || 0n };
  },

  getStrategyYield(strategy: string) {
    return { value: this.strategyYields.get(strategy) };
  },

  getTotalYield() {
    return { value: this.totalYield };
  },
};

describe("YieldAggregator Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.totalYield = 0n;
    mockContract.strategyYields = new Map();
    mockContract.userYieldShares = new Map();
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

  it("should allow admin to transfer admin rights", () => {
    const result = mockContract.transferAdmin(mockContract.admin, "ST3NB...");
    expect(result).toEqual({ value: true });
    expect(mockContract.admin).toBe("ST3NB...");
  });

  it("should prevent transfer to zero address", () => {
    const result = mockContract.transferAdmin(mockContract.admin, "SP000000000000000000002Q6VF78");
    expect(result).toEqual({ error: 105 });
  });

  it("should allow admin to add yield strategy", () => {
    const result = mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    expect(result).toEqual({ value: true });
    expect(mockContract.strategyYields.get("ST4PQ...")).toEqual({ totalYield: 0n, lastUpdated: 1000n });
  });

  it("should prevent non-admin from adding yield strategy", () => {
    const result = mockContract.addYieldStrategy("ST2CY5...", "ST4PQ...", 500n, 10n);
    expect(result).toEqual({ error: 100 });
  });

  it("should allow user to deposit and stake", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    const result = mockContract.depositAndStake("ST2CY5...", 5_000_000n, "ST4PQ...", 200n);
    expect(result).toEqual({ value: 5_000_000n });
    expect(mockContract.userYieldShares.get("ST2CY5...-ST4PQ...")).toBe(5_000_000n);
  });

  it("should prevent deposit to invalid strategy", () => {
    const result = mockContract.depositAndStake("ST2CY5...", 5_000_000n, "ST4PQ...", 200n);
    expect(result).toEqual({ error: 102 });
  });

  it("should prevent deposit when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.depositAndStake("ST2CY5...", 5_000_000n, "ST4PQ...", 200n);
    expect(result).toEqual({ error: 103 });
  });

  it("should allow user to withdraw and claim rewards", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    mockContract.depositAndStake("ST2CY5...", 5_000_000n, "ST4PQ...", 200n);
    const result = mockContract.withdrawAndClaim("ST2CY5...", 5_000_000n, "ST4PQ...");
    expect(result).toEqual({ value: 1_000_000n });
    expect(mockContract.userYieldShares.get("ST2CY5...-ST4PQ...")).toBe(0n);
  });

  it("should prevent withdraw with insufficient shares", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    const result = mockContract.withdrawAndClaim("ST2CY5...", 5_000_000n, "ST4PQ...");
    expect(result).toEqual({ error: 101 });
  });

  it("should allow admin to update yield", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    const result = mockContract.updateYield(mockContract.admin, "ST4PQ...", 1_000_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.strategyYields.get("ST4PQ...")).toEqual({ totalYield: 1_000_000n, lastUpdated: 1000n });
    expect(mockContract.totalYield).toBe(1_000_000n);
  });

  it("should prevent non-admin from updating yield", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    const result = mockContract.updateYield("ST2CY5...", "ST4PQ...", 1_000_000n);
    expect(result).toEqual({ error: 100 });
  });

  it("should allow admin to execute governance proposal", () => {
    const result = mockContract.executeGovernanceProposal(mockContract.admin, 0n);
    expect(result).toEqual({ value: true });
  });

  it("should prevent non-admin from executing proposal", () => {
    const result = mockContract.executeGovernanceProposal("ST2CY5...", 0n);
    expect(result).toEqual({ error: 100 });
  });

  it("should return user yield shares", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    mockContract.depositAndStake("ST2CY5...", 5_000_000n, "ST4PQ...", 200n);
    const result = mockContract.getUserYieldShares("ST2CY5...", "ST4PQ...");
    expect(result).toEqual({ value: 5_000_000n });
  });

  it("should return strategy yield", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    mockContract.updateYield(mockContract.admin, "ST4PQ...", 1_000_000n);
    const result = mockContract.getStrategyYield("ST4PQ...");
    expect(result).toEqual({ value: { totalYield: 1_000_000n, lastUpdated: 1000n } });
  });

  it("should return total yield", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST4PQ...", 500n, 10n);
    mockContract.updateYield(mockContract.admin, "ST4PQ...", 1_000_000n);
    const result = mockContract.getTotalYield();
    expect(result).toEqual({ value: 1_000_000n });
  });
});