import hre, { ethers } from "hardhat";
import * as tdr from "truffle-deploy-registry";
import { createHash } from "crypto";
const network = hre.hardhatArguments.network;

async function internal(
  Contract: any,
  contractName: any,
  args: any,
  from: any
) {
  let contract;
  console.log("args", args);
  if (from === null) {
    if (args.length === 0) {
      console.log("New Deployment without Args >", contractName);
      contract = await ethers.deployContract(contractName);
    } else {
      console.log("New Deployment wtith Args >", contractName, args);
      contract = await ethers.deployContract(contractName, [...args]);
    }
    console.log(contractName, "is deployed at : ", await contract.getAddress());
    await contract.waitForDeployment();
  } else {
    if (args.length === 0) {
      console.log("New Deployment without Args >", contractName);
      console.log(
        "From ==============================",
        await from.getAddress()
      );
      contract = await ethers.deployContract(contractName, { from: from });
    } else {
      console.log("New Deployment wtith Args >", contractName, args);
      contract = await ethers.deployContract(contractName, [...args], {
        from: from,
      });
    }
    await contract.waitForDeployment();
  }

  if (network && network !== "hardhat") {
    console.log("Verifiying Contract >", contractName);
    console.log("Contract params>", args);
    if (args.length === 0) {
      // await verifyContract(contract.address,[]);
    } else {
      // await verifyContract(contract.address, args);
    }
  }
  let append = args[0];
  if (args[0] === undefined) {
    append = "";
  }
  await tdr.append(contract.deploymentTransaction()?.chainId, {
    contractName: contractName + append,
    address: await contract.getAddress(),
    transactionHash: contract.deploymentTransaction()?.hash,
    byteCodeMd5: createHash("md5").update(Contract.bytecode).digest("hex"),
    args,
  });
  return contract;
}

async function verifyContract(contractsAddress: any, constructorArgs: any) {
  try {
    await hre.run("verify:verify", {
      address: contractsAddress,
      constructorArguments: constructorArgs,
    });
  } catch (e) {
    console.log("Error in verifying ", contractsAddress, " contract");
  }
}

async function getExistingContract(contractName: any, args: any) {
  const Contract = await ethers.getContractFactory(contractName);
  // console.log(Contract, "CC");
  console.log("contractName ", contractName + args[0]);
  let append = args[0];
  if (args[0] === undefined) {
    append = "";
  }
  const entry = await tdr.findLastByContractName(
    hre.network.config.chainId,
    contractName + append
  );
  if (entry) {
    const hash = entry.byteCodeMd5;
    if (hash === createHash("md5").update(Contract.bytecode).digest("hex")) {
      console.log("inside the hash");
      return await Contract.attach(entry.address);
    }
    return null;
  }
}

async function getExistingContractWithInstance(
  contractName: any,
  instance: any,
  args: any
) {
  let append = args[0];
  if (args[0] === undefined) {
    append = "";
  }
  const entry = await tdr.findLastByContractName(
    hre.network.config.chainId,
    contractName + append
  );
  if (entry) {
    const hash = entry.byteCodeMd5;
    if (hash === createHash("md5").update(instance.bytecode).digest("hex")) {
      return new ethers.Contract(entry.address, instance.interface);
    }
    return null;
  }
}
async function _deploy(contractName: any, args: any = [], from: any = null) {
  const Contract = await ethers.getContractFactory(contractName);

  if (network && network !== "") {
    const existingContract = await getExistingContract(contractName, args);
    if (existingContract) {
      console.log(
        "Deployment Already Exist. Skipping deployment >",
        contractName
      );
      return existingContract;
    }
  }
  return internal(Contract, contractName, args, from);
}

async function _deployWithLibrary(
  contractName: any,
  Contract: any,
  args: any = [],
  from: any = null
) {
  if (network && network !== "") {
    console.log("this is insode tif");
    const existingContract = await getExistingContractWithInstance(
      contractName,
      Contract,
      args
    );
    if (existingContract) {
      console.log(
        "Deployment Already Exist. Skipping deployment >",
        contractName
      );
      return existingContract;
    }
  }
  return internal(Contract, contractName, args, from);
}
export { _deploy, _deployWithLibrary };
