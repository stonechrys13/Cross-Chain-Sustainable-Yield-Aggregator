import { describe, it, expect, beforeEach } from "vitest";

interface MockContract {
  admin: string;
  paused: boolean;
  totalSupply: bigint;
  balances: Map<string, bigint>;
  allowances: Map<string, bigint>;
  MAX_SUPPLY: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  transferAdmin(caller: string, newAdmin: string): { value: boolean } | { error: number };
  mint(caller: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  burn(caller: string, amount: bigint): { value: boolean } | { error: number };
  transfer(caller: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  approve(caller: string, spender: string, amount: bigint): { value: boolean } | { error: number };
  transferFrom(caller: string, owner: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  getBalance(account: string): { value: bigint };
  getAllowance(owner: string, spender: string): { value: bigint };
  getTotalSupply(): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  totalSupply: 0n,
  balances: new Map(),
  allowances: new Map(),
  MAX_SUPPLY: 1_000_000_000_000_000n,

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
    if (newAdmin === "SP000000000000000000002Q6VF78") return { error: 104 };
    this.admin = newAdmin;
    return { value: true };
  },

  mint(caller: string, recipient: string, amount: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (amount === 0n) return { error: 105 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 104 };
    const newSupply = this.totalSupply + amount;
    if (newSupply > this.MAX_SUPPLY) return { error: 102 };
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.totalSupply = newSupply;
    return { value: true };
  },

  burn(caller: string, amount: bigint) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 105 };
    const balance = this.balances.get(caller) || 0n;
    if (balance < amount) return { error: 101 };
    this.balances.set(caller, balance - amount);
    this.totalSupply -= amount;
    return { value: true };
  },

  transfer(caller: string, recipient: string, amount: bigint) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 105 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 104 };
    const senderBalance = this.balances.get(caller) || 0n;
    if (senderBalance < amount) return { error: 101 };
    this.balances.set(caller, senderBalance - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  },

  approve(caller: string, spender: string, amount: bigint) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 105 };
    if (spender === "SP000000000000000000002Q6VF78") return { error: 104 };
    this.allowances.set(`${caller}-${spender}`, amount);
    return { value: true };
  },

  transferFrom(caller: string, owner: string, recipient: string, amount: bigint) {
    if (this.paused) return { error: 103 };
    if (amount === 0n) return { error: 105 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 104 };
    const allowance = this.allowances.get(`${owner}-${caller}`) || 0n;
    const ownerBalance = this.balances.get(owner) || 0n;
    if (allowance < amount) return { error: 100 };
    if (ownerBalance < amount) return { error: 101 };
    this.balances.set(owner, ownerBalance - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.allowances.set(`${owner}-${caller}`, allowance - amount);
    return { value: true };
  },

  getBalance(account: string) {
    return { value: this.balances.get(account) || 0n };
  },

  getAllowance(owner: string, spender: string) {
    return { value: this.allowances.get(`${owner}-${spender}`) || 0n };
  },

  getTotalSupply() {
    return { value: this.totalSupply };
  },
};

describe("SUSTToken Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.totalSupply = 0n;
    mockContract.balances = new Map();
    mockContract.allowances = new Map();
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
    expect(result).toEqual({ error: 104 });
  });

  it("should allow admin to mint tokens", () => {
    const result = mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get("ST2CY5...")).toBe(1_000_000n);
    expect(mockContract.totalSupply).toBe(1_000_000n);
  });

  it("should prevent minting over max supply", () => {
    const result = mockContract.mint(mockContract.admin, "ST2CY5...", 2_000_000_000_000_000n);
    expect(result).toEqual({ error: 102 });
  });

  it("should prevent minting to zero address", () => {
    const result = mockContract.mint(mockContract.admin, "SP000000000000000000002Q6VF78", 1_000_000n);
    expect(result).toEqual({ error: 104 });
  });

  it("should allow user to burn tokens", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    const result = mockContract.burn("ST2CY5...", 500_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get("ST2CY5...")).toBe(500_000n);
    expect(mockContract.totalSupply).toBe(500_000n);
  });

  it("should prevent burning more than balance", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    const result = mockContract.burn("ST2CY5...", 2_000_000n);
    expect(result).toEqual({ error: 101 });
  });

  it("should allow user to transfer tokens", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    const result = mockContract.transfer("ST2CY5...", "ST3NB...", 500_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get("ST2CY5...")).toBe(500_000n);
    expect(mockContract.balances.get("ST3NB...")).toBe(500_000n);
  });

  it("should prevent transfer when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.transfer("ST2CY5...", "ST3NB...", 500_000n);
    expect(result).toEqual({ error: 103 });
  });

  it("should allow user to approve spender", () => {
    const result = mockContract.approve("ST2CY5...", "ST3NB...", 1_000_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.allowances.get("ST2CY5...-ST3NB...")).toBe(1_000_000n);
  });

  it("should allow transfer from approved amount", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    mockContract.approve("ST2CY5...", "ST3NB...", 1_000_000n);
    const result = mockContract.transferFrom("ST3NB...", "ST2CY5...", "ST4PQ...", 500_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get("ST2CY5...")).toBe(500_000n);
    expect(mockContract.balances.get("ST4PQ...")).toBe(500_000n);
    expect(mockContract.allowances.get("ST2CY5...-ST3NB...")).toBe(500_000n);
  });

  it("should prevent transfer from without sufficient allowance", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    mockContract.approve("ST2CY5...", "ST3NB...", 100_000n);
    const result = mockContract.transferFrom("ST3NB...", "ST2CY5...", "ST4PQ...", 500_000n);
    expect(result).toEqual({ error: 100 });
  });

  it("should return user balance", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    const result = mockContract.getBalance("ST2CY5...");
    expect(result).toEqual({ value: 1_000_000n });
  });

  it("should return allowance", () => {
    mockContract.approve("ST2CY5...", "ST3NB...", 1_000_000n);
    const result = mockContract.getAllowance("ST2CY5...", "ST3NB...");
    expect(result).toEqual({ value: 1_000_000n });
  });

  it("should return total supply", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 1_000_000n);
    const result = mockContract.getTotalSupply();
    expect(result).toEqual({ value: 1_000_000n });
  });
});