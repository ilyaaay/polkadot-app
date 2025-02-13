const { ApiPromise, WsProvider } = require("@polkadot/api");
const express = require("express");
require("dotenv").config;
const fs = require("fs");

const app = express();
app.use(express.json());

const addresses = new Set();
const blocks = new Map();
const balances = new Map();

async function main() {
  const NODE_HOST = process.env.NODE_HOST || "ws://127.0.0.1";
  const NODE_PORT = process.env.NODE_PORT || 9944;

  const socket = `${NODE_HOST}:${NODE_PORT}`;
  const provider = new WsProvider(socket);

  const api = await ApiPromise.create({ provider });

  const [chain, nodeName, nodeVersion] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version(),
  ]);

  console.log(`Connected to chain ${chain} using ${nodeName} v${nodeVersion}`);

  api.rpc.chain.subscribeFinalizedHeads(async (header) => {
    const blockNumber = Number(header.number);
    const { hash } = await api.rpc.chain.getHeader();

    blocks.set(hash, blockNumber);

    fs.writeFileSync("block.json", JSON.stringify([...blocks]));

    for (const address of addresses) {
      const balance = await api.derive.balances.all(address);

      if (!balance.has(address)) {
        balances.set(address, new Map());
      }

      balances.get(address).set(blockNumber, String(balance.freeBalance));
    }
  });

  const APP_PORT = process.env.PORT || 3000;

  app.listen(APP_PORT, () =>
    console.log(`App listening at ${APP_PORT} port...`),
  );
}

app.get("/api/balances/:address/:block_no", (req, res) => {
  const { address, block_no } = req.params;
  if (!addresses.has(address)) {
    return res.status(404).send("Address not tracked");
  }

  const balanceMap = balances.get(address);
  if (!balanceMap || !balanceMap.has(Number(block_no))) {
    return res.status(202).send("Data not indexed yet");
  }

  res.send({ balance: balanceMap.get(Number(block_no)) });
});

app.post("/api/balances/:address", (req, res) => {
  const { address } = req.params;
  addresses.add(address);
  fs.writeFileSync("addresses.json", JSON.stringify([...addresses]));

  res.send("Address added to tracking");
});

main()
  .catch(console.error)
  .finally(() => process.exit());
