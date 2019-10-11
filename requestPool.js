let Worker = require('./requestWorker');
let bluebird = require('bluebird');
let logger = require('../logger').logger('app');

let RequestPool = function (opt) {
    this.host = opt.host;
    this.port = opt.port;
    this.name = opt.name;
    this.maxConnection = opt.maxConnection||10;
    this.idGenerator = 0;
    this.timeoutTime = 15*1000;
    this.freeConnection = [];
    this.aquiredConnection = [];
    this.allConnection = [];
};

module.exports = RequestPool;

function spliceConnection(array, connection) {
    let index;
    if ((index = array.indexOf(connection)) !== -1) {
        array.splice(index, 1);
    }
}

let pro = RequestPool.prototype;

pro.genId = function () {
    this.idGenerator++;
    return this.idGenerator;
};

pro.addWorker = function () {
    let worker = new Worker(this);
    worker.setIndentity(this.name+'_req_'+this.genId());
    worker.connect('tcp://'+this.host+':'+this.port);
    this.allConnection.push(worker);
    this.freeConnection.push(worker);
    return worker;
};

pro.request = async function (msgtype,serverid,handler,msg,cb) {
    let self = this;
    return new bluebird(function (resolve,reject) {
        self.getWorker(function (err,worker) {
            worker.sendRequest(msgtype,serverid,handler,msg,function (err,data) {
                if (err) {
                    reject(err);
                }
                resolve(data);
                self.freeWorker(worker);
            });
        });
    }).asCallback(cb);
};

pro.heart = async function () {
      let self = this;
};

pro.getAvailbleWorker = function () {
    if (!this.freeConnection.length) {
        if (this.maxConnection<=this.allConnection.length) {
            pro.addWorker();
        }
    }
    if (this.freeConnection.length) {
        return this.freeConnection.shift();
    }
};

pro.getWorker = function (cb) {
    let self = this;
    let worker = this.getAvailbleWorker();
    if (!worker) {
        process.nextTick(function () {
            self.getWorker(cb);
        });
    } else {
        cb(null,worker);
    }
};

pro.freeWorker = function (worker) {
    spliceConnection(this.aquiredConnection,worker);
    this.freeConnection.push(worker);
};

pro.removeWorker = function (worker) {
    worker.close();
    spliceConnection(this.aquiredConnection,worker);
    spliceConnection(this.allConnection,worker);
    spliceConnection(this.freeConnection,worker);
};