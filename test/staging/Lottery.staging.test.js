// @ts-nocheck

const { assert, expect } = require("chai")
const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name) ? describe.skip : describe("Lottery", testAll)

function testAll() {
    let lottery
    let deployer
    let entranceFee

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        lottery = await ethers.getContract("Lottery", deployer)
        entranceFee = await lottery.getEntranceFee()
    })

    describe("fulfillRandomWords", function () {
        it("Works with Chainlink Keepers and Chainlink VRF and auto-pick a winner", async function () {
            const startingTimestamp = await lottery.getLatestTimestamp()
            const accounts = await ethers.getSigners()
            const winnerIndex = 0
            let contractBalance = await ethers.provider.getBalance(lottery.address)
            let winnerStartingBalance = await accounts[winnerIndex].getBalance()
            console.log(`Contract Balance=${contractBalance.toString()}`)

            // This Promise won't complete until we get the WinnerPicked event and resolve() or reject() is called
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
                        // await expect(lottery.getPlayer(0)).to.be.reverted
                        assert.equal(lotteryStatus.toString(), "0")
                        assert.equal(recentWinner.toString(), accounts[winnerIndex].address)
                        assert(endingTimestamp > startingTimestamp)
                        assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(contractBalance).toString())
                        resolve()
                    } catch (e) {
                        console.log(e)
                        reject(e)
                    }
                })

                // Enter raffle
                const txBuyTicket = await lottery.buyTicket({ value: entranceFee })
                const txReceipt = await txBuyTicket.wait(1)
                winnerStartingBalance = await accounts[winnerIndex].getBalance()
                contractBalance = await ethers.provider.getBalance(lottery.address)
                console.log(`Contract Balance Updated=${contractBalance.toString()}`)
            })
        })
    })
}
