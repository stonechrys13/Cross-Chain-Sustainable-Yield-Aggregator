;; Clarity v2
;; Governance contract for SustainaFarm
;; Manages proposals and voting by SUST token holders for protocol upgrades

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-TOKENS u101)
(define-constant ERR-PROPOSAL-EXISTS u102)
(define-constant ERR-NO-PROPOSAL u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-AMOUNT u105)
(define-constant ERR-VOTING-ENDED u106)
(define-constant ERR-ALREADY-VOTED u107)
(define-constant ERR-INVALID-DURATION u108)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MIN-PROPOSAL-THRESHOLD u1000000000) ;; 1000 SUST (6 decimals)
(define-constant VOTING-DURATION u1440) ;; ~10 days (1440 blocks)
(define-constant SUST-TOKEN 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.SUSTToken) ;; Reference to SUSTToken contract

;; Data variables
(define-data-var paused bool false)
(define-data-var admin principal CONTRACT-OWNER)
(define-data-var proposal-count uint u0)

;; Data maps
(define-map proposals 
  { id: uint } 
  { proposer: principal, description: (string-ascii 256), votes-for: uint, votes-against: uint, end-block: uint, executed: bool })
(define-map votes 
  { proposal-id: uint, voter: principal } 
  { vote: bool, amount: uint })

;; Private helper: check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure contract is not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: check if voter has sufficient tokens
(define-private (has-sufficient-tokens (voter principal))
  (let
    (
      (balance (unwrap-panic (contract-call? SUST-TOKEN get-balance voter)))
    )
    (>= balance MIN-PROPOSAL-THRESHOLD)
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

;; User: Create a new proposal
(define-public (create-proposal (description (string-ascii 256)) (duration uint))
  (begin
    (ensure-not-paused)
    (asserts! (has-sufficient-tokens tx-sender) (err ERR-INSUFFICIENT-TOKENS))
    (asserts! (<= duration VOTING-DURATION) (err ERR-INVALID-DURATION))
    (let
      (
        (proposal-id (var-get proposal-count))
      )
      (map-set proposals 
        { id: proposal-id } 
        { proposer: tx-sender, description: description, votes-for: u0, votes-against: u0, end-block: (+ (block-height) duration), executed: false })
      (var-set proposal-count (+ proposal-id u1))
      (ok proposal-id)
    )
  )
)

;; User: Vote on a proposal
(define-public (vote (proposal-id uint) (vote-for bool) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-ZERO-AMOUNT))
    (asserts! (has-sufficient-tokens tx-sender) (err ERR-INSUFFICIENT-TOKENS))
    (let
      (
        (proposal (unwrap! (map-get? proposals { id: proposal-id }) (err ERR-NO-PROPOSAL)))
        (voter tx-sender)
      )
      (asserts! (< (block-height) (get end-block proposal)) (err ERR-VOTING-ENDED))
      (asserts! (is-none (map-get? votes { proposal-id: proposal-id, voter: voter })) (err ERR-ALREADY-VOTED))
      (asserts! (<= amount (unwrap-panic (contract-call? SUST-TOKEN get-balance voter))) (err ERR-INSUFFICIENT-TOKENS))
      (map-set votes { proposal-id: proposal-id, voter: voter } { vote: vote-for, amount: amount })
      (map-set proposals 
        { id: proposal-id }
        (merge proposal 
          (if vote-for
            { votes-for: (+ (get votes-for proposal) amount) }
            { votes-against: (+ (get votes-against proposal) amount) })))
      (ok true)
    )
  )
)

;; Admin: Execute a proposal
(define-public (execute-proposal (proposal-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (let
      (
        (proposal (unwrap! (map-get? proposals { id: proposal-id }) (err ERR-NO-PROPOSAL)))
      )
      (asserts! (>= (block-height) (get end-block proposal)) (err ERR-VOTING-ENDED))
      (asserts! (not (get executed proposal)) (err ERR-NOT-AUTHORIZED))
      (asserts! (> (get votes-for proposal) (get votes-against proposal)) (err ERR-NOT-AUTHORIZED))
      (map-set proposals 
        { id: proposal-id }
        (merge proposal { executed: true }))
      (ok true)
    )
  )
)

;; Read-only: Get proposal details
(define-read-only (get-proposal (proposal-id uint))
  (ok (map-get? proposals { id: proposal-id }))
)

;; Read-only: Get vote details
(define-read-only (get-vote (proposal-id uint) (voter principal))
  (ok (map-get? votes { proposal-id: proposal-id, voter: voter }))
)

;; Read-only: Get proposal count
(define-read-only (get-proposal-count)
  (ok (var-get proposal-count))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Is paused
(define-read-only (is-paused)
  (ok (var-get paused))
)