;; Clarity v2
;; VaultManager contract for SustainaFarm
;; Manages user deposits, allocates funds to yield strategies, tracks shares and performance

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-STRATEGY-NOT-WHITELISTED u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-AMOUNT u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-STRATEGY u106)
(define-constant ERR-MAX-DEPOSIT-EXCEEDED u107)

;; Constants
(define-constant MAX-DEPOSIT-PER-USER u1000000000000) ;; 1M STX (6 decimals)
(define-constant MIN-DEPOSIT u1000000) ;; 1 STX
(define-constant CONTRACT-OWNER tx-sender)

;; Data variables
(define-data-var paused bool false)
(define-data-var total-vault-shares uint u0)
(define-data-var total-deposited uint u0)
(define-data-var admin principal CONTRACT-OWNER)

;; Data maps
(define-map user-deposits principal uint)
(define-map user-shares principal uint)
(define-map yield-strategies principal { apy: uint, risk-score: uint, active: bool })
(define-map strategy-allocations principal uint)
(define-map user-strategy-shares { user: principal, strategy: principal } uint)

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
  (match (map-get? yield-strategies strategy)
    data (get active data)
    false
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

;; Admin: Add or update yield strategy
(define-public (add-yield-strategy (strategy principal) (apy uint) (risk-score uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq strategy 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set yield-strategies strategy { apy: apy, risk-score: risk-score, active: true })
    (ok true)
  )
)

;; Admin: Deactivate yield strategy
(define-public (deactivate-yield-strategy (strategy principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-strategy strategy) (err ERR-INVALID-STRATEGY))
    (map-set yield-strategies strategy
      (merge (unwrap-panic (map-get? yield-strategies strategy)) { active: false }))
    (ok true)
  )
)

;; User: Deposit STX into the vault
(define-public (deposit (amount uint) (strategy principal))
  (begin
    (ensure-not-paused)
    (asserts! (> amount MIN-DEPOSIT) (err ERR-ZERO-AMOUNT))
    (asserts! (is-valid-strategy strategy) (err ERR-STRATEGY-NOT-WHITELISTED))
    (let
      (
        (user tx-sender)
        (current-deposit (default-to u0 (map-get? user-deposits user)))
        (new-deposit (+ current-deposit amount))
        (vault-shares (var-get total-vault-shares))
        (new-shares (if (is-eq vault-shares u0)
                        amount
                        (/ (* amount vault-shares) (var-get total-deposited))))
      )
      (asserts! (<= new-deposit MAX-DEPOSIT-PER-USER) (err ERR-MAX-DEPOSIT-EXCEEDED))
      (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
      (map-set user-deposits user new-deposit)
      (map-set user-shares user (+ new-shares (default-to u0 (map-get? user-shares user))))
      (map-set user-strategy-shares { user: user, strategy: strategy }
        (+ new-shares (default-to u0 (map-get? user-strategy-shares { user: user, strategy: strategy }))))
      (map-set strategy-allocations strategy
        (+ amount (default-to u0 (map-get? strategy-allocations strategy))))
      (var-set total-deposited (+ (var-get total-deposited) amount))
      (var-set total-vault-shares (+ vault-shares new-shares))
      (ok new-shares)
    )
  )
)

;; User: Withdraw from the vault
(define-public (withdraw (amount uint) (strategy principal))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (is-valid-strategy strategy) (err ERR-STRATEGY-NOT-WHITELISTED))
    (let
      (
        (user tx-sender)
        (current-deposit (default-to u0 (map-get? user-deposits user)))
        (current-shares (default-to u0 (map-get? user-shares user)))
        (strategy-shares (default-to u0 (map-get? user-strategy-shares { user: user, strategy: strategy })))
        (total-deposited (var-get total-deposited))
        (total-shares (var-get total-vault-shares))
        (shares-to-burn (/ (* amount total-shares) total-deposited))
      )
      (asserts! (>= current-deposit amount) (err ERR-INSUFFICIENT-BALANCE))
      (asserts! (>= strategy-shares shares-to-burn) (err ERR-INSUFFICIENT-BALANCE))
      (try! (as-contract (stx-transfer? amount tx-sender user)))
      (map-set user-deposits user (- current-deposit amount))
      (map-set user-shares user (- current-shares shares-to-burn))
      (map-set user-strategy-shares { user: user, strategy: strategy } (- strategy-shares shares-to-burn))
      (map-set strategy-allocations strategy
        (- (default-to u0 (map-get? strategy-allocations strategy)) amount))
      (var-set total-deposited (- total-deposited amount))
      (var-set total-vault-shares (- total-shares shares-to-burn))
      (ok shares-to-burn)
    )
  )
)

;; Read-only: Get user deposit
(define-read-only (get-user-deposit (user principal))
  (ok (default-to u0 (map-get? user-deposits user)))
)

;; Read-only: Get user shares
(define-read-only (get-user-shares (user principal))
  (ok (default-to u0 (map-get? user-shares user)))
)

;; Read-only: Get strategy allocation
(define-read-only (get-strategy-allocation (strategy principal))
  (ok (default-to u0 (map-get? strategy-allocations strategy)))
)

;; Read-only: Get total deposited
(define-read-only (get-total-deposited)
  (ok (var-get total-deposited))
)

;; Read-only: Get total vault shares
(define-read-only (get-total-vault-shares)
  (ok (var-get total-vault-shares))
)

;; Read-only: Get strategy details
(define-read-only (get-strategy-details (strategy principal))
  (ok (map-get? yield-strategies strategy))
)

;; Read-only: Get user strategy shares
(define-read-only (get-user-strategy-shares (user principal) (strategy principal))
  (ok (default-to u0 (map-get? user-strategy-shares { user: user, strategy: strategy })))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Is paused
(define-read-only (is-paused)
  (ok (var-get paused))
)