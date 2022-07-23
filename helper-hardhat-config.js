const { ethers } = require("hardhat")

const networkConfig = {
    4: {
        name: "rinkeby",
        ethUsdPriceFeed: "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
        vrfCoordinatorV2: "0x6168499c0cFfCaCD319c818142124B7A15E857ab",
        entranceFee: ethers.utils.parseEther("0.001"),
        gasLane: "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
        subscriptionId: "0",
        callbackGasLimit: "200000",
        interval: "30",
    },
    31337: {
        entranceFee: ethers.utils.parseEther("0.001"),
        gasLane: "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
        callbackGasLimit: "200000",
        interval: "10",
    },
}

const developmentChains = ["hardhat", "localhost"]
const MOCK_DECIMALS = 8
const MOCK_ANSWER = 1200 * 10 ** MOCK_DECIMALS

module.exports = {
    networkConfig,
    developmentChains,
    MOCK_DECIMALS,
    MOCK_ANSWER,
}
