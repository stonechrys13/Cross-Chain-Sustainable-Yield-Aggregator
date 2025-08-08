import { describe, it, expect, beforeEach } from "vitest";

interface Strategy {
  apy: bigint;
  riskScore: bigint;
  active: boolean;
}

interface MockContract {
  admin: string;
  paused: boolean;
  totalVaultShares: bigint;
  totalDeposited: bigint;
  userDeposits: Map<string, bigint>;
  userShares: Map<string, bigint>;
  yieldStrategies: Map<string, Strategy>;
  strategyAllocations: Map<string, bigint>;
  userStrategyShares: Map<string, bigint>;
  MAX_DEPOSIT_PER_USER: bigint;
  MIN_DEPOSIT: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  addYieldStrategy(caller: string, strategy: string, apy: bigint, riskScore: bigint): { value: boolean } | { error: number };
  deposit(caller: string, amount: bigint, strategy: string): { value: bigint } | { error: number };
  withdraw(caller: string, amount: bigint, strategy: string): { value: bigint } | { error: number };
  getUserDeposit(user: string): { value: bigint };
  getUserShares(user: string): { value: bigint };
  getStrategyAllocation(strategy: string): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  totalVaultShares: 0n,
  totalDeposited: 0n,
  userDeposits: new Map(),
  userShares: new Map(),
  yieldStrategies: new Map(),
  strategyAllocations: new Map(),
  userStrategyShares: new Map(),
  MAX_DEPOSIT_PER_USER: 1_000_000_000_000n,
  MIN_DEPOSIT: 1_000_000n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  addYieldStrategy(caller: string, strategy: string, apy: bigint, riskScore: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.yieldStrategies.set(strategy, { apy, riskScore, active: true });
    return { value: true };
  },

  deposit(caller: string, amount: bigint, strategy: string) {
    if (this.paused) return { error: 103 };
    if (amount <= this.MIN_DEPOSIT) return { error: 104 };
    if (!this.yieldStrategies.get(strategy)?.active) return { error: 102 };
    const currentDeposit = this.userDeposits.get(caller) || 0n;
    const newDeposit = currentDeposit + amount;
    if (newDeposit > this.MAX_DEPOSIT_PER_USER) return { error: 107 };
    const vaultShares = this.totalVaultShares;
    const newShares = vaultShares === 0n ? amount : (amount * vaultShares) / this.totalDeposited;
    this.userDeposits.set(caller, newDeposit);
    this.userShares.set(caller, (this.userShares.get(caller) || 0n) + newShares);
    const key = `${caller}-${strategy}`;
    this.userStrategyShares.set(key, (this.userStrategyShares.get(key) || 0n) + newShares);
    this.strategyAllocations.set(strategy, (this.strategyAllocations.get(strategy) || 0n) + amount);
    this.totalDeposited += amount;
    this.totalVaultShares += newShares;
    return { value: newShares };
  },

  withdraw(caller: string, amount: bigint, strategy: string) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 104 };
    if (!this.yieldStrategies.get(strategy)?.active) return { error: 102 };
    const currentDeposit = this.userDeposits.get(caller) || 0n;
    if (currentDeposit < amount) return { error: 101 };
    const key = `${caller}-${strategy}`;
    const strategyShares = this.userStrategyShares.get(key) || 0n;
    const sharesToBurn = (amount * this.totalVaultShares) / this.totalDeposited;
    if (strategyShares < sharesToBurn) return { error: 101 };
    this.userDeposits.set(caller, currentDeposit - amount);
    this.userShares.set(caller, (this.userShares.get(caller) || 0n) - sharesToBurn);
    this.userStrategyShares.set(key, strategyShares - sharesToBurn);
    this.strategyAllocations.set(strategy, (this.strategyAllocations.get(strategy) || 0n) - amount);
    this.totalDeposited -= amount;
    this.totalVaultShares -= sharesToBurn;
    return { value: sharesToBurn };
  },

  getUserDeposit(user: string) {
    return { value: this.userDeposits.get(user) || 0n };
  },

  getUserShares(user: string) {
    return { value: this.userShares.get(user) || 0n };
  },

  getStrategyAllocation(strategy: string) {
    return { value: this.strategyAllocations.get(strategy) || 0n };
  },
};

describe("VaultManager Contract", () => {
  beforeEach(() => {
    mockContract.paused = false;
    mockContract.totalVaultShares = 0n;
    mockContract.totalDeposited = 0n;
    mockContract.userDeposits = new Map();
    mockContract.userShares = new Map();
    mockContract.yieldStrategies = new Map();
    mockContract.strategyAllocations = new Map();
    mockContract.userStrategyShares = new Map();
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

  it("should allow admin to add yield strategy", () => {
    const result = mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    expect(result).toEqual({ value: true });
    expect(mockContract.yieldStrategies.get("ST3NB...")).toEqual({ apy: 500n, riskScore: 10n, active: true });
  });

  it("should allow user to deposit into vault", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    const result = mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    expect(result).toEqual({ value: 10_000_000n });
    expect(mockContract.userDeposits.get("ST2CY5...")).toBe(10_000_000n);
    expect(mockContract.userShares.get("ST2CY5...")).toBe(10_000_000n);
    expect(mockContract.strategyAllocations.get("ST3NB...")).toBe(10_000_000n);
  });

  it("should prevent deposit below minimum", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    const result = mockContract.deposit("ST2CY5...", 500_000n, "ST3NB...");
    expect(result).toEqual({ error: 104 });
  });

  it("should prevent deposit to non-whitelisted strategy", () => {
    const result = mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    expect(result).toEqual({ error: 102 });
  });

  it("should allow user to withdraw from vault", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    const result = mockContract.withdraw("ST2CY5...", 5_000_000n, "ST3NB...");
    expect(result).toEqual({ value: 5_000_000n });
    expect(mockContract.userDeposits.get("ST2CY5...")).toBe(5_000_000n);
    expect(mockContract.userShares.get("ST2CY5...")).toBe(5_000_000n);
    expect(mockContract.strategyAllocations.get("ST3NB...")).toBe(5_000_000n);
  });

  it("should prevent withdrawal when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.withdraw("ST2CY5...", 5_000_000n, "ST3NB...");
    expect(result).toEqual({ error: 103 });
  });

  it("should prevent withdrawal of more than deposited", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    const result = mockContract.withdraw("ST2CY5...", 15_000_000n, "ST3NB...");
    expect(result).toEqual({ error: 101 });
  });

  it("should return user deposit", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    const result = mockContract.getUserDeposit("ST2CY5...");
    expect(result).toEqual({ value: 10_000_000n });
  });

  it("should return user shares", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    const result = mockContract.getUserShares("ST2CY5...");
    expect(result).toEqual({ value: 10_000_000n });
  });

  it("should return strategy allocation", () => {
    mockContract.addYieldStrategy(mockContract.admin, "ST3NB...", 500n, 10n);
    mockContract.deposit("ST2CY5...", 10_000_000n, "ST3NB...");
    const result = mockContract.getStrategyAllocation("ST3NB...");
    expect(result).toEqual({ value: 10_000_000n });
  });
});