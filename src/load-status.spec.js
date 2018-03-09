const { expect } = require('chai');
const sinon = require('sinon');
const { MongoClient } = require('mongodb');
const loadStatus = require('./load-status');
const testReplsetIsMaster = require('../test/replset.isMaster.json');
const testReplsetReplSetGetStatus = require('../test/replset.replSetGetStatus.json');
const testShardIsMaster = require('../test/shard.isMaster.json');
const testShardListShards = require('../test/shard.listShards.json');
const testShardNodeIsMaster = require('../test/shard.node.isMaster.json');

const noop = () => {};

describe('load-status', () => {

  //  Create a sandbox for stubs, spies and mocks. Reset after each test.
  const sandbox = sinon.createSandbox();
  const stubbedDbs = {};

  beforeEach(() => {
    //  Any call to 'connect' returns one of our stubbed dbs,
    sandbox.stub(MongoClient, 'connect')
      .callsFake(async (connectionString) => {
        return {
          db: () => {
            if (!stubbedDbs[connectionString]) {
              //  TODO for some reason in the tests this does not bomb the runner...
              throw new Error(`DB with connection string '${connectionString}' has not been stubbed`);
            }
            return stubbedDbs[connectionString];
          },
          close: () => {}
        };
      });
  });

  afterEach(() => {
    sandbox.restore();
  });

  const stubDb = (connectionString) => {
    const stubbedDb = {
      command: noop
    };
    stubbedDbs[connectionString] = stubbedDb;
    return stubbedDb;
  };

  it('should be able to load the status of a replicaset', async () => {
    const replsetDb = stubDb('localhost');
    sandbox.stub(replsetDb, 'command')
      .withArgs({ isMaster: 1 })
      .callsFake(async () => { return testReplsetIsMaster; })
      .withArgs({ replSetGetStatus: 1 })
      .callsFake(async () => { return testReplsetReplSetGetStatus; });

    //  Load the status.
    const status = await loadStatus('localhost');

    //  Assert the expected shape.
    expect(status.configuration).to.equal('replicaset');
    expect(status.members.length).to.equal(3);
    const member0 = status.members[0];
    expect(member0.name).to.equal('mongo1.mongo-cluster.com:27017');
    expect(member0.state).to.equal(1);
  });


  it('should be able to load the status of a sharded cluster', async () => {
    const shardDb = stubDb('localhost');
    sandbox.stub(shardDb, 'command')
      .withArgs({ isMaster: 1 })
      .callsFake(async () => { return testShardIsMaster; })
      .withArgs({ listShards: 1 })
      .callsFake(async () => { return testShardListShards; });

    //  Create the shard db functions.
    const node1Db = stubDb('mongodb://mongod1.shard1.mongo-cluster.com:27017');
    sandbox.stub(node1Db, 'command')
      .withArgs({ isMaster: 1 })
      .callsFake(async () => { return testShardNodeIsMaster; });
    const node2Db = stubDb('mongodb://mongod2.shard1.mongo-cluster.com:27017');
    sandbox.stub(node2Db, 'command')
      .withArgs({ isMaster: 1 })
      .callsFake(async () => { return testShardNodeIsMaster; });
    const node3Db = stubDb('mongodb://mongod3.shard1.mongo-cluster.com:27017');
    sandbox.stub(node3Db, 'command')
      .withArgs({ isMaster: 1 })
      .callsFake(async () => { return testShardNodeIsMaster; });

    //  Load the status.
    const status = await loadStatus('localhost');

    //  Assert the expected shape.
    expect(status.configuration).to.equal('sharded');
    expect(status.shards.length).to.equal(3);
    const shard1 = status.shards[0];
    expect(shard1.id).to.equal('shard1');
    expect(shard1.hosts.length).to.equal(3);
    const host1 = shard1.hosts[0];
    expect(host1.status).to.equal('PRIMARY');
    expect(host1.host).to.equal('mongod1.shard1.mongo-cluster.com:27017');
  });
});