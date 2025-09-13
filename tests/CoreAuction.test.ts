import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, optionalCV, principalCV, listCV, tupleCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_START_TIME = 101;
const ERR_INVALID_END_TIME = 102;
const ERR_INVALID_RESERVE_PRICE = 103;
const ERR_INVALID_MIN_INCREMENT = 104;
const ERR_INVALID_ITEM_DESCRIPTION = 105;
const ERR_AUCTION_ALREADY_EXISTS = 106;
const ERR_AUCTION_NOT_FOUND = 107;
const ERR_AUCTION_NOT_ACTIVE = 108;
const ERR_BID_BELOW_RESERVE = 109;
const ERR_BID_BELOW_INCREMENT = 110;
const ERR_AUCTION_ENDED = 111;
const ERR_AUCTION_NOT_ENDED = 112;
const ERR_INVALID_BID_AMOUNT = 113;
const ERR_INVALID_ANTI_SNIPING = 114;
const ERR_INVALID_EXTENSION = 115;
const ERR_INVALID_SELLER = 116;
const ERR_INVALID_TOKEN = 117;
const ERR_MAX_AUCTIONS_EXCEEDED = 118;
const ERR_INVALID_STATUS = 119;
const ERR_INVALID_LOCATION = 120;
const ERR_INVALID_CURRENCY = 121;
const ERR_INVALID_BIDDER = 122;
const ERR_INVALID_WINNER = 123;
const ERR_INVALID_FEE_RATE = 124;
const ERR_INVALID_ORACLE = 125;

interface Auction {
  seller: string;
  startTime: number;
  endTime: number;
  reservePrice: number;
  minIncrement: number;
  highestBid: number;
  highestBidder: string | null;
  itemDescription: string;
  tokenType: string;
  status: boolean;
  location: string;
  currency: string;
  extensionCount: number;
  winner: string | null;
}

interface Bid {
  bidAmount: number;
  timestamp: number;
}

interface HistoryEntry {
  bidder: string;
  amount: number;
  time: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CoreAuctionMock {
  state: {
    nextAuctionId: number;
    maxAuctions: number;
    platformFeeRate: number;
    antiSnipingDuration: number;
    escrowContract: string | null;
    oracleContract: string | null;
    auctions: Map<number, Auction>;
    auctionBids: Map<string, Bid>;
    auctionHistory: Map<number, HistoryEntry[]>;
    auctionsBySeller: Map<string, number[]>;
  } = {
    nextAuctionId: 0,
    maxAuctions: 10000,
    platformFeeRate: 5,
    antiSnipingDuration: 10,
    escrowContract: null,
    oracleContract: null,
    auctions: new Map(),
    auctionBids: new Map(),
    auctionHistory: new Map(),
    auctionsBySeller: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1SELLER";
  escrowCalls: Array<{ method: string; params: any[] }> = [];
  oracleCalls: Array<{ method: string; params: any[] }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextAuctionId: 0,
      maxAuctions: 10000,
      platformFeeRate: 5,
      antiSnipingDuration: 10,
      escrowContract: null,
      oracleContract: null,
      auctions: new Map(),
      auctionBids: new Map(),
      auctionHistory: new Map(),
      auctionsBySeller: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1SELLER";
    this.escrowCalls = [];
    this.oracleCalls = [];
  }

  setEscrowContract(contract: string): Result<boolean> {
    if (contract === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_ORACLE };
    }
    if (this.state.escrowContract !== null) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.escrowContract = contract;
    return { ok: true, value: true };
  }

