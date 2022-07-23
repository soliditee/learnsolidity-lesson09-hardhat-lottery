const { run } = require("hardhat")

const verify = async function verify(contractAddress, args) {
    console.log("Verifying...")
    console.log("Contract arguments: " + JSON.stringify(args))
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        })
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Contract already verified")
        } else {
            console.log(e)
        }
    }
}

module.exports = { verify }
