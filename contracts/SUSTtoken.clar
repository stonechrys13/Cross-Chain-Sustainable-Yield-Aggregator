;; Clarity v2
;; SUSTToken contract for SustainaFarm
;; Fungible token for governance and rewards with mint, burn, and transfer functionality

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-MAX-SUPPLY-REACHED u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-ADDRESS u104)
(define-constant ERR-ZERO-AMOUNT u105)

;; Token metadata
(define-constant TOKEN-NAME "SustainaFarm Token")
(define-constant TOKEN-SYMBOL "SUST")
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-SUPPLY u1000000000000000) ;; 1T tokens (6 decimals)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint u0)

;; Data maps
(define-map balances principal uint)
(define-map allowances { owner: principal, spender: principal } uint)

;; Fungible token trait implementation
(define-fungible-token sust TOKEN-DECIMALS)

;; Private helper: check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure contract is not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
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

;; Admin: Mint new tokens
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let
      (
        (new-supply (+ (var-get total-supply) amount))
      )
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (try! (ft-mint? sust amount recipient))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (var-set total-supply new-supply)
      (ok true)
    )
  )
)

;; User: Burn tokens
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (let
      (
        (balance (default-to u0 (map-get? balances tx-sender)))
      )
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (ft-burn? sust amount tx-sender))
      (map-set balances tx-sender (- balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (ok true)
    )
  )
)

;; User: Transfer tokens
(define-public (transfer (recipient principal) (amount uint) (memo (optional (buff 34))))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let
      (
        (sender-balance (default-to u0 (map-get? balances tx-sender)))
      )
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (ft-transfer? sust amount tx-sender recipient))
      (map-set balances tx-sender (- sender-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (ok true)
    )
  )
)

;; User: Approve spender
(define-public (approve (spender principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (not (is-eq spender 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set allowances { owner: tx-sender, spender: spender } amount)
    (ok true)
  )
)

;; User: Transfer from (using allowance)
(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let
      (
        (allowance (default-to u0 (map-get? allowances { owner: owner, spender: tx-sender })))
        (owner-balance (default-to u0 (map-get? balances owner)))
      )
      (asserts! (>= allowance amount) (err ERR-NOT-AUTHORIZED))
      (asserts! (>= owner-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (ft-transfer? sust amount owner recipient))
      (map-set balances owner (- owner-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (map-set allowances { owner: owner, spender: tx-sender } (- allowance amount))
      (ok true)
    )
  )
)

;; Read-only: Get balance
(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

;; Read-only: Get allowance
(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances { owner: owner, spender: spender })))
)

;; Read-only: Get total supply
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Is paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: Get token name
(define-read-only (get-name)
  (ok TOKEN-NAME)
)

;; Read-only: Get token symbol
(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

;; Read-only: Get token decimals
(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)