;; Clarity v2
;; YieldAggregator contract for SustainaFarm
;; Central hub integrating VaultManager, StakingRewards, and Governance for yield optimization

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INVALID-STRATEGY u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-AMOUNT u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-PROPOSAL u106)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant VAULT-MANAGER 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.VaultManager)
(define-constant STAKING-REWARDS 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.StakingRewards)
(define-constant GOVERNANCE 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.Governance)
(define-constant SUST-TOKEN 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.SUSTToken)

;; Data variables
(define-data-var paused bool false)
(define-data-var admin principal CONTRACT-OWNER)
(define-data-var total-yield uint u0)

;; Data maps
(define-map strategy-yields { strategy: principal } { total-yield: uint, last-updated: uint })
(define-map user-yield-shares { user: principal, strategy: principal } uint)

;; Private helper: check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure contract is not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate strategy
(define-private (is-valid-strategy (strategy principal))
  (is-some (contract-call? VAULT-MANAGER get-strategy-details strategy))
)

;; Admin: Set contract pause state
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Admin: Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Admin: Add yield strategy
(define-public (add-yield-strategy (strategy principal) (apy uint) (risk-score uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq strategy 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (try! (contract-call? VAULT-MANAGER add-yield-strategy strategy apy risk-score))
    (map-set strategy-yields { strategy: strategy } { total-yield: u0, last-updated: (block-height) })
    (ok true)
  )
)

;; User: Deposit into vault and stake
(define-public (deposit-and-stake (amount uint) (strategy principal) (stake-duration uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (is-valid-strategy strategy) (err ERR-INVALID-STRATEGY))
    (let
      (
        (shares (unwrap-panic (contract-call? VAULT-MANAGER deposit amount strategy)))
        (user tx-sender)
      )
      (try! (contract-call? SUST-TOKEN transfer amount tx-sender (as-contract tx-sender) none))
      (try! (as-contract (contract-call? STAKING-REWARDS stake amount stake-duration)))
      (map-set user-yield-shares { user: user, strategy: strategy } 
        (+ shares (default-to u0 (map-get? user-yield-shares { user: user, strategy: strategy }))))
      (ok shares)
    )
  )
)

;; User: Withdraw and claim rewards
(define-public (withdraw-and-claim (amount uint) (strategy principal))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (is-valid-strategy strategy) (err ERR-INVALID-STRATEGY))
    (let
      (
        (user tx-sender)
        (shares (unwrap-panic (contract-call? VAULT-MANAGER withdraw amount strategy)))
        (rewards (unwrap-panic (contract-call? STAKING-REWARDS claim-rewards)))
      )
      (try! (as-contract (contract-call? SUST-TOKEN transfer rewards tx-sender user none)))
      (map-set user-yield-shares { user: user, strategy: strategy }
        (- (default-to u0 (map-get? user-yield-shares { user: user, strategy: strategy })) shares))
      (ok rewards)
    )
  )
)

;; Admin: Update yield for strategy
(define-public (update-yield (strategy principal) (yield-amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-strategy strategy) (err ERR-INVALID-STRATEGY))
    (asserts! (> yield-amount u0) (err ERR-ZERO-AMOUNT))
    (let
      (
        (current-yield (default-to { total-yield: u0, last-updated: u0 } 
          (map-get? strategy-yields { strategy: strategy })))
      )
      (map-set strategy-yields { strategy: strategy }
        { total-yield: (+ (get total-yield current-yield) yield-amount), last-updated: (block-height) })
      (var-set total-yield (+ (var-get total-yield) yield-amount))
      (try! (contract-call? STAKING-REWARDS fund-reward-pool yield-amount))
      (ok true)
    )
  )
)

;; Governance: Execute approved proposal
(define-public (execute-governance-proposal (proposal-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (let
      (
        (proposal (unwrap! (contract-call? GOVERNANCE get-proposal proposal-id) (err ERR-INVALID-PROPOSAL)))
      )
      (try! (contract-call? GOVERNANCE execute-proposal proposal-id))
      (ok true)
    )
  )
)

;; Read-only: Get user yield shares
(define-read-only (get-user-yield-shares (user principal) (strategy principal))
  (ok (default-to u0 (map-get? user-yield-shares { user: user, strategy: strategy })))
)

;; Read-only: Get strategy yield
(define-read-only (get-strategy-yield (strategy principal))
  (ok (map-get? strategy-yields { strategy: strategy }))
)

;; Read-only: Get total yield
(define-read-only (get-total-yield)
  (ok (var-get total-yield))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Is paused
(define-read-only (is-paused)
  (ok (var-get paused))
)