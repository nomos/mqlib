const zmq = require('zeromq');
const logger = require('../logger').logger('mq');
const crypto = require('../utils/crypto');
const mqlib = require('./mqlib');
const Buffer = require('buffer').Buffer;
const protocol = require('./protocol');
const RequestPool = require('./requestPool');
const RequestService = require('./requestService');
const db = require('../common/service/DbService').getInstance();
const utils = require('../utils/Utils');
const bluebird = require('bluebird');

//opt必须包含
let MqClient = function (opt) {
    if (opt.service) {
        this.reqService = new RequestService(opt);
    }
    this.reqPool = new RequestPool(opt);
};

utils.singleton(MqClient);

module.exports = MqClient;

let pro = MqClient.prototype;

pro.request = async function (msgtype,serverid,handler,msg,cb) {
    return new bluebird.fromCallback(this.reqPool.request.bind(msgtype,serverid,handler,msg)).asCallback(cb);
};

pro.route = function () {

};

//这里请求非特定服务,通过mq进行负载均衡
pro.routeService = function () {

};

//这里请求游戏服务,需路由到特定的服务器
pro.routeGameService = function () {

};
