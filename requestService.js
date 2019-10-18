const zmq = require('zeromq');
const mqlib = require('./mqlib');
const Worker = require('./requestWorker');
const bluebird = require('bluebird');
const logger = require('../logger').logger('app');
const protocol = require('./protocol');
const crypto = require('../utils/crypto');
const co = require('co');
const compose = require('koa-compose');

let RequestService = function (opt) {
    this.gameServices = {};
    this.services = {};
    this.client = zmq.socket('req');
    this.setServiceName(opt.service,opt.id);
    this.init();
};

module.exports = RequestService;

let pro = RequestService.prototype;

pro.setServiceName = function (name,id) {
    this.serviceName = name;
    logger.debug('设置 RequestService 名称',name);
    id = id?id:"";
    this.client.identity = name+'_'+id;
};

pro.init = function () {
    let self = this;
    this.client.on('connect',function (fd,ep) {
        logger.debug(self.client.identity +' connect, endpoint:', ep);
        self.retrytimes = 0;
        self.connected = true;
    });

    this.client.on('disconnect',function (fd,ep) {
        this.timeoutHandler&&clearTimeout(this.timeoutHandler);
        //如果当前面有发送消息,断线则返回错误
        self.connected = false;
        setTimeout(function() { self.connect(self.url); }, Math.pow(2, self.retrytimes)*1000);
        self.retrytimes++;
    });

    this.client.on('message',function (msg) {
        logger.debug(self.client.identity,' on message:',msg);
        self.onReceiveReply(msg);
    });

    this.client.on('connect_delay', function(fd, ep) {
        logger.debug(self.client.identity,' connect_delay, endpoint:', ep);
    });

    this.client.on('connect_retry', function(fd, ep) {
        logger.debug(self.client.identity,' connect_delay, endpoint:', ep);
    });
    this.client.monitor(500,0);
};

//连接mqServer
pro.connect = function (url) {
    logger.debug('connect');
    this.client.connect(url);
    this.url = url;
};

//关闭客户端
pro.close = function () {
    this.client.close();
};

//创建处理前后文
pro.createContext = function () {

};


pro.onReceiveReply = function (msg) {
    logger.debug('后端服务收到消息',msg);
    let ctx = this.createContext(msg);
    const fn = co.wrap(compose(self.middleware));
    fn(ctx).catch(function (e) {
        logger.error(e);
    })
};


pro.replyMessage = function (msg) {
    this.client.send(msg);
};

//注册服务名,方法名,hash值
//TODO:这里如果两个服务器代码不一致hash也会不一致,会导致bug
pro.registerService = function () {
    this.client.send([protocol.createTypeBuffer(mqlib.MessageType.REGSERVICE),this.serviceName,this.services,this.gameServices,this.hash]);
};

//发送心跳包,心跳包包含当前服务所有方法的hash,如果hash不相等则服务需要更新注册
pro.heartbeat = function () {
    this.client.send([protocol.createTypeBuffer(mqlib.MessageType.HEART),this.hash]);
};

pro.register = function (route) {
    for (let i in route.gameServices) {
        this.gameServices[i] = route.gameServices[i];
    }
    for (let i in route.services) {
        this.services[i] = route.services[i];
    }
    this.handlerstrings = [];
    let handlerMergeStr = '';
    for (let i in this.gameServices) {
        let name = i;
        this.handlerstrings.push(name);
        handlerMergeStr+=name;
    }
    for (let i in this.services) {
        let name = i;
        this.handlerstrings.push(name);
        handlerMergeStr+=name;
    }
    this.hash = crypto.md5(handlerMergeStr);
};






