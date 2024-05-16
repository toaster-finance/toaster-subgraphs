### graph json configuration

```json
{
  "version": "0.1.0", // subgraph version
  "network": "arbitrum-one", //indexed network
  "Pool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  "PoolDataProvider": "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
  "UniPoolDataProvider": "0x145dE30c929a065582da84Cf96F88460dB9745A7", // Contract Address...
  "snapshotBatch": 5, // batch number, if investment exist 100, each 20 investment will be processed by handleBlock function  
  "startBlock": 7742429, // contract deployed
  "polling": 21600, // how many executed handleBlock function on every blocks?
  "startSnapshotBlock": 208141080
}
```
