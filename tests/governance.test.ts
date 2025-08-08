import { describe, it, expect, beforeEach } from "vitest";

interface Proposal {
  proposer: string;
  description: string;
  votesFor: bigint;
  votesAgainst: bigint;
  endBlock: bigint;
  executed: boolean;
}

interface Vote {
  vote: boolean;
  amount: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  proposalCount: bigint;
  proposals: Map<string, Proposal>;
  votes: Map<string, Vote>;
  MIN_PROPOSAL_THRESHOLD: bigint;
  VOTING_DURATION: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  transferAdmin(caller: string, newAdmin: string): { value: boolean } | { error: number };
  createProposal(caller: string, description: string, duration: bigint): { value: bigint } | { error: number };
  vote(caller: string, proposalId: bigint, voteFor: boolean, amount: bigint): { value: boolean } | { error: number };
  executeProposal(caller: string, proposalId: bigint): { value: boolean } | { error: number };
  getProposal(proposalId: bigint): { value: Proposal | undefined };
  getVote(proposalId: bigint, voter: string): { value: Vote | undefined };
  getProposalCount(): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  proposalCount: 0n,
  proposals: new Map(),
  votes: new Map(),
  MIN_PROPOSAL_THRESHOLD: 1_000_000_000n,
  VOTING_DURATION: 1440n,

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

  createProposal(caller: string, description: string, duration: bigint) {
    if (this.paused) return { error: 104 };
    if (duration > this.VOTING_DURATION) return { error: 108 };
    const balance = 1_000_000_000n; // Mock balance check
    if (balance < this.MIN_PROPOSAL_THRESHOLD) return { error: 101 };
    const proposalId = this.proposalCount;
    this.proposals.set(proposalId.toString(), {
      proposer: caller,
      description,
      votesFor: 0n,
      votesAgainst: 0n,
      endBlock: BigInt(1000) + duration,
      executed: false,
    });
    this.proposalCount += 1n;
    return { value: proposalId };
  },

  vote(caller: string, proposalId: bigint, voteFor: boolean, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (amount === 0n) return { error: 105 };
    const balance = 1_000_000_000n; // Mock balance check
    if (balance < this.MIN_PROPOSAL_THRESHOLD) return { error: 101 };
    const proposal = this.proposals.get(proposalId.toString());
    if (!proposal) return { error: 103 };
    if (BigInt(1000) >= proposal.endBlock) return { error: 106 };
    if (this.votes.has(`${proposalId}-${caller}`)) return { error: 107 };
    if (amount > balance) return { error: 101 };
    this.votes.set(`${proposalId}-${caller}`, { vote: voteFor, amount });
    this.proposals.set(proposalId.toString(), {
      ...proposal,
      votesFor: voteFor ? proposal.votesFor + amount : proposal.votesFor,
      votesAgainst: !voteFor ? proposal.votesAgainst + amount : proposal.votesAgainst,
    });
    return { value: true };
  },

  executeProposal(caller: string, proposalId: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    const proposal = this.proposals.get(proposalId.toString());
    if (!proposal) return { error: 103 };
    if (BigInt(1000) < proposal.endBlock) return { error: 106 };
    if (proposal.executed) return { error: 100 };
    if (proposal.votesFor <= proposal.votesAgainst) return { error: 100 };
    this.proposals.set(proposalId.toString(), { ...proposal, executed: true });
    return { value: true };
  },

  getProposal(proposalId: bigint) {
    return { value: this.proposals.get(proposalId.toString()) };
  },

  getVote(proposalId: bigint, voter: string) {
    return { value: this.votes.get(`${proposalId}-${voter}`) };
  },

  getProposalCount() {
    return { value: this.proposalCount };
  },
};

describe("Governance Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.proposalCount = 0n;
    mockContract.proposals = new Map();
    mockContract.votes = new Map();
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

  it("should allow user to create proposal", () => {
    const result = mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    expect(result).toEqual({ value: 0n });
    expect(mockContract.proposals.get("0")).toEqual({
      proposer: "ST2CY5...",
      description: "Upgrade protocol",
      votesFor: 0n,
      votesAgainst: 0n,
      endBlock: 2000n,
      executed: false,
    });
    expect(mockContract.proposalCount).toBe(1n);
  });

  it("should prevent proposal with invalid duration", () => {
    const result = mockContract.createProposal("ST2CY5...", "Upgrade protocol", 2000n);
    expect(result).toEqual({ error: 108 });
  });

  it("should allow user to vote on proposal", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    const result = mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.votes.get("0-ST3NB...")).toEqual({ vote: true, amount: 500_000_000n });
    expect(mockContract.proposals.get("0")?.votesFor).toBe(500_000_000n);
  });

  it("should prevent voting on non-existent proposal", () => {
    const result = mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    expect(result).toEqual({ error: 103 });
  });

  it("should prevent voting after voting period", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    mockContract.proposals.set("0", { ...mockContract.proposals.get("0")!, endBlock: 1000n });
    const result = mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    expect(result).toEqual({ error: 106 });
  });

  it("should prevent double voting", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    const result = mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    expect(result).toEqual({ error: 107 });
  });

  it("should allow admin to execute proposal", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    mockContract.proposals.set("0", { ...mockContract.proposals.get("0")!, endBlock: 1000n });
    const result = mockContract.executeProposal(mockContract.admin, 0n);
    expect(result).toEqual({ value: true });
    expect(mockContract.proposals.get("0")?.executed).toBe(true);
  });

  it("should prevent execution of non-existent proposal", () => {
    const result = mockContract.executeProposal(mockContract.admin, 0n);
    expect(result).toEqual({ error: 103 });
  });

  it("should prevent execution by non-admin", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    const result = mockContract.executeProposal("ST3NB...", 0n);
    expect(result).toEqual({ error: 100 });
  });

  it("should return proposal details", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    const result = mockContract.getProposal(0n);
    expect(result).toEqual({
      value: {
        proposer: "ST2CY5...",
        description: "Upgrade protocol",
        votesFor: 0n,
        votesAgainst: 0n,
        endBlock: 2000n,
        executed: false,
      },
    });
  });

  it("should return vote details", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    mockContract.vote("ST3NB...", 0n, true, 500_000_000n);
    const result = mockContract.getVote(0n, "ST3NB...");
    expect(result).toEqual({ value: { vote: true, amount: 500_000_000n } });
  });

  it("should return proposal count", () => {
    mockContract.createProposal("ST2CY5...", "Upgrade protocol", 1000n);
    const result = mockContract.getProposalCount();
    expect(result).toEqual({ value: 1n });
  });
});