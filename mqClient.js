const zmq = require('zeromq');
const logger = require('../logger').logger('mq');
const crypto = require('../utils/crypto');
const mqlib = require('./mqlib');
const Buffer = require('buffer').Buffer;
const protocol = require('./protocol');
const RequestPool = require('./requestPool');
const RequestService = require('./requestService');
const db = require('../common/DbService').getInstance();
const utils = require('../utils/Utils');
const bluebird = require('bluebird');

let MqClient = function (opt) {
    if (opt.service) {
        this.reqService = new RequestService(opt);
    }
    this.reqPool = new RequestPool(opt);
};

module.exports = MqClient;

let pro = MqClient.prototype;

pro.request = async function (msgtype,serverid,handler,msg,cb) {
    return new bluebird.fromCallback(this.reqPool.request.bind(msgtype,serverid,handler,msg)).asCallback(cb);
};

pro.requestService = async function (service,handler,msg,cb) {
    return new bluebird.fromCallback(this.reqPool.request.bind(mqlib.MessageType.REQBALANCE,service,handler,msg)).asCallback(cb);
};

pro.requestServer = async function (serverid,handler,msg,cb) {
    return new bluebird.fromCallback(this.reqPool.request.bind(mqlib.MessageType.REQ,serverid,handler,msg)).asCallback(cb);
};