  setOracleContract(contract: string): Result<boolean> {
    if (contract === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_ORACLE };
    }
    if (this.state.oracleContract !== null) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.oracleContract = contract;
    return { ok: true, value: true };
  }

  setPlatformFeeRate(newRate: number): Result<boolean> {
    if (newRate > 10) return { ok: false, value: ERR_INVALID_FEE_RATE };
    if (this.caller !== "ST1SELLER") return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.platformFeeRate = newRate;
    return { ok: true, value: true };
  }

  setAntiSnipingDuration(duration: number): Result<boolean> {
    if (duration <= 0) return { ok: false, value: ERR_INVALID_ANTI_SNIPING };
    if (this.caller !== "ST1SELLER") return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.antiSnipingDuration = duration;
    return { ok: true, value: true };
  }

  createAuction(
    startTime: number,
    endTime: number,
    reservePrice: number,
    minIncrement: number,
    itemDescription: string,
    tokenType: string,
    location: string,
    currency: string
  ): Result<number> {
    if (this.state.nextAuctionId >= this.state.maxAuctions) return { ok: false, value: ERR_MAX_AUCTIONS_EXCEEDED };
    if (startTime < this.blockHeight) return { ok: false, value: ERR_INVALID_START_TIME };
    if (endTime <= startTime) return { ok: false, value: ERR_INVALID_END_TIME };
    if (reservePrice <= 0) return { ok: false, value: ERR_INVALID_RESERVE_PRICE };
    if (minIncrement <= 0) return { ok: false, value: ERR_INVALID_MIN_INCREMENT };
    if (!itemDescription || itemDescription.length > 500) return { ok: false, value: ERR_INVALID_ITEM_DESCRIPTION };
    if (!["STX", "SIP10", "NFT"].includes(tokenType)) return { ok: false, value: ERR_INVALID_TOKEN };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!this.state.escrowContract) return { ok: false, value: ERR_NOT_AUTHORIZED };

    const id = this.state.nextAuctionId;
    const auction: Auction = {
      seller: this.caller,
      startTime,
      endTime,
      reservePrice,
      minIncrement,
      highestBid: 0,
      highestBidder: null,
      itemDescription,
      tokenType,
      status: true,
      location,
      currency,
      extensionCount: 0,
      winner: null,
    };
    this.state.auctions.set(id, auction);
    this.state.auctionHistory.set(id, []);
    const sellerAuctions = this.state.auctionsBySeller.get(this.caller) || [];
    sellerAuctions.push(id);
    this.state.auctionsBySeller.set(this.caller, sellerAuctions);
    this.state.nextAuctionId++;
    return { ok: true, value: id };
  }

  placeBid(auctionId: number, bidAmount: number): Result<boolean> {
    const auction = this.state.auctions.get(auctionId);
    if (!auction) return { ok: false, value: ERR_AUCTION_NOT_FOUND };
    if (!auction.status) return { ok: false, value: ERR_AUCTION_NOT_ACTIVE };
    if (this.blockHeight < auction.startTime) return { ok: false, value: ERR_AUCTION_NOT_ACTIVE };
    if (this.blockHeight >= auction.endTime) return { ok: false, value: ERR_AUCTION_ENDED };
    const minBid = auction.highestBid + auction.minIncrement;
    if (bidAmount < minBid) return { ok: false, value: ERR_BID_BELOW_INCREMENT };
    if (bidAmount < auction.reservePrice) return { ok: false, value: ERR_BID_BELOW_RESERVE };
    if (!this.state.escrowContract) return { ok: false, value: ERR_NOT_AUTHORIZED };

    this.escrowCalls.push({ method: "lock-funds", params: [this.caller, bidAmount, auctionId] });

    if (auction.endTime - this.blockHeight <= this.state.antiSnipingDuration) {
      auction.endTime += this.state.antiSnipingDuration;
      auction.extensionCount++;
    }

    auction.highestBid = bidAmount;
    auction.highestBidder = this.caller;
    this.state.auctions.set(auctionId, auction);
    this.state.auctionBids.set(`${auctionId}-${this.caller}`, { bidAmount, timestamp: this.blockHeight });
    const history = this.state.auctionHistory.get(auctionId) || [];
    history.push({ bidder: this.caller, amount: bidAmount, time: this.blockHeight });
    this.state.auctionHistory.set(auctionId, history);
    return { ok: true, value: true };
  }

  endAuction(auctionId: number): Result<string | null> {
    const auction = this.state.auctions.get(auctionId);
    if (!auction) return { ok: false, value: ERR_AUCTION_NOT_FOUND };
    if (!auction.status) return { ok: false, value: ERR_AUCTION_NOT_ACTIVE };
    if (this.blockHeight < auction.endTime) return { ok: false, value: ERR_AUCTION_NOT_ENDED };
    if (!this.state.escrowContract) return { ok: false, value: ERR_NOT_AUTHORIZED };

    auction.status = false;
    auction.winner = auction.highestBidder;
    this.state.auctions.set(auctionId, auction);

    if (auction.highestBidder) {
      const amount = auction.highestBid;
      const fee = (amount * this.state.platformFeeRate) / 100;
      const netAmount = amount - fee;
      this.escrowCalls.push({ method: "release-to-seller", params: [auction.seller, netAmount, auctionId] });
      this.escrowCalls.push({ method: "release-fee", params: [fee, auctionId] });
      if (this.state.oracleContract) {
        this.oracleCalls.push({ method: "verify-asset", params: [auctionId] });
      }
      return { ok: true, value: auction.highestBidder };
    } else {
      this.escrowCalls.push({ method: "refund-all", params: [auctionId] });
      return { ok: true, value: null };
    }
  }

  getAuction(id: number): Auction | null {
    return this.state.auctions.get(id) || null;
  }

  getAuctionBid(id: number, bidder: string): Bid | null {
    return this.state.auctionBids.get(`${id}-${bidder}`) || null;
  }

  getAuctionHistory(id: number): HistoryEntry[] | null {
    return this.state.auctionHistory.get(id) || null;
  }

  getAuctionsBySeller(seller: string): number[] | null {
    return this.state.auctionsBySeller.get(seller) || null;
  }

  getAuctionCount(): Result<number> {
    return { ok: true, value: this.state.nextAuctionId };
  }

  isAuctionActive(id: number): Result<boolean> {
    const auction = this.state.auctions.get(id);
    return { ok: true, value: !!auction && auction.status };
  }
}

