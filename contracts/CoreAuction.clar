(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-START-TIME u101)
(define-constant ERR-INVALID-END-TIME u102)
(define-constant ERR-INVALID-RESERVE-PRICE u103)
(define-constant ERR-INVALID-MIN-INCREMENT u104)
(define-constant ERR-INVALID-ITEM-DESCRIPTION u105)
(define-constant ERR-AUCTION-ALREADY-EXISTS u106)
(define-constant ERR-AUCTION-NOT-FOUND u107)
(define-constant ERR-AUCTION-NOT-ACTIVE u108)
(define-constant ERR-BID-BELOW-RESERVE u109)
(define-constant ERR-BID-BELOW_INCREMENT u110)
(define-constant ERR-AUCTION-ENDED u111)
(define-constant ERR-AUCTION-NOT-ENDED u112)
(define-constant ERR-INVALID-BID-AMOUNT u113)
(define-constant ERR-INVALID-ANTI-SNIPING u114)
(define-constant ERR-INVALID-EXTENSION u115)
(define-constant ERR-INVALID-SELLER u116)
(define-constant ERR-INVALID-TOKEN u117)
(define-constant ERR-MAX-AUCTIONS-EXCEEDED u118)
(define-constant ERR-INVALID-STATUS u119)
(define-constant ERR-INVALID-LOCATION u120)
(define-constant ERR-INVALID-CURRENCY u121)
(define-constant ERR-INVALID-BIDDER u122)
(define-constant ERR-INVALID-WINNER u123)
(define-constant ERR-INVALID-FEE-RATE u124)
(define-constant ERR-INVALID-ORACLE u125)

(define-data-var next-auction-id uint u0)
(define-data-var max-auctions uint u10000)
(define-data-var platform-fee-rate uint u5)
(define-data-var anti-sniping-duration uint u10)
(define-data-var escrow-contract (optional principal) none)
(define-data-var oracle-contract (optional principal) none)

(define-map auctions
  uint
  {
    seller: principal,
    start-time: uint,
    end-time: uint,
    reserve-price: uint,
    min-increment: uint,
    highest-bid: uint,
    highest-bidder: (optional principal),
    item-description: (string-utf8 500),
    token-type: (string-utf8 20),
    status: bool,
    location: (string-utf8 100),
    currency: (string-utf8 20),
    extension-count: uint,
    winner: (optional principal)
  }
)

(define-map auction-bids
  { auction-id: uint, bidder: principal }
  {
    bid-amount: uint,
    timestamp: uint
  }
)

(define-map auction-history
  uint
  (list 100 { bidder: principal, amount: uint, time: uint })
)

(define-map auctions-by-seller
  principal
  (list 100 uint)
)

(define-read-only (get-auction (id uint))
  (map-get? auctions id)
)

(define-read-only (get-auction-bid (id uint) (bidder principal))
  (map-get? auction-bids { auction-id: id, bidder: bidder })
)

(define-read-only (get-auction-history (id uint))
  (map-get? auction-history id)
)

(define-read-only (get-auctions-by-seller (seller principal))
  (map-get? auctions-by-seller seller)
)

(define-private (validate-start-time (time uint))
  (if (>= time block-height)
      (ok true)
      (err ERR-INVALID-START-TIME))
)

(define-private (validate-end-time (start uint) (end uint))
  (if (> end start)
      (ok true)
      (err ERR-INVALID-END-TIME))
)

(define-private (validate-reserve-price (price uint))
  (if (> price u0)
      (ok true)
      (err ERR-INVALID-RESERVE-PRICE))
)

(define-private (validate-min-increment (inc uint))
  (if (> inc u0)
      (ok true)
      (err ERR-INVALID-MIN-INCREMENT))
)

(define-private (validate-item-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
      (ok true)
      (err ERR-INVALID-ITEM-DESCRIPTION))
)

(define-private (validate-token-type (token (string-utf8 20)))
  (if (or (is-eq token "STX") (is-eq token "SIP10") (is-eq token "NFT"))
      (ok true)
      (err ERR-INVALID-TOKEN))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-fee-rate (rate uint))
  (if (<= rate u10)
      (ok true)
      (err ERR-INVALID-FEE-RATE))
)

