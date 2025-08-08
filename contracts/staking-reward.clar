;; Clarity v2
;; StakingRewards contract for SustainaFarm
;; Handles $SUST token staking, reward distribution, and early withdrawal penalties

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-ALREADY-STAKED u102)
(define-constant ERR-NOT-STAKED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-AMOUNT u105)
(define-constant ERR-ZERO-ADDRESS u106)
(define-constant ERR-INVALID-DURATION u107)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MIN-STAKE-AMOUNT u1000000) ;; 1 SUST (6 decimals)
(define-constant REWARD-RATE u100) ;; 1% per block (scaled by 100 for precision)
(define-constant MIN-STAKE-DURATION u144) ;; ~1 day (144 blocks)
(define-constant PENALTY-RATE u2000) ;; 20% penalty for early withdrawal (scaled by 10000)
(define-constant SUST-TOKEN 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.SUSTToken) ;; Reference to SUSTToken contract

;; Data variables
(define-data-var paused bool false)
(define-data-var admin principal CONTRACT-OWNER)
(define-data-var total-staked uint u0)
(define-data-var reward-pool uint u0)

;; Data maps
(define-map stakes 
  { user: principal } 
  { amount: uint, start-block: uint, duration: uint })
(define-map rewards 
  { user: principal } 
  { accumulated: uint, last-claimed: uint })

;; Private helper: check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure contract is not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: calculate rewards for a user
(define-private (calculate-rewards (user principal))
  (let
    (
      (stake-data (unwrap! (map-get? stakes { user: user }) (err ERR-NOT-STAKED)))
      (amount (get amount stake-data))
      (start-block (get start-block stake-data))
      (duration (get duration stake-data))
      (current-block (block-height))
      (blocks-staked (- current-block start-block))
      (reward (if (>= blocks-staked duration)
                (/ (* amount REWARD-RATE blocks-staked) u100)
                u0))
    )
    reward
  )
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

;; Admin: Fund reward pool
(define-public (fund-reward-pool (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (try! (contract-call? SUST-TOKEN transfer amount tx-sender (as-contract tx-sender) none))
    (var-set reward-pool (+ (var-get reward-pool) amount))
    (ok true)
  )
)

;; User: Stake tokens
(define-public (stake (amount uint) (duration uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount MIN-STAKE-AMOUNT) (err ERR-ZERO-AMOUNT))
    (asserts! (>= duration MIN-STAKE-DURATION) (err ERR-INVALID-DURATION))
    (asserts! (is-none (map-get? stakes { user: tx-sender })) (err ERR-ALREADY-STAKED))
    (try! (contract-call? SUST-TOKEN transfer amount tx-sender (as-contract tx-sender) none))
    (map-set stakes 
      { user: tx-sender } 
      { amount: amount, start-block: (block-height), duration: duration })
    (var-set total-staked (+ (var-get total-staked) amount))
    (ok true)
  )
)

;; User: Unstake tokens
(define-public (unstake)
  (begin
    (ensure-not-paused)
    (let
      (
        (user tx-sender)
        (stake-data (unwrap! (map-get? stakes { user: user }) (err ERR-NOT-STAKED)))
        (amount (get amount stake-data))
        (start-block (get start-block stake-data))
        (duration (get duration stake-data))
        (current-block (block-height))
        (blocks-staked (- current-block start-block))
        (penalty (if (< blocks-staked duration)
                   (/ (* amount PENALTY-RATE) u10000)
                   u0))
        (return-amount (- amount penalty))
      )
      (asserts! (> return-amount u0) (err ERR-ZERO-AMOUNT))
      (try! (as-contract (contract-call? SUST-TOKEN transfer return-amount tx-sender user none)))
      (if (> penalty u0)
        (var-set reward-pool (+ (var-get reward-pool) penalty))
        true)
      (map-delete stakes { user: user })
      (var-set total-staked (- (var-get total-staked) amount))
      (ok return-amount)
    )
  )
)

;; User: Claim rewards
(define-public (claim-rewards)
  (begin
    (ensure-not-paused)
    (let
      (
        (user tx-sender)
        (reward (calculate-rewards user))
        (current-rewards (default-to { accumulated: u0, last-claimed: u0 } (map-get? rewards { user: user })))
        (total-rewards (+ (get accumulated current-rewards) reward))
      )
      (asserts! (> total-rewards u0) (err ERR-ZERO-AMOUNT))
      (asserts! (>= (var-get reward-pool) total-rewards) (err ERR-INSUFFICIENT-BALANCE))
      (try! (as-contract (contract-call? SUST-TOKEN transfer total-rewards tx-sender user none)))
      (map-set rewards 
        { user: user } 
        { accumulated: u0, last-claimed: (block-height) })
      (var-set reward-pool (- (var-get reward-pool) total-rewards))
      (ok total-rewards)
    )
  )
)

;; Read-only: Get user stake
(define-read-only (get-user-stake (user principal))
  (ok (map-get? stakes { user: user }))
)

;; Read-only: Get user rewards
(define-read-only (get-user-rewards (user principal))
  (ok (+ (calculate-rewards user)
         (default-to u0 (get accumulated (map-get? rewards { user: user })))))
)

;; Read-only: Get total staked
(define-read-only (get-total-staked)
  (ok (var-get total-staked))
)

;; Read-only: Get reward pool
(define-read-only (get-reward-pool)
  (ok (var-get reward-pool))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Is paused
(define-read-only (is-paused)
  (ok (var-get paused))
)