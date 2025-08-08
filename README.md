# SustainaFarm

A cross-chain, sustainable yield farming and staking protocol built with Clarity. SustainaFarm auto-allocates capital to verified, risk-adjusted farming opportunities and rewards users for long-term participation—all while maintaining transparency and promoting regenerative finance.

---

## Overview

SustainaFarm consists of five core smart contracts that work together to create a secure, transparent, and impact-aligned yield farming ecosystem:

1. **Vault Manager Contract** – Allocates and rebalances user deposits across multiple yield opportunities.
2. **Staking & Rewards Contract** – Handles long-term staking and distributes sustainable yield incentives.
3. **Yield Verification Contract** – Verifies the legitimacy and source of yield through on-chain/off-chain data.
4. **Governance DAO Contract** – Enables the community to govern protocol parameters, whitelists, and emissions.
5. **Bridge Adapter Contract** – Facilitates interaction with cross-chain farming strategies (optional module).

---

## Features

- **Risk-adjusted auto-compounding vaults**  
- **Long-term staking with tiered rewards**  
- **Sustainable yield verification via oracles**  
- **Decentralized governance over emissions and strategies**  
- **Cross-chain farming support** (via adapter)  

---

## Smart Contracts

### Vault Manager Contract
- Accepts and tracks user deposits
- Allocates capital to whitelisted strategies
- Rebalances funds based on APY and sustainability score
- Supports multi-chain bridging (via adapter)

### Staking & Rewards Contract
- Lock-based staking of $SUST tokens
- Tiered rewards based on staking duration
- Penalty or cooldown mechanisms for early withdrawal
- Claims processed automatically from farming returns

### Yield Verification Contract
- Fetches and verifies APY data from oracles
- Tracks sustainability score (e.g., carbon-negative, certified sources)
- Flags high-risk or opaque farming sources
- Acts as a gatekeeper for vault participation

### Governance DAO Contract
- Token-based proposal and voting system
- Adjusts reward multipliers, emissions, and strategy eligibility
- Community-controlled whitelist and blacklist management
- Optional use of veSUST model for voting power

### Bridge Adapter Contract (Optional)
- Interfaces with external chain bridges (LayerZero, Axelar, etc.)
- Secures cross-chain interactions for farming
- Modular, supports future ecosystem expansions

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started)
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/sustainafarm.git
   ```
3. Run tests:
    ```bash
    npm test
    ```
4. Deploy contracts:
    ```bash
    clarinet deploy
    ```

---

## Usage

Each smart contract is modular and can be deployed individually. Together, they form a full ecosystem for sustainable DeFi participation. Refer to the /contracts directory and individual documentation for ABI details and interaction guides.

---

## License

MIT License