(define-private (validate-oracle (oracle principal))
  (if (not (is-eq oracle 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-ORACLE))
)

(define-public (set-escrow-contract (contract principal))
  (begin
    (try! (validate-oracle contract))
    (asserts! (is-none (var-get escrow-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set escrow-contract (some contract))
    (ok true)
  )
)

(define-public (set-oracle-contract (contract principal))
  (begin
    (try! (validate-oracle contract))
    (asserts! (is-none (var-get oracle-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-contract (some contract))
    (ok true)
  )
)

(define-public (set-platform-fee-rate (new-rate uint))
  (begin
    (try! (validate-fee-rate new-rate))
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (var-set platform-fee-rate new-rate)
    (ok true)
  )
)

(define-public (set-anti-sniping-duration (duration uint))
  (begin
    (asserts! (> duration u0) (err ERR-INVALID-ANTI-SNIPING))
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (var-set anti-sniping-duration duration)
    (ok true)
  )
)

(define-public (create-auction
  (start-time uint)
  (end-time uint)
  (reserve-price uint)
  (min-increment uint)
  (item-description (string-utf8 500))
  (token-type (string-utf8 20))
  (location (string-utf8 100))
  (currency (string-utf8 20))
)
  (let (
        (next-id (var-get next-auction-id))
        (current-max (var-get max-auctions))
        (seller tx-sender)
        (escrow (var-get escrow-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-AUCTIONS-EXCEEDED))
    (try! (validate-start-time start-time))
    (try! (validate-end-time start-time end-time))
    (try! (validate-reserve-price reserve-price))
    (try! (validate-min-increment min-increment))
    (try! (validate-item-description item-description))
    (try! (validate-token-type token-type))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (asserts! (is-some escrow) (err ERR-NOT-AUTHORIZED))
    (map-set auctions next-id
      {
        seller: seller,
        start-time: start-time,
        end-time: end-time,
        reserve-price: reserve-price,
        min-increment: min-increment,
        highest-bid: u0,
        highest-bidder: none,
        item-description: item-description,
        token-type: token-type,
        status: true,
        location: location,
        currency: currency,
        extension-count: u0,
        winner: none
      }
    )
    (map-set auction-history next-id (list))
    (map-set auctions-by-seller seller (append (default-to (list) (map-get? auctions-by-seller seller)) next-id))
    (var-set next-auction-id (+ next-id u1))
    (print { event: "auction-created", id: next-id })
    (ok next-id)
  )
)

(define-public (place-bid (auction-id uint) (bid-amount uint))
  (let (
        (auction (unwrap! (map-get? auctions auction-id) (err ERR-AUCTION-NOT-FOUND)))
        (current-time block-height)
        (min-bid (+ (get highest-bid auction) (get min-increment auction)))
        (escrow (unwrap! (var-get escrow-contract) (err ERR-NOT-AUTHORIZED)))
      )
    (asserts! (get status auction) (err ERR-AUCTION-NOT-ACTIVE))
    (asserts! (>= current-time (get start-time auction)) (err ERR-AUCTION-NOT-ACTIVE))
    (asserts! (< current-time (get end-time auction)) (err ERR-AUCTION-ENDED))
    (asserts! (>= bid-amount min-bid) (err ERR-BID-BELOW_INCREMENT))
    (asserts! (>= bid-amount (get reserve-price auction)) (err ERR-BID-BELOW-RESERVE))
    (try! (as-contract (contract-call? escrow lock-funds tx-sender bid-amount auction-id)))
    (if (>= (- (get end-time auction) current-time) (var-get anti-sniping-duration))
        (ok true)
        (begin
          (map-set auctions auction-id (merge auction { end-time: (+ (get end-time auction) (var-get anti-sniping-duration)), extension-count: (+ (get extension-count auction) u1) }))
          (ok true)
        )
    )
    (map-set auctions auction-id (merge auction { highest-bid: bid-amount, highest-bidder: (some tx-sender) }))
    (map-set auction-bids { auction-id: auction-id, bidder: tx-sender } { bid-amount: bid-amount, timestamp: current-time })
    (map-set auction-history auction-id (append (default-to (list) (map-get? auction-history auction-id)) { bidder: tx-sender, amount: bid-amount, time: current-time }))
    (print { event: "bid-placed", auction-id: auction-id, bidder: tx-sender, amount: bid-amount })
    (ok true)
  )
)

(define-public (end-auction (auction-id uint))
  (let (
        (auction (unwrap! (map-get? auctions auction-id) (err ERR-AUCTION-NOT-FOUND)))
        (current-time block-height)
        (escrow (unwrap! (var-get escrow-contract) (err ERR-NOT-AUTHORIZED)))
        (oracle (var-get oracle-contract))
      )
    (asserts! (get status auction) (err ERR-AUCTION-NOT-ACTIVE))
    (asserts! (>= current-time (get end-time auction)) (err ERR-AUCTION-NOT-ENDED))
    (map-set auctions auction-id (merge auction { status: false, winner: (get highest-bidder auction) }))
    (if (is-some (get highest-bidder auction))
        (let (
              (winner (unwrap! (get highest-bidder auction) (err ERR-INVALID-WINNER)))
              (amount (get highest-bid auction))
              (fee (/ (* amount (var-get platform-fee-rate)) u100))
              (net-amount (- amount fee))
            )
          (try! (as-contract (contract-call? escrow release-to-seller (get seller auction) net-amount auction-id)))
          (try! (as-contract (contract-call? escrow release-fee fee auction-id)))
          (if (is-some oracle)
              (try! (as-contract (contract-call? (unwrap! oracle (err ERR-INVALID-ORACLE)) verify-asset auction-id)))
              (ok true)
          )
          (print { event: "auction-ended", id: auction-id, winner: winner, amount: amount })
          (ok winner)
        )
        (begin
          (try! (as-contract (contract-call? escrow refund-all auction-id)))
          (print { event: "auction-ended-no-winner", id: auction-id })
          (ok none)
        )
    )
  )
)

(define-public (get-auction-count)
  (ok (var-get next-auction-id))
)

(define-public (is-auction-active (id uint))
  (let ((auction (map-get? auctions id)))
    (ok (and (is-some auction) (get status (unwrap! auction false))))
  )
)