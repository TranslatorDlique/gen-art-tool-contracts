const ERC721Gen = artifacts.require("ERC721Gen.sol");
const UpgradeableBeaconTest = artifacts.require("UpgradeableBeaconTest.sol");
const ERC721GenFactoryTest = artifacts.require("ERC721GenFactoryTest.sol");

const truffleAssert = require('truffle-assertions');
const events = require("../library/events");
const fakeBlock = require("../library/fake-block");

contract("ERC721GenFactoryTest", accounts => {
  const transferProxy = accounts[8];
  const operatorProxy = accounts[7];
  const baseURI = "https://ipfs.rarible.com/"
  let beacon;
  let factory;

  beforeEach(async () => {
    const token = await ERC721Gen.new();
    beacon = await UpgradeableBeaconTest.new(token.address);
    factory = await ERC721GenFactoryTest.new(beacon.address, transferProxy, operatorProxy, baseURI);
  });

  it("should correctly deploy factory", async () => {
    assert.equal(await factory.beacon(), beacon.address, "beacon")
    assert.equal(await factory.transferProxy(), transferProxy, "transferProxy")
    assert.equal(await factory.operatorProxy(), operatorProxy, "operatorProxy")
    assert.equal(await factory.baseURI(), baseURI, "baseURI")
  });

  it("should correctly create token from factory", async () => {
    const trait1 = ["Test1", ["v1", "v2", "v3"], [1, 2, 9997]]
    const trait2 = ["Test2", ["v1", "v2", "v3"], [3333, 3333, 3334]]
    const traits = [trait1, trait2]
    const total = 3;
    const collectionRoyalties = [[accounts[5], 700]]
    const name = "Tc"
    const symbol = "T"
    const maxValue = 10;
    const initData = [name, symbol, collectionRoyalties, [trait1, trait2], total, maxValue];

    const artist = accounts[2]

    const tx = await factory.createCollection(...initData, { from: artist });

    const [CollectionCreatedEvent] = events(tx, "CollectionCreated");
    assert.equal(CollectionCreatedEvent.args.owner, artist, "CollectionCreatedEvent owner")

    const token = await ERC721Gen.at(CollectionCreatedEvent.args.collection)

    const GenArtTotalEvent = await token.getPastEvents("GenArtTotal", {
      fromBlock: tx.receipt.blockNumber,
      toBlock: tx.receipt.blockNumber
    });

    assert.equal(GenArtTotalEvent[0].args.total.toNumber(), total, "total supply")

    assert.equal(await token.owner(), artist, "artist is the owner")
    assert.equal(await token.total(), total, "total")
    assert.equal(await token.maxValue(), maxValue, "maxValue")
    assert.equal(await token.name(), name, "name")
    assert.equal(await token.symbol(), symbol, "symbol")

    //check traits
    const TraitsSet = await token.getPastEvents("TraitsSet", {
      fromBlock: tx.receipt.blockNumber,
      toBlock: tx.receipt.blockNumber
    });

    const traitsFromEvent = TraitsSet[0].args.traits
    for (let i = 0; i < traitsFromEvent.length; i++) {
      assert.equal(traitsFromEvent[i][0], traits[i][0], "trait name event")

      for (let j = 0; j < traitsFromEvent[i][1]; j++) {
        assert.equal(traitsFromEvent[i][1][j], traits[i][1][j], "trait keys names event")
      }

      for (let j = 0; j < traitsFromEvent[i][2]; j++) {
        assert.equal(traitsFromEvent[i][2][j], traits[i][1][j], "trait rarities event")
      }

    }

    const traitsFromGet = await token.getPossibleTraits();
    for (let i = 0; i < traitsFromGet.length; i++) {
      assert.equal(traitsFromGet[i][0], traits[i][0], "trait name get")

      for (let j = 0; j < traitsFromGet[i][1]; j++) {
        assert.equal(traitsFromGet[i][1][j], traits[i][1][j], "trait keys names get")
      }

      for (let j = 0; j < traitsFromGet[i][2]; j++) {
        assert.equal(traitsFromGet[i][2][j], traits[i][1][j], "trait rarities get")
      }

    }

    //check royalties
    const royalty = await token.getRaribleV2Royalties(0);
    assert.equal(royalty[0].account, collectionRoyalties[0][0], "get royalties account")
    assert.equal(royalty[0].value, collectionRoyalties[0][1], "get royalties value")

  });

  it("should be able to mint many tokens", async () => {
    const trait1 = ["Test1", ["v1", "v2", "v3"], [1000, 2000, 7000]]
    const trait2 = ["Test2", ["v1", "v2", "v3"], [3333, 3333, 3334]]
    const trait3 = ["Test3", ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10"], [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]]
    const total = 30;
    const collectionRoyalties = [[accounts[5], 700]]
    const name = "Tc"
    const symbol = "T"
    const maxValue = 10;
    const initData = [name, symbol, collectionRoyalties, [trait1, trait2, trait3], total, maxValue];

    const artist = accounts[2]
    const buyer = accounts[3];

    const tx = await factory.createCollection(...initData, { from: artist });
    const [CollectionCreatedEvent] = events(tx, "CollectionCreated");
    const token = await ERC721Gen.at(CollectionCreatedEvent.args.collection)

    const mintTx1 = await token.mint(artist, buyer, 10, { from: operatorProxy })
    console.log(mintTx1.receipt.gasUsed)
    const GenArtMint1 = await parseGenArtMint(token, mintTx1)
    assert.equal(GenArtMint1.length, 10, "length")

    let traitsFirst = {};
    for (const el of GenArtMint1) {
      traitsFirst[el] = (await token.getTokenTraits(el)).map(x => x.toString())
    }

    await truffleAssert.fails(
      token.mint(artist, buyer, 11, { from: operatorProxy }),
      truffleAssert.ErrorType.REVERT,
      "incorrect value of tokens to mint"
    )

    await truffleAssert.fails(
      token.mint(artist, buyer, 0, { from: operatorProxy }),
      truffleAssert.ErrorType.REVERT,
      "incorrect value of tokens to mint"
    )

    await truffleAssert.fails(
      token.mint(artist, buyer, 1, { from: transferProxy }),
      truffleAssert.ErrorType.REVERT,
      "OperatorRole: caller is not the operator"
    )

    await fakeBlock(accounts)
    for (const el of GenArtMint1) {
      const temp = (await token.getTokenTraits(el)).map(x => x.toString())
      for (let i = 0; i < temp.length; i++) {
        assert.equal(temp[i], traitsFirst[el][i], "getTraits returns same results")
      }
    }
  });

  async function parseGenArtMint(contract, tx) {
    const events = await contract.getPastEvents("GenArtMint", {
      fromBlock: tx.receipt.blockNumber,
      toBlock: tx.receipt.blockNumber
    });

    let result = []

    for (const ev of events) {
      result.push(ev.args.tokenId.toString())
    }
    return result;
  }

});