describe("CoreAuction", () => {
  let contract: CoreAuctionMock;

  beforeEach(() => {
    contract = new CoreAuctionMock();
    contract.reset();
  });

  it("creates an auction successfully", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    const result = contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const auction = contract.getAuction(0);
    expect(auction?.seller).toBe("ST1SELLER");
    expect(auction?.startTime).toBe(101);
    expect(auction?.endTime).toBe(200);
    expect(auction?.reservePrice).toBe(1000);
    expect(auction?.minIncrement).toBe(100);
    expect(auction?.itemDescription).toBe("Rare Art Piece");
    expect(auction?.tokenType).toBe("NFT");
    expect(auction?.status).toBe(true);
    expect(auction?.location).toBe("GalleryX");
    expect(auction?.currency).toBe("STX");
    expect(auction?.extensionCount).toBe(0);
    expect(auction?.winner).toBe(null);
  });

  it("rejects auction creation with invalid start time", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    const result = contract.createAuction(
      99,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_START_TIME);
  });

  it("rejects auction creation without escrow contract", () => {
    contract.blockHeight = 100;
    const result = contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("places a bid successfully", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    contract.caller = "ST3BIDDER";
    contract.blockHeight = 150;
    const result = contract.placeBid(0, 1100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const auction = contract.getAuction(0);
    expect(auction?.highestBid).toBe(1100);
    expect(auction?.highestBidder).toBe("ST3BIDDER");
    const bid = contract.getAuctionBid(0, "ST3BIDDER");
    expect(bid?.bidAmount).toBe(1100);
    expect(bid?.timestamp).toBe(150);
    const history = contract.getAuctionHistory(0);
    expect(history?.length).toBe(1);
    expect(history?.[0].bidder).toBe("ST3BIDDER");
    expect(history?.[0].amount).toBe(1100);
    expect(history?.[0].time).toBe(150);
    expect(contract.escrowCalls).toEqual([{ method: "lock-funds", params: ["ST3BIDDER", 1100, 0] }]);
  });

  it("extends auction time due to sniping", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      110,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    contract.caller = "ST3BIDDER";
    contract.blockHeight = 105;
    contract.placeBid(0, 1100);
    const auction = contract.getAuction(0);
    expect(auction?.endTime).toBe(120);
    expect(auction?.extensionCount).toBe(1);
  });

  it("rejects bid below increment", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    contract.caller = "ST3BIDDER";
    contract.blockHeight = 150;
    contract.placeBid(0, 1100);
    const result = contract.placeBid(0, 1150);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BID_BELOW_INCREMENT);
  });

  it("ends auction with winner", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.setOracleContract("ST4ORACLE");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    contract.caller = "ST3BIDDER";
    contract.blockHeight = 150;
    contract.placeBid(0, 1100);
    contract.blockHeight = 201;
    const result = contract.endAuction(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe("ST3BIDDER");

    const auction = contract.getAuction(0);
    expect(auction?.status).toBe(false);
    expect(auction?.winner).toBe("ST3BIDDER");
    expect(contract.escrowCalls).toEqual([
      { method: "lock-funds", params: ["ST3BIDDER", 1100, 0] },
      { method: "release-to-seller", params: ["ST1SELLER", 1045, 0] },
      { method: "release-fee", params: [55, 0] },
    ]);
    expect(contract.oracleCalls).toEqual([{ method: "verify-asset", params: [0] }]);
  });

  it("ends auction without winner", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    contract.blockHeight = 201;
    const result = contract.endAuction(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(null);

    const auction = contract.getAuction(0);
    expect(auction?.status).toBe(false);
    expect(auction?.winner).toBe(null);
    expect(contract.escrowCalls).toEqual([{ method: "refund-all", params: [0] }]);
  });

  it("rejects end auction before end time", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    contract.blockHeight = 199;
    const result = contract.endAuction(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUCTION_NOT_ENDED);
  });

  it("sets platform fee rate successfully", () => {
    contract.caller = "ST1SELLER";
    const result = contract.setPlatformFeeRate(7);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.platformFeeRate).toBe(7);
  });

  it("rejects invalid platform fee rate", () => {
    contract.caller = "ST1SELLER";
    const result = contract.setPlatformFeeRate(11);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FEE_RATE);
  });

  it("sets anti-sniping duration successfully", () => {
    contract.caller = "ST1SELLER";
    const result = contract.setAntiSnipingDuration(15);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.antiSnipingDuration).toBe(15);
  });

  it("rejects invalid anti-sniping duration", () => {
    contract.caller = "ST1SELLER";
    const result = contract.setAntiSnipingDuration(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ANTI_SNIPING);
  });

  it("returns correct auction count", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Item1",
      "NFT",
      "Loc1",
      "STX"
    );
    contract.createAuction(
      101,
      200,
      2000,
      200,
      "Item2",
      "SIP10",
      "Loc2",
      "USD"
    );
    const result = contract.getAuctionCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks if auction is active", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Rare Art Piece",
      "NFT",
      "GalleryX",
      "STX"
    );
    const result = contract.isAuctionActive(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.isAuctionActive(99);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses auction parameters with Clarity types", () => {
    const desc = stringUtf8CV("Rare Art Piece");
    const start = uintCV(101);
    const end = uintCV(200);
    expect(desc.value).toBe("Rare Art Piece");
    expect(start.value).toEqual(BigInt(101));
    expect(end.value).toEqual(BigInt(200));
  });

  it("rejects auction creation with empty description", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.blockHeight = 100;
    const result = contract.createAuction(
      101,
      200,
      1000,
      100,
      "",
      "NFT",
      "GalleryX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ITEM_DESCRIPTION);
  });

  it("rejects auction creation with max auctions exceeded", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.state.maxAuctions = 1;
    contract.blockHeight = 100;
    contract.createAuction(
      101,
      200,
      1000,
      100,
      "Item1",
      "NFT",
      "Loc1",
      "STX"
    );
    const result = contract.createAuction(
      101,
      200,
      2000,
      200,
      "Item2",
      "SIP10",
      "Loc2",
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_AUCTIONS_EXCEEDED);
  });

  it("sets escrow contract successfully", () => {
    const result = contract.setEscrowContract("ST2ESCROW");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.escrowContract).toBe("ST2ESCROW");
  });

  it("rejects invalid escrow contract", () => {
    const result = contract.setEscrowContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ORACLE);
  });
});