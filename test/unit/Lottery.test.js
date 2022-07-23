// @ts-nocheck

const { assert, expect } = require("chai")
const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) ? describe.skip : describe("Lottery", testAll)

function testAll() {
    let lottery
    let deployer, player
    let vrfCoordinatorV2Mock
    const chainId = network.config.chainId
    let entranceFee, interval

    beforeEach(async function () {
        await deployments.fixture("all")
        deployer = (await getNamedAccounts()).deployer
        player = (await getNamedAccounts()).player
        lottery = await ethers.getContract("Lottery", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        entranceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
    })

    describe("constructor", function () {
        it("Initialize the Lottery correctly", async function () {
            const lotteryStatus = await lottery.getLotteryStatus()
            const interval = await lottery.getInterval()
            assert.equal(lotteryStatus.toString(), "0")
            assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
    })

    describe("buyTicket", function () {
        it("Revert when player doesn't pay enough entrance fee", async function () {
            const entranceFeeForTesting = entranceFee - 1e6
            await expect(lottery.buyTicket({ value: entranceFeeForTesting })).to.be.revertedWith("Lottery__NotEnoughETH")
        })
        it("Record players when they buy ticket", async function () {
            const numPlayers = await lottery.getNumberOfPlayers()
            await lottery.buyTicket({ value: entranceFee })
            const playerAddressTest = await lottery.getPlayer(numPlayers)
            assert.equal(playerAddressTest, deployer)
        })
        it("Emit an event when buying ticket", async function () {
            await expect(lottery.buyTicket({ value: entranceFee })).to.emit(lottery, "TicketBought")
        })
        it("Revert when lottery is calculating", async function () {
            // Make sure checkUpKeep() would return true
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
            // Now we can performUpKeep() to lock down the lottery
            await lottery.performUpkeep([])
            await expect(lottery.buyTicket({ value: entranceFee })).to.be.revertedWith("Lottery__NotOpen")
        })
    })

    describe("checkUpkeep", function () {
        it("Return false if there's no ETH received yet", async function () {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
            // callStatic will simulate the transaction but doesn't execute it on-chain
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })
        it("Return false if lottery is calculating", async function () {
            // Make sure checkUpKeep() would return true
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
            // Now we can performUpKeep() to lock down the lottery
            await lottery.performUpkeep([])
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })
        it("Return false if not enough time passed", async function () {
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() - 3])
            await network.provider.send("evm_mine")
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })
        it("Return true if all conditions are met", async function () {
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert(upkeepNeeded)
        })
    })
    describe("performUpkeep", function () {
        it("Run successfully if checkUpkeep is true", async function () {
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
            const tx = await lottery.performUpkeep([])
            assert(tx)
        })
        it("Revert if checkUpkeep is false", async function () {
            await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded")
        })
        it("Update lottery status, emit event and trigger vrfCoordinator", async function () {
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")

            const txResponse = await lottery.performUpkeep([])
            const txReceipt = await txResponse.wait(1)
            const requestId = txReceipt.events[1].args.requestId
            const lotteryStatus = await lottery.getLotteryStatus()
            assert(requestId.toNumber() > 0)
            assert(lotteryStatus.toString() == "1")
        })
    })

    describe("fulfillRandomWords", function () {
        beforeEach(async function () {
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
        })
        it("Run successfully if checkUpkeep is true", async function () {
            await lottery.buyTicket({ value: entranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine")
            const tx = await lottery.performUpkeep([])
            assert(tx)
        })
        it("Can only be called after performUpkeep", async function () {
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith("nonexistent request")
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)).to.be.revertedWith("nonexistent request")
        })
        it("Pick a winner, reset the lottery, send money to the winner", async function () {
            const additionalEntrants = 3
            const startingAccountIndex = 1 // deployer index is 0
            const accounts = await ethers.getSigners()
            const winnerIndex = 1
            for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                const accountConnectedLottery = lottery.connect(accounts[i])
                await accountConnectedLottery.buyTicket({ value: entranceFee })
            }
            const startingTimestamp = await lottery.getLatestTimestamp()

            await new Promise(async (resolve, reject) => {
                lottery.once("WinnerPicked", async () => {
                    console.log("WinnerPicked emitted!")
                    try {
                        const recentWinner = await lottery.getRecentWinner()
                        const lotteryStatus = await lottery.getLotteryStatus()
                        const endingTimestamp = await lottery.getLatestTimestamp()
                        const numPlayers = await lottery.getNumberOfPlayers()
                        const winnerEndingBalance = await accounts[winnerIndex].getBalance()
                        assert.equal(numPlayers.toString(), "0")
                        await expect(lottery.getPlayer(0)).to.be.reverted
                        assert.equal(lotteryStatus.toString(), "0")
                        assert(endingTimestamp > startingTimestamp)
                        assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(entranceFee.mul(additionalEntrants).add(entranceFee)).toString())
                        resolve()
                    } catch (e) {
                        console.log(e)
                        reject(e)
                    }
                })
                // Fire the WinnerPicked event
                const tx = await lottery.triggerUpKeep()
                const txReceipt = await tx.wait(1)
                const winnerStartingBalance = await accounts[winnerIndex].getBalance()
                await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, lottery.address)
            })
        })
    })
